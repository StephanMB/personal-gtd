import type { StoredRecord } from '../domain/model.ts';

/**
 * Generic undo, derived from state instead of written per command.
 *
 * Domain operations return new objects only for the records they change, so
 * comparing references between the list before and after a command yields
 * exactly what that command did. Undo puts the "before" versions back. No
 * command needs its own inverse, and a command added later is undoable for
 * free.
 *
 * Nothing here knows what an item is: it needs an id and an updatedAt, which
 * is what every stored record has. That is what lets a second collection
 * (projects) reuse all of it rather than growing a parallel copy.
 */
export interface Change<T extends StoredRecord = StoredRecord> {
  before: T | undefined; // undefined: the command created this record
  after: T;
}

export function diff<T extends StoredRecord>(before: readonly T[], after: readonly T[]): Change<T>[] {
  const previous = new Map(before.map((record) => [record.id, record]));
  const changes: Change<T>[] = [];
  for (const record of after) {
    const old = previous.get(record.id);
    if (old !== record) changes.push({ before: old, after: record });
  }
  return changes;
}

export type RevertResult<T extends StoredRecord> =
  | { ok: true; items: T[]; restored: Restored<T>[] }
  | { ok: false; reason: 'undo-conflict' };

/** A record put back by an undo: what it looked like just before, and what it is now. */
export interface Restored<T extends StoredRecord = StoredRecord> {
  replacedUpdatedAt: number | undefined; // updatedAt of `before`, if there was one
  item: T;
}

/**
 * Reverts `changes` in `items`. Refuses (all or nothing) when any affected
 * record was changed again since, e.g. in another tab: undoing then would
 * silently throw away that later change.
 *
 * The reverted versions get updatedAt = now. Undo is a new change, not time
 * travel; merge and sync must see it as the newest version.
 */
export function revert<T extends StoredRecord>(
  items: readonly T[],
  changes: readonly Change<T>[],
  now: number,
): RevertResult<T> {
  const current = new Map(items.map((record) => [record.id, record]));
  for (const { after } of changes) {
    if (current.get(after.id)?.updatedAt !== after.updatedAt) return { ok: false, reason: 'undo-conflict' };
  }
  const restored: Restored<T>[] = [];
  for (const { before, after } of changes) {
    // Undoing a creation leaves a tombstone, like any other delete.
    const record = before ? { ...before, updatedAt: now } : { ...after, deletedAt: now, updatedAt: now };
    current.set(after.id, record);
    restored.push({ replacedUpdatedAt: before?.updatedAt, item: record });
  }
  return { ok: true, items: items.map((record) => current.get(record.id)!), restored };
}

/**
 * After an undo, older entries still expect the record as it was before that
 * undo bumped its updatedAt. Point them at the restored version, which is the
 * same content, so undoing twice in a row works instead of reporting a
 * conflict with itself.
 */
export function rebase<T extends StoredRecord, E extends { changes: Change<T>[] }>(
  entries: readonly E[],
  restored: readonly Restored<T>[],
): E[] {
  const byId = new Map(restored.map((r) => [r.item.id, r]));
  return entries.map((entry) => {
    let touched = false;
    const changes = entry.changes.map((change) => {
      const r = byId.get(change.after.id);
      if (r && r.replacedUpdatedAt === change.after.updatedAt) {
        touched = true;
        return { ...change, after: r.item };
      }
      return change;
    });
    return touched ? { ...entry, changes } : entry;
  });
}
