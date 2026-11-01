import { z } from "zod";
import type { DirectoryRecord } from "../types.js";

export const deviceFields = z.object({
  serialGroup: z.number().int().min(0).max(1_000_000),
  owner: z.string().trim().min(1).max(200),
  device: z.string().trim().min(1).max(200),
  os: z.string().trim().max(100),
  completeOsVersion: z.string().trim().max(200),
  serialNo: z.string().trim().max(200),
  accessories: z.string().trim().max(2000),
  platform: z.enum(["Android", "iOS", "iPadOS", "Unknown"]),
  status: z.enum(["Active", "Obsolete"]),
  notes: z.string().trim().max(4000)
}).strict();

export const deviceRecord = deviceFields.extend({ id: z.string().min(1).max(100) });
export const directoryChange = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add"), record: deviceFields }).strict(),
  z.object({
    type: z.literal("update"), id: z.string().min(1).max(100),
    fields: deviceFields.partial().refine((fields) => Object.keys(fields).length > 0, "Provide at least one changed field.")
  }).strict(),
  z.object({ type: z.literal("delete"), id: z.string().min(1).max(100) }).strict()
]);
export const directoryChanges = z.array(directoryChange).min(1).max(50);
export const changeRequest = z.object({
  revision: z.number().int().nonnegative(),
  changes: directoryChanges
}).strict();
export type DirectoryChange = z.infer<typeof directoryChange>;

export interface DirectoryPreview {
  type: DirectoryChange["type"];
  before: DirectoryRecord | null;
  after: DirectoryRecord | null;
}

export class DirectoryError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export function previewDirectoryChanges(records: DirectoryRecord[], changes: DirectoryChange[]): DirectoryPreview[] {
  const parsed = directoryChanges.parse(changes);
  const touched = new Set<string>();
  return parsed.map((change, index) => {
    if (change.type === "add") {
      return { type: "add", before: null, after: { id: `new-${index + 1}`, ...change.record } };
    }
    if (touched.has(change.id)) throw new DirectoryError("A device can only be changed once in a batch.");
    touched.add(change.id);
    const before = records.find((record) => record.id === change.id);
    if (!before) throw new DirectoryError(`Device ${change.id} no longer exists. Refresh and retry.`, 409);
    if (change.type === "delete") return { type: "delete", before, after: null };
    const after = deviceRecord.parse({ ...before, ...change.fields });
    if (JSON.stringify(before) === JSON.stringify(after) ||
        Object.entries(change.fields).every(([key, value]) => before[key as keyof DirectoryRecord] === value)) {
      throw new DirectoryError(`No fields changed for ${change.id}.`);
    }
    return { type: "update", before, after };
  });
}
