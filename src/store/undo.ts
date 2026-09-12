import type { Item } from '../domain/model.ts';

/**
 * Generic undo, derived from state instead of written per command.
 *
 * Domain operations return new objects only for the items they change, so
 * comparing references between the list before and after a command yields
 * exactly what that command did. Undo puts the "before" versions back. No
 * command needs its own inverse, and a command added later is undoable for
 * free.
 */
export interface Change {
  before: Item | undefined; // undefined: the command created this item
  after: Item;
}

export function diff(before: Item[], after: Item[]): Change[] {
  const previous = new Map(before.map((item) => [item.id, item]));
  const changes: Change[] = [];
  for (const item of after) {
    const old = previous.get(item.id);
    if (old !== item) changes.push({ before: old, after: item });
  }
  return changes;
}

export type RevertResult =
  | { ok: true; items: Item[]; restored: Restored[] }
  | { ok: false; reason: 'undo-conflict' };

/** An item put back by an undo: what it looked like just before, and what it is now. */
export interface Restored {
  replacedUpdatedAt: number | undefined; // updatedAt of `before`, if there was one
  item: Item;
}

/**
 * Reverts `changes` in `items`. Refuses (all or nothing) when any affected
 * item was changed again since, e.g. in another tab: undoing then would
 * silently throw away that later change.
 *
 * The reverted versions get updatedAt = now. Undo is a new change, not time
 * travel; merge and sync must see it as the newest version.
 */
export function revert(items: Item[], changes: Change[], now: number): RevertResult {
  const current = new Map(items.map((item) => [item.id, item]));
  for (const { after } of changes) {
    if (current.get(after.id)?.updatedAt !== after.updatedAt) return { ok: false, reason: 'undo-conflict' };
  }
  const restored: Restored[] = [];
  for (const { before, after } of changes) {
    // Undoing a creation leaves a tombstone, like any other delete.
    const item = before ? { ...before, updatedAt: now } : { ...after, deletedAt: now, updatedAt: now };
    current.set(after.id, item);
    restored.push({ replacedUpdatedAt: before?.updatedAt, item });
  }
  return { ok: true, items: items.map((item) => current.get(item.id)!), restored };
}

/**
 * After an undo, older entries still expect the item as it was before that
 * undo bumped its updatedAt. Point them at the restored version, which is the
 * same content, so undoing twice in a row works instead of reporting a
 * conflict with itself.
 */
export function rebase<E extends { changes: Change[] }>(entries: readonly E[], restored: Restored[]): E[] {
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
