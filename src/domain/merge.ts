import type { Item } from './model.ts';

export interface MergeResult {
  items: Item[];
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
 * Properties (see merge.test.ts): idempotent, never loses the newer copy.
 */
export function mergeItems(current: Item[], incoming: Item[]): MergeResult {
  const byId = new Map(current.map((item) => [item.id, item]));
  let added = 0;
  let updated = 0;
  let deleted = 0;
  for (const item of incoming) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      if (item.deletedAt === undefined) added++;
    } else if (item.updatedAt > existing.updatedAt) {
      byId.set(item.id, item);
      if (item.deletedAt !== undefined && existing.deletedAt === undefined) deleted++;
      else updated++;
    }
  }
  return { items: [...byId.values()], added, updated, deleted };
}
