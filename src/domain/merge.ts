import type { StoredRecord } from './model.ts';

export interface MergeResult<T extends StoredRecord> {
  items: T[];
  added: number;
  updated: number;
  deleted: number;
}

/**
 * Merge by id; for an id present on both sides the copy with the newer
 * updatedAt wins (ties keep `current`). Because deletions are tombstones with
 * a bumped updatedAt, they win over older live copies too, so importing an old
 * backup cannot resurrect something deleted since.
 *
 * Generic over stored records for the same reason undo is: a second collection
 * merges with this function rather than a copy of it.
 *
 * Properties (see merge.test.ts): idempotent, never loses the newer copy.
 */
export function mergeRecords<T extends StoredRecord>(current: readonly T[], incoming: readonly T[]): MergeResult<T> {
  const byId = new Map(current.map((record) => [record.id, record]));
  let added = 0;
  let updated = 0;
  let deleted = 0;
  for (const record of incoming) {
    const existing = byId.get(record.id);
    if (!existing) {
      byId.set(record.id, record);
      if (record.deletedAt === undefined) added++;
    } else if (record.updatedAt > existing.updatedAt) {
      byId.set(record.id, record);
      if (record.deletedAt !== undefined && existing.deletedAt === undefined) deleted++;
      else updated++;
    }
  }
  return { items: [...byId.values()], added, updated, deleted };
}
