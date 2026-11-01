import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Pool } from "pg";

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export type AccountRole = "admin" | "dev";

export interface Account {
  username: string;
  role: AccountRole;
  expiresAt: string;
}

export interface AccountSummary {
  username: string;
  role: AccountRole;
  updatedAt: string;
}

export class AuthError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export const SESSION_COOKIE = "qa_session";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const KEY_LENGTH = 64;
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; resetAt: number }>();

let pool: Pool | undefined;
let initialization: Promise<void> | undefined;

export function isAccountStoreConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function configuredAccounts() {
  const accounts: Array<{ username: string; password: string; role: AccountRole }> = [];
  for (const role of ["admin", "dev"] as const) {
    const prefix = role.toUpperCase();
    const username = process.env[`${prefix}_USERNAME`]?.trim();
    const password = process.env[`${prefix}_PASSWORD`];
    if (!username || !password) continue;
    if (password.length < 8) {
      console.warn(`${prefix}_PASSWORD must be at least 8 characters; the ${role} account was not enabled.`);
      continue;
    }
    accounts.push({ username: username.toLowerCase(), password, role });
  }
  if (new Set(accounts.map((account) => account.username)).size !== accounts.length) {
    throw new AuthError("ADMIN_USERNAME and DEV_USERNAME must be different.", 503);
  }
  return accounts;
}

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Used when the username is unknown so response time does not reveal which accounts exist.
const dummyHash = hashPassword(randomBytes(16).toString("hex"));

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export { database as accountDatabase };

async function database() {
  if (!process.env.DATABASE_URL) {
    throw new AuthError("Account sign-in requires DATABASE_URL on the backend.", 503);
  }
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 10_000 });
    pool.on("error", () => console.warn("An idle account database connection failed; subsequent operations will reconnect."));
  }
  if (!initialization) {
    initialization = initialize(pool).catch((error) => {
      initialization = undefined;
      if (error instanceof AuthError) throw error;
      throw new AuthError("Could not initialize the account database. Check DATABASE_URL and database permissions.", 503);
    });
  }
  await initialization;
  return pool;
}

async function initialize(connection: Pool) {
  const accounts = configuredAccounts();
  const client = await connection.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(729446302)");
    await client.query(`CREATE TABLE IF NOT EXISTS qa_accounts (
      username text PRIMARY KEY,
      role text NOT NULL CHECK (role IN ('admin', 'dev')),
      password_hash text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS qa_account_sessions (
      token_hash text PRIMARY KEY,
      username text NOT NULL REFERENCES qa_accounts(username) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS qa_test_accounts (
      id text PRIMARY KEY,
      ring text NOT NULL,
      username text NOT NULL,
      password_encrypted text NOT NULL,
      notes text NOT NULL DEFAULT '',
      updated_by text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query("CREATE UNIQUE INDEX IF NOT EXISTS qa_test_accounts_username ON qa_test_accounts (lower(username))");
    // Environment variables are the source of truth: removed or renamed accounts lose access.
    await client.query("DELETE FROM qa_accounts WHERE NOT (username = ANY($1::text[]))", [accounts.map((account) => account.username)]);
    for (const account of accounts) {
      const existing = await client.query<{ role: string; password_hash: string }>(
        "SELECT role, password_hash FROM qa_accounts WHERE username = $1", [account.username]);
      const row = existing.rows[0];
      if (row && row.role === account.role && await verifyPassword(account.password, row.password_hash)) continue;
      if (row) await client.query("DELETE FROM qa_account_sessions WHERE username = $1", [account.username]);
      await client.query(`INSERT INTO qa_accounts (username, role, password_hash, updated_at) VALUES ($1, $2, $3, now())
        ON CONFLICT (username) DO UPDATE SET role = EXCLUDED.role, password_hash = EXCLUDED.password_hash, updated_at = now()`,
      [account.username, account.role, await hashPassword(account.password)]);
    }
    await client.query("DELETE FROM qa_account_sessions WHERE expires_at <= now()");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function signIn(username: string, password: string, clientKey: string) {
  const normalized = username.trim().toLowerCase();
  const limiterKey = `${clientKey}|${normalized}`;
  const now = Date.now();
  const entry = failures.get(limiterKey);
  if (entry && entry.resetAt > now && entry.count >= MAX_FAILURES) {
    throw new AuthError("Too many failed sign-in attempts. Try again in 15 minutes.", 429);
  }
  const connection = await database();
  const result = await connection.query<{ role: AccountRole; password_hash: string }>(
    "SELECT role, password_hash FROM qa_accounts WHERE username = $1", [normalized]);
  const row = result.rows[0];
  const valid = await verifyPassword(password, row?.password_hash ?? await dummyHash);
  if (!row || !valid) {
    const current = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + FAILURE_WINDOW_MS };
    failures.set(limiterKey, { ...current, count: current.count + 1 });
    throw new AuthError("Invalid username or password.", 401);
  }
  failures.delete(limiterKey);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now + SESSION_TTL_MS);
  await connection.query("INSERT INTO qa_account_sessions (token_hash, username, expires_at) VALUES ($1, $2, $3)",
    [hashToken(token), normalized, expiresAt]);
  return { token, account: { username: normalized, role: row.role, expiresAt: expiresAt.toISOString() } satisfies Account };
}

export async function getSessionAccount(token: string | undefined): Promise<Account | null> {
  if (!token || !isAccountStoreConfigured()) return null;
  const connection = await database();
  const result = await connection.query<{ username: string; role: AccountRole; expires_at: Date }>(
    `SELECT a.username, a.role, s.expires_at FROM qa_account_sessions s
     JOIN qa_accounts a ON a.username = s.username
     WHERE s.token_hash = $1 AND s.expires_at > now()`, [hashToken(token)]);
  const row = result.rows[0];
  return row ? { username: row.username, role: row.role, expiresAt: new Date(row.expires_at).toISOString() } : null;
}

export async function signOut(token: string | undefined) {
  if (!token || !isAccountStoreConfigured()) return;
  const connection = await database();
  await connection.query("DELETE FROM qa_account_sessions WHERE token_hash = $1", [hashToken(token)]);
}

export async function listAccounts(): Promise<AccountSummary[]> {
  const connection = await database();
  const result = await connection.query<{ username: string; role: AccountRole; updated_at: Date }>(
    "SELECT username, role, updated_at FROM qa_accounts ORDER BY role, username");
  return result.rows.map((row) => ({ username: row.username, role: row.role, updatedAt: new Date(row.updated_at).toISOString() }));
}

export function readSessionCookie(cookieHeader: string | undefined) {
  for (const part of cookieHeader?.split(";") ?? []) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function sessionCookie(token: string, secure: boolean, maxAgeMs = SESSION_TTL_MS) {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    ...(secure ? ["Secure"] : [])
  ].join("; ");
}

export async function closeAccountDatabase() {
  await pool?.end();
  pool = undefined;
  initialization = undefined;
  failures.clear();
}
