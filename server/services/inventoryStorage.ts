import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { z } from "zod";
import type { DirectoryRecord } from "../types.js";
import { deviceRecord, DirectoryError, previewDirectoryChanges } from "./directorySchema.js";
import type { DirectoryChange } from "./directorySchema.js";

let pool: Pool | undefined;
let initialization: Promise<void> | undefined;
const snapshotSchema = z.object({ revision: z.number().int().nonnegative(), records: z.array(deviceRecord) });

export interface InventorySnapshot {
  revision: number;
  records: DirectoryRecord[];
  persistence: "postgres" | "unconfigured";
  message: string;
}

async function database(seed: DirectoryRecord[]) {
  if (!process.env.DATABASE_URL) throw new DirectoryError("Configure DATABASE_URL on the backend to enable shared, persistent device editing.", 503);
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 10_000
    });
    pool.on("error", () => console.warn("An idle inventory database connection failed; subsequent operations will reconnect."));
  }
  if (!initialization) {
    initialization = initialize(pool, seed).catch(() => {
      initialization = undefined;
      throw new DirectoryError("Could not initialize the shared inventory database. Check DATABASE_URL, TLS and database permissions. Nothing was saved.", 503);
    });
  }
  await initialization;
  return pool;
}

async function initialize(connection: Pool, seed: DirectoryRecord[]) {
  const client = await connection.connect();
  try {
    await client.query("BEGIN");
    // Serialize first-run schema creation across dashboard instances.
    await client.query("SELECT pg_advisory_xact_lock(729446301)");
    await client.query(`CREATE TABLE IF NOT EXISTS qa_inventory_state (
      id integer PRIMARY KEY CHECK (id = 1), revision integer NOT NULL CHECK (revision >= 0)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS qa_device_inventory (
      id text PRIMARY KEY, record jsonb NOT NULL CHECK (record->>'id' = id)
    )`);
    const inserted = await client.query("INSERT INTO qa_inventory_state (id, revision) VALUES (1, 0) ON CONFLICT DO NOTHING RETURNING id");
    if (inserted.rowCount) {
      for (const record of seed) {
        await client.query("INSERT INTO qa_device_inventory (id, record) VALUES ($1, $2::jsonb)", [record.id, JSON.stringify(deviceRecord.parse(record))]);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function readSnapshot(connection: Pick<Pool, "query">): Promise<InventorySnapshot> {
  const result = await connection.query(`SELECT revision,
    (SELECT COALESCE(jsonb_agg(record ORDER BY id), '[]'::jsonb) FROM qa_device_inventory) AS records
    FROM qa_inventory_state WHERE id = 1`);
  const snapshot = snapshotSchema.parse(result.rows[0]);
  return { ...snapshot, persistence: "postgres", message: "Shared PostgreSQL inventory. Saved changes are visible to all connected dashboard instances." };
}

export async function getInventorySnapshot(seed: DirectoryRecord[]): Promise<InventorySnapshot> {
  if (!process.env.DATABASE_URL) {
    return {
      revision: 0, records: structuredClone(seed), persistence: "unconfigured",
      message: "Read-only starter inventory. Configure DATABASE_URL on the backend to save changes across users and deployments."
    };
  }
  try {
    return await readSnapshot(await database(seed));
  } catch (error) {
    if (error instanceof DirectoryError) throw error;
    throw new DirectoryError("The shared inventory could not be loaded. Check database connectivity; no local fallback was substituted.", 503);
  }
}

export async function saveInventoryChanges(seed: DirectoryRecord[], revision: number, changes: DirectoryChange[]) {
  const connection = await database(seed);
  const client = await connection.connect().catch(() => {
    throw new DirectoryError("The shared database is unavailable. Nothing was saved.", 503);
  });
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT revision FROM qa_inventory_state WHERE id = 1 FOR UPDATE");
    if (current.rows[0]?.revision !== revision) {
      throw new DirectoryError("Someone changed the inventory after you opened this editor or preview. Refresh and review your changes again. Nothing was overwritten.", 409);
    }
    const snapshot = await readSnapshot(client);
    const preview = previewDirectoryChanges(snapshot.records, changes);
    for (const change of preview) {
      if (change.type === "add" && change.after) {
        const record = { ...change.after, id: `DEV-${randomUUID()}` };
        await client.query("INSERT INTO qa_device_inventory (id, record) VALUES ($1, $2::jsonb)", [record.id, JSON.stringify(record)]);
      } else if (change.after) {
        await client.query("UPDATE qa_device_inventory SET record = $2::jsonb WHERE id = $1", [change.after.id, JSON.stringify(change.after)]);
      } else if (change.before) {
        await client.query("DELETE FROM qa_device_inventory WHERE id = $1", [change.before.id]);
      }
    }
    await client.query("UPDATE qa_inventory_state SET revision = revision + 1 WHERE id = 1");
    const result = await readSnapshot(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => console.warn("Inventory connection lost during rollback; refresh to verify the latest saved revision."));
    if (error instanceof DirectoryError) throw error;
    throw new DirectoryError("The database could not confirm this save. Refresh the inventory before retrying; no success has been reported.", 503);
  } finally {
    client.release();
  }
}

export async function closeInventoryDatabase() {
  await pool?.end();
  pool = undefined;
  initialization = undefined;
}
