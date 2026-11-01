import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { app } from "../app.js";
import { closeAccountDatabase } from "./accountService.js";

test("Admin and dev account sign-in", async (t) => {
  const environment = { ...process.env };
  const root = await mkdtemp(path.join(tmpdir(), "qa-account-test-"));
  const db = await PGlite.create(path.join(root, "database"));
  const socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 4 });
  await socket.start();
  const databaseUrl = `postgresql://postgres:postgres@${socket.getServerConn()}/test`;
  Object.assign(process.env, {
    DATABASE_URL: databaseUrl,
    ADMIN_USERNAME: "QA-Admin", ADMIN_PASSWORD: "admin-test-password",
    DEV_USERNAME: "qa-dev", DEV_PASSWORD: "dev-test-password",
    TEST_ACCOUNT_SECRET: "test-only-secret-with-at-least-32-characters"
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const login = (username: string, password: string) => fetch(`${base}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password })
  });
  const cookieOf = (response: Response) => response.headers.get("set-cookie")?.split(";")[0] ?? "";

  try {
    await t.test("Anonymous visitors have no account section", async () => {
      const response = await fetch(`${base}/api/auth/session`);
      assert.deepEqual(await response.json(), { configured: true, account: null });
      assert.equal((await fetch(`${base}/api/account`)).status, 401);
    });

    await t.test("Wrong credentials are rejected without a cookie", async () => {
      const response = await login("qa-admin", "wrong-password");
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("set-cookie"), null);
      assert.equal((await login("nobody", "admin-test-password")).status, 401);
    });

    await t.test("Admin sign-in exposes the account and the configured account list", async () => {
      const response = await login("qa-admin", "admin-test-password");
      assert.equal(response.status, 200);
      const setCookie = response.headers.get("set-cookie") ?? "";
      assert.match(setCookie, /HttpOnly/);
      assert.match(setCookie, /SameSite=Strict/);
      const cookie = cookieOf(response);
      const session = await (await fetch(`${base}/api/auth/session`, { headers: { cookie } })).json() as { account: { username: string; role: string } };
      assert.equal(session.account.username, "qa-admin");
      assert.equal(session.account.role, "admin");
      const details = await (await fetch(`${base}/api/account`, { headers: { cookie } })).json() as { accounts: Array<{ username: string; role: string }> };
      assert.deepEqual(details.accounts.map((item) => [item.username, item.role]), [["qa-admin", "admin"], ["qa-dev", "dev"]]);

      const logout = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { cookie } });
      assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);
      const after = await (await fetch(`${base}/api/auth/session`, { headers: { cookie } })).json() as { account: unknown };
      assert.equal(after.account, null);
    });

    await t.test("Dev sign-in sees its own account but not the account list", async () => {
      const cookie = cookieOf(await login("qa-dev", "dev-test-password"));
      const details = await (await fetch(`${base}/api/account`, { headers: { cookie } })).json() as { account: { role: string }; accounts?: unknown };
      assert.equal(details.account.role, "dev");
      assert.equal(details.accounts, undefined);
    });

    await t.test("Signed-in users can add, edit, reveal and remove ring test accounts", async () => {
      const cookie = cookieOf(await login("qa-dev", "dev-test-password"));
      const send = (method: string, url: string, body?: unknown, headers: Record<string, string> = { cookie }) => fetch(`${base}${url}`, {
        method, headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined
      });
      assert.equal((await send("GET", "/api/test-accounts", undefined, {})).status, 401);
      assert.equal((await send("POST", "/api/test-accounts", { ring: "R0", username: "a@example.test", password: "x" }, {})).status, 401);

      const created = await send("POST", "/api/test-accounts", { ring: "R0", username: "user1@example.test", password: "fake-ring-pass", notes: "MFA: tester" });
      assert.equal(created.status, 201);
      const { account } = await created.json() as { account: { id: string; updatedBy: string } };
      assert.equal(account.updatedBy, "qa-dev");
      assert.equal((await send("POST", "/api/test-accounts", { ring: "R1", username: "USER1@example.test", password: "x" })).status, 409);
      assert.equal((await send("POST", "/api/test-accounts", { ring: "R9", username: "bad@example.test", password: "x" })).status, 400);

      const listed = await (await send("GET", "/api/test-accounts")).json() as { accounts: Array<Record<string, unknown>> };
      assert.equal(listed.accounts.length, 1);
      assert(!JSON.stringify(listed).includes("fake-ring-pass"));
      const reveal = async () => (await (await send("POST", `/api/test-accounts/${account.id}/reveal`, {})).json() as { password: string }).password;
      assert.equal(await reveal(), "fake-ring-pass");

      const pool = new Pool({ connectionString: databaseUrl, max: 1 });
      try {
        const stored = (await pool.query<{ password_encrypted: string }>("SELECT password_encrypted FROM qa_test_accounts")).rows[0];
        assert(!stored.password_encrypted.includes("fake-ring-pass"));
      } finally {
        await pool.end();
      }

      const kept = await send("PUT", `/api/test-accounts/${account.id}`, { ring: "R2", username: "user1@example.test", password: "", notes: "" });
      assert.equal(kept.status, 200);
      assert.equal(await reveal(), "fake-ring-pass");
      await send("PUT", `/api/test-accounts/${account.id}`, { ring: "R4", username: "user1@example.test", password: "rotated-pass", notes: "" });
      assert.equal(await reveal(), "rotated-pass");
      const updated = await (await send("GET", "/api/test-accounts")).json() as { accounts: Array<{ ring: string }> };
      assert.equal(updated.accounts[0].ring, "R4");

      assert.equal((await send("DELETE", `/api/test-accounts/${account.id}`)).status, 200);
      assert.equal((await send("DELETE", `/api/test-accounts/${account.id}`)).status, 404);
      const empty = await (await send("GET", "/api/test-accounts")).json() as { accounts: unknown[] };
      assert.equal(empty.accounts.length, 0);
    });

    await t.test("Passwords are stored hashed", async () => {
      const pool = new Pool({ connectionString: databaseUrl, max: 1 });
      try {
        const rows = (await pool.query<{ password_hash: string }>("SELECT password_hash FROM qa_accounts")).rows;
        assert.equal(rows.length, 2);
        for (const row of rows) {
          assert.match(row.password_hash, /^scrypt\$/);
          assert(!row.password_hash.includes("test-password"));
        }
      } finally {
        await pool.end();
      }
    });

    await t.test("Changing a password in the environment revokes the old password and sessions", async () => {
      const cookie = cookieOf(await login("qa-dev", "dev-test-password"));
      await closeAccountDatabase();
      process.env.DEV_PASSWORD = "dev-rotated-password";
      assert.equal((await login("qa-dev", "dev-test-password")).status, 401);
      const session = await (await fetch(`${base}/api/auth/session`, { headers: { cookie } })).json() as { account: unknown };
      assert.equal(session.account, null);
      assert.equal((await login("qa-dev", "dev-rotated-password")).status, 200);
    });

    await t.test("Repeated failures are rate limited", async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) await login("qa-admin", "bad-password");
      assert.equal((await login("qa-admin", "admin-test-password")).status, 429);
    });
  } finally {
    server.close();
    await closeAccountDatabase();
    await socket.stop();
    await db.close();
    await rm(root, { recursive: true, force: true });
    process.env = environment;
  }
});
