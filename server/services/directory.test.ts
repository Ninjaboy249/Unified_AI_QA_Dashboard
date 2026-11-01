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
import { planDirectoryChanges, saveDirectoryChanges, searchDirectory, seedRecords } from "./directoryService.js";
import { changeRequest, DirectoryError, previewDirectoryChanges } from "./directorySchema.js";
import { closeInventoryDatabase } from "./inventoryStorage.js";

test("Shared device inventory with PostgreSQL persistence", async (t) => {
  const environment = { ...process.env };
  const originalFetch = globalThis.fetch;
  const root = await mkdtemp(path.join(tmpdir(), "qa-inventory-test-"));
  let db = await PGlite.create(path.join(root, "database"));
  let socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 4 });
  await socket.start();
  const databaseUrl = () => `postgresql://test:test@${socket.getServerConn()}/test`;
  process.env.DATABASE_URL = databaseUrl();
  process.env.OPENAI_API_KEY = "test-only-key";
  process.env.OPENAI_BASE_URL = "https://ai.example.invalid/v1";
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (url: string, body: unknown) => originalFetch(`${base}${url}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  try {
    await t.test("Missing database configuration is explicitly read-only", async () => {
      delete process.env.DATABASE_URL;
      const snapshot = await searchDirectory("");
      assert.equal(snapshot.persistence, "unconfigured");
      assert.equal(snapshot.records.length, seedRecords.length);
      await assert.rejects(saveDirectoryChanges(0, [{ type: "delete", id: seedRecords[0].id }]), (error) =>
        error instanceof DirectoryError && error.status === 503);
      process.env.DATABASE_URL = databaseUrl();
    });

    await t.test("First connection seeds inventory once and exposes a shared revision", async () => {
      const snapshot = await searchDirectory("");
      assert.equal(snapshot.persistence, "postgres");
      assert.equal(snapshot.revision, 0);
      assert.equal(snapshot.records.length, seedRecords.length);
      const response = await originalFetch(`${base}/api/directory/search?q=Anjna`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const filtered = await response.json() as { records: typeof seedRecords; revision: number };
      assert(filtered.records.every((record) => record.owner === "Anjna"));
      assert.equal(filtered.revision, 0);
    });

    await t.test("Every editable field can be changed without modifying a user's other devices", async () => {
      const before = await searchDirectory("");
      const target = seedRecords[0];
      const fields = {
        serialGroup: 20, owner: "QA Owner", device: "Replacement iPad", platform: "iPadOS" as const,
        os: "19", completeOsVersion: "19.1", serialNo: "INTEGRATION-123",
        accessories: "Cable", status: "Obsolete" as const, notes: "Reassigned by test"
      };
      const saved = await saveDirectoryChanges(before.revision, [{ type: "update", id: target.id, fields }]);
      assert.deepEqual(saved.records.find((record) => record.id === target.id), { id: target.id, ...fields });
      assert.deepEqual(saved.records.filter((record) => record.id !== target.id), before.records.filter((record) => record.id !== target.id));
      assert.equal(saved.revision, before.revision + 1);
      assert.equal((await searchDirectory("INTEGRATION-123")).records.length, 1);
    });

    await t.test("Adding another device for the same owner preserves all existing rows", async () => {
      const before = await searchDirectory("");
      const original = seedRecords[1];
      const { id: _id, ...fields } = original;
      const saved = await saveDirectoryChanges(before.revision, [{
        type: "add", record: { ...fields, device: "iPhone 16", serialNo: "NEW-DEVICE-123" }
      }]);
      assert.equal(saved.records.length, before.records.length + 1);
      const added = saved.records.find((record) => record.serialNo === "NEW-DEVICE-123");
      assert(added);
      assert.notEqual(added.id, original.id);
      assert.equal(added.owner, original.owner);
      assert.deepEqual(saved.records.find((record) => record.id === original.id), original);
    });

    await t.test("Stale edits are rejected instead of overwriting newer saves", async () => {
      const before = await searchDirectory("");
      await saveDirectoryChanges(before.revision, [{ type: "update", id: seedRecords[1].id, fields: { notes: "Newest edit" } }]);
      await assert.rejects(saveDirectoryChanges(before.revision, [{ type: "update", id: seedRecords[1].id, fields: { notes: "Stale edit" } }]),
        (error) => error instanceof DirectoryError && error.status === 409);
      assert.equal((await searchDirectory("")).records.find((record) => record.id === seedRecords[1].id)?.notes, "Newest edit");
    });

    await t.test("A database error rolls back every change in a batch and its revision", async () => {
      const before = await searchDirectory("");
      await db.exec("ALTER TABLE qa_device_inventory ADD CONSTRAINT fixture_reject CHECK (record->>'notes' <> 'reject-integration-test')");
      try {
        await assert.rejects(saveDirectoryChanges(before.revision, [
          { type: "update", id: seedRecords[1].id, fields: { notes: "Must roll back" } },
          { type: "update", id: seedRecords[2].id, fields: { notes: "reject-integration-test" } }
        ]), (error) => error instanceof DirectoryError && error.status === 503);
        assert.deepEqual(await searchDirectory(""), before);
      } finally {
        await db.exec("ALTER TABLE qa_device_inventory DROP CONSTRAINT fixture_reject");
      }
    });

    await t.test("Invalid fields, immutable IDs, missing targets and repeated targets fail", async () => {
      const before = await searchDirectory("");
      assert.equal(changeRequest.safeParse({ revision: 0, changes: [{ type: "update", id: "DEV-001", fields: { id: "hijacked" } }] }).success, false);
      assert.equal(changeRequest.safeParse({ revision: 0, changes: [{ type: "update", id: "DEV-001", fields: { serialGroup: -1 } }] }).success, false);
      assert.throws(() => previewDirectoryChanges(before.records, [
        { type: "delete", id: seedRecords[1].id }, { type: "update", id: seedRecords[1].id, fields: { notes: "Repeat" } }
      ]), /only be changed once/);
      assert.throws(() => previewDirectoryChanges(before.records, [{ type: "update", id: "missing", fields: { notes: "bad target" } }]), /no longer exists/);
      const target = before.records[0];
      assert.throws(() => previewDirectoryChanges(before.records, [{ type: "update", id: target.id, fields: { notes: target.notes } }]), /No fields changed/);
      const response = await post("/api/directory/changes", { revision: before.revision, changes: [{ type: "update", id: target.id, fields: { status: "Invalid" } }] });
      assert.equal(response.status, 400);
      assert.deepEqual(await searchDirectory(""), before);
    });

    await t.test("A single AI prompt can propose multiple changes but never saves them", async () => {
      const before = await searchDirectory("");
      const changes = [
        { type: "update", id: seedRecords[1].id, fields: { os: "19", completeOsVersion: "19.2" } },
        { type: "update", id: seedRecords[2].id, fields: { status: "Obsolete" } }
      ];
      globalThis.fetch = async (_url, init) => {
        assert.match(String(init?.body), /Owner names are not unique devices/);
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
          summary: "Update iPhone OS and retire the Samsung device.", clarification: "", changes
        }) } }] }));
      };
      const response = await post("/api/directory/plan", { prompt: "Update DEV-002 to iOS 19.2 and mark DEV-003 obsolete", revision: before.revision });
      assert.equal(response.status, 200);
      const proposal = await response.json() as { changes: typeof changes; preview: unknown[]; revision: number };
      assert.equal(proposal.preview.length, 2);
      assert.deepEqual(await searchDirectory(""), before);
      const saved = await post("/api/directory/changes", { revision: proposal.revision, changes: proposal.changes });
      assert.equal(saved.status, 200);
      const after = await searchDirectory("");
      assert.equal(after.records.find((record) => record.id === seedRecords[1].id)?.completeOsVersion, "19.2");
      assert.equal(after.records.find((record) => record.id === seedRecords[2].id)?.status, "Obsolete");
      assert.equal(after.revision, before.revision + 1);
    });

    await t.test("Ambiguous prompts and unavailable AI do not mutate inventory", async () => {
      const before = await searchDirectory("");
      globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        summary: "", clarification: "Which Anjna device? Specify its ID or serial number.", changes: []
      }) } }] }));
      await assert.rejects(planDirectoryChanges("Change Anjna device", before.revision), (error) =>
        error instanceof DirectoryError && error.status === 422 && /Which Anjna/.test(error.message));
      globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
      await assert.rejects(planDirectoryChanges("Change Anjna device", before.revision), (error) =>
        error instanceof DirectoryError && error.status === 503);
      assert.deepEqual(await searchDirectory(""), before);
    });

    await t.test("Saved data survives database and application connection restarts", async () => {
      const before = await searchDirectory("");
      await closeInventoryDatabase();
      await socket.stop();
      await db.close();
      db = await PGlite.create(path.join(root, "database"));
      socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 4 });
      await socket.start();
      process.env.DATABASE_URL = databaseUrl();
      assert.deepEqual(await searchDirectory(""), before);
    });

    await t.test("Independent database clients see saved changes and the API sees external revisions", async () => {
      const before = await searchDirectory("");
      const other = new Pool({ connectionString: databaseUrl(), max: 1 });
      const client = await other.connect();
      try {
        const selected = await client.query("SELECT record FROM qa_device_inventory WHERE id = $1", [seedRecords[0].id]);
        assert.deepEqual(selected.rows[0].record, before.records.find((record) => record.id === seedRecords[0].id));
        await client.query("BEGIN");
        await client.query("SELECT revision FROM qa_inventory_state WHERE id = 1 FOR UPDATE");
        await client.query("UPDATE qa_device_inventory SET record = jsonb_set(record, '{notes}', to_jsonb($2::text)) WHERE id = $1",
          [seedRecords[0].id, "Saved from a second dashboard connection"]);
        await client.query("UPDATE qa_inventory_state SET revision = revision + 1 WHERE id = 1");
        await client.query("COMMIT");
        const refreshed = await searchDirectory("");
        assert.equal(refreshed.records.find((record) => record.id === seedRecords[0].id)?.notes, "Saved from a second dashboard connection");
        assert.equal(refreshed.revision, before.revision + 1);
      } finally {
        client.release();
        await other.end();
      }
    });

    await t.test("Deleting rows is persistent and an empty inventory is never reseeded", async () => {
      const before = await searchDirectory("");
      const result = await saveDirectoryChanges(before.revision, before.records.map((record) => ({ type: "delete", id: record.id })));
      assert.equal(result.records.length, 0);
      await closeInventoryDatabase();
      const reloaded = await searchDirectory("");
      assert.equal(reloaded.records.length, 0);
      assert.equal(reloaded.revision, result.revision);
    });

    await t.test("A disconnected configured database never returns starter data", async () => {
      await closeInventoryDatabase();
      await socket.stop();
      await assert.rejects(searchDirectory(""), (error) => error instanceof DirectoryError && error.status === 503);
    });
  } finally {
    globalThis.fetch = originalFetch;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await closeInventoryDatabase();
    await socket.stop();
    await db.close();
    await rm(root, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
    Object.assign(process.env, environment);
  }
});
