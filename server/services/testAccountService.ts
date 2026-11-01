import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { accountDatabase, AuthError } from "./accountService.js";

export const rings = ["R0", "R1", "R2", "R3", "R4"] as const;

export const testAccountInput = z.object({
  ring: z.enum(rings),
  username: z.email().trim().max(254),
  password: z.string().max(1024).default(""),
  notes: z.string().trim().max(500).default("")
}).strict();

export type TestAccountInput = z.infer<typeof testAccountInput>;

export interface TestAccount {
  id: string;
  ring: (typeof rings)[number];
  username: string;
  notes: string;
  updatedBy: string;
  updatedAt: string;
}

function encryptionKey() {
  const secret = process.env.TEST_ACCOUNT_SECRET;
  if (!secret || secret.length < 32) {
    throw new AuthError("Set TEST_ACCOUNT_SECRET (at least 32 characters) on the backend to store test account passwords.", 503);
  }
  return createHash("sha256").update(secret).digest();
}

function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${data.toString("base64")}`;
}

function decrypt(stored: string) {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== "v1" || !iv || !tag || data === undefined) throw new AuthError("Stored password is unreadable.", 500);
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new AuthError("Stored password could not be decrypted. TEST_ACCOUNT_SECRET may have changed.", 500);
  }
}

const toAccount = (row: { id: string; ring: TestAccount["ring"]; username: string; notes: string; updated_by: string; updated_at: Date }): TestAccount => ({
  id: row.id, ring: row.ring, username: row.username, notes: row.notes, updatedBy: row.updated_by, updatedAt: new Date(row.updated_at).toISOString()
});

function uniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

export async function listTestAccounts() {
  const connection = await accountDatabase();
  const result = await connection.query("SELECT id, ring, username, notes, updated_by, updated_at FROM qa_test_accounts ORDER BY ring, lower(username)");
  return result.rows.map(toAccount);
}

export async function revealTestAccountPassword(id: string) {
  const connection = await accountDatabase();
  const result = await connection.query<{ password_encrypted: string }>("SELECT password_encrypted FROM qa_test_accounts WHERE id = $1", [id]);
  if (!result.rows[0]) throw new AuthError("Test account not found.", 404);
  return decrypt(result.rows[0].password_encrypted);
}

export async function createTestAccount(input: TestAccountInput, actor: string) {
  if (!input.password) throw new AuthError("A password is required for a new test account.", 400);
  const connection = await accountDatabase();
  try {
    const result = await connection.query(`INSERT INTO qa_test_accounts (id, ring, username, password_encrypted, notes, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, ring, username, notes, updated_by, updated_at`,
    [randomUUID(), input.ring, input.username, encrypt(input.password), input.notes, actor]);
    return toAccount(result.rows[0]);
  } catch (error) {
    if (uniqueViolation(error)) throw new AuthError("A test account with this username already exists.", 409);
    throw error;
  }
}

export async function updateTestAccount(id: string, input: TestAccountInput, actor: string) {
  const connection = await accountDatabase();
  try {
    // A blank password keeps the existing one.
    const result = await connection.query(`UPDATE qa_test_accounts SET ring = $2, username = $3, notes = $4, updated_by = $5, updated_at = now(),
      password_encrypted = COALESCE($6, password_encrypted)
      WHERE id = $1 RETURNING id, ring, username, notes, updated_by, updated_at`,
    [id, input.ring, input.username, input.notes, actor, input.password ? encrypt(input.password) : null]);
    if (!result.rows[0]) throw new AuthError("Test account not found.", 404);
    return toAccount(result.rows[0]);
  } catch (error) {
    if (uniqueViolation(error)) throw new AuthError("A test account with this username already exists.", 409);
    throw error;
  }
}

export async function deleteTestAccount(id: string) {
  const connection = await accountDatabase();
  const result = await connection.query("DELETE FROM qa_test_accounts WHERE id = $1", [id]);
  if (!result.rowCount) throw new AuthError("Test account not found.", 404);
}
