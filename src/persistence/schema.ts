import { isItem, type Item } from '../domain/model.ts';

/**
 * Stored document format.
 *   v1 (step 0/1): a bare array of items under "gtd:items".
 *   v2 (step 2):   { schemaVersion: 2, items } under "gtd:data";
 *                  items gain completedAt and deletedAt.
 */
export const SCHEMA_VERSION = 2;

export interface StoredDoc {
  schemaVersion: typeof SCHEMA_VERSION;
  items: Item[];
}

/**
 * MIGRATIONS[n] upgrades a version-n document to version n+1.
 * They take `unknown` on purpose: old data is untrusted input. They reshape
 * what they recognise and pass everything else through untouched; the single
 * isItem() check at the end of migrate() is the gate.
 *
 * Rules: a migration that has shipped is never edited, only followed by a new
 * one. Each gets a fixture test.
 */
const MIGRATIONS: Record<number, (doc: unknown) => unknown> = {
  1: (doc) => ({
    schemaVersion: 2,
    items: (doc as unknown[]).map((raw) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const item = raw as Record<string, unknown>;
      // Best available completion time for items finished before v2.
      if (item.status === 'done' && item.completedAt === undefined) {
        return { ...item, completedAt: item.updatedAt };
      }
      return item;
    }),
  }),
};

export function detectVersion(data: unknown): number | null {
  if (Array.isArray(data)) return 1;
  if (typeof data === 'object' && data !== null) {
    const version = (data as { schemaVersion?: unknown }).schemaVersion;
    if (typeof version === 'number' && Number.isInteger(version) && version >= 2) return version;
  }
  return null;
}

export type MigrateResult =
  | { kind: 'ok'; doc: StoredDoc; from: number; invalid: number }
  | { kind: 'corrupt' }
  | { kind: 'newer'; version: number };

export function migrate(data: unknown): MigrateResult {
  const from = detectVersion(data);
  if (from === null) return { kind: 'corrupt' };
  if (from > SCHEMA_VERSION) return { kind: 'newer', version: from };

  let doc = data;
  for (let v = from; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { kind: 'corrupt' };
    doc = step(doc);
  }

  const rawItems = (doc as { items?: unknown }).items;
  if (!Array.isArray(rawItems)) return { kind: 'corrupt' };
  const items = rawItems.filter(isItem);
  return { kind: 'ok', doc: { schemaVersion: SCHEMA_VERSION, items }, from, invalid: rawItems.length - items.length };
}
