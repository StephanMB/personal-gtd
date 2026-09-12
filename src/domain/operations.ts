import { createItem } from './capture.ts';
import { isLive, type Item, type Status, type StoredRecord } from './model.ts';
import { canTransition, transition } from './transitions.ts';

/**
 * Every change to the list is one of these pure functions. They never throw
 * for conditions a user can cause (e.g. acting on an item another tab just
 * changed): they return a failure the UI can explain.
 */
export type OpFailure = 'empty-input' | 'not-found' | 'not-allowed' | 'deleted' | 'not-deleted';
export type OpResult = { ok: true; items: Item[] } | { ok: false; reason: OpFailure };

function replace(items: Item[], updated: Item): Item[] {
  return items.map((item) => (item.id === updated.id ? updated : item));
}

export function capture(items: Item[], input: string, id: string, now: number): OpResult {
  if (input.trim() === '') return { ok: false, reason: 'empty-input' };
  return { ok: true, items: [...items, createItem(input, id, now)] };
}

export function move(items: Item[], id: string, to: Status, now: number): OpResult {
  const item = items.find((i) => i.id === id);
  if (!item) return { ok: false, reason: 'not-found' };
  if (!isLive(item)) return { ok: false, reason: 'deleted' };
  if (!canTransition(item.status, to)) return { ok: false, reason: 'not-allowed' };
  return { ok: true, items: replace(items, transition(item, to, now)) };
}

/** Soft delete: the item becomes a tombstone. */
export function remove(items: Item[], id: string, now: number): OpResult {
  const item = items.find((i) => i.id === id);
  if (!item) return { ok: false, reason: 'not-found' };
  if (!isLive(item)) return { ok: false, reason: 'deleted' };
  return { ok: true, items: replace(items, { ...item, deletedAt: now, updatedAt: now }) };
}

export function restore(items: Item[], id: string, now: number): OpResult {
  const item = items.find((i) => i.id === id);
  if (!item) return { ok: false, reason: 'not-found' };
  if (isLive(item)) return { ok: false, reason: 'not-deleted' };
  const { deletedAt: _dropped, ...rest } = item;
  return { ok: true, items: replace(items, { ...rest, updatedAt: now }) };
}

/**
 * Give an item a different title. Clarifying rewrites what you captured into
 * the next physical action: "Mom's birthday" becomes "Call the bakery".
 */
export function rename(items: Item[], id: string, title: string, now: number): OpResult {
  const trimmed = title.trim();
  if (trimmed === '') return { ok: false, reason: 'empty-input' };
  const item = items.find((i) => i.id === id);
  if (!item) return { ok: false, reason: 'not-found' };
  if (!isLive(item)) return { ok: false, reason: 'deleted' };
  if (item.title === trimmed) return { ok: true, items };
  return { ok: true, items: replace(items, { ...item, title: trimmed, updatedAt: now }) };
}

/**
 * The two-minute rule: something you just did is done, whatever list it was on.
 *
 * TRANSITIONS deliberately refuses inbox -> done, because the buttons on a list
 * must not let you tick off something you never clarified. Clarifying IS that
 * step, so the flow has its own way there rather than weakening the table.
 */
export function complete(items: Item[], id: string, now: number): OpResult {
  const item = items.find((i) => i.id === id);
  if (!item) return { ok: false, reason: 'not-found' };
  if (!isLive(item)) return { ok: false, reason: 'deleted' };
  if (item.status === 'done') return { ok: true, items };
  return { ok: true, items: replace(items, transition(item, 'done', now)) };
}

export const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** Drop tombstones older than the retention period, in any collection. */
export function purgeTombstones<T extends StoredRecord>(
  records: readonly T[],
  now: number,
  retentionMs = TOMBSTONE_RETENTION_MS,
): T[] {
  return records.filter((record) => record.deletedAt === undefined || now - record.deletedAt < retentionMs);
}
