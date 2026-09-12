export type Status = 'inbox' | 'next' | 'waiting' | 'someday' | 'done';

export const STATUSES: readonly Status[] = ['inbox', 'next', 'waiting', 'someday', 'done'];

/**
 * What undo and merge need from anything stored: an identity, a version, and
 * a way to be gone. Items have it; the next collection will have it too, which
 * is why those two mechanisms are written against this and not against Item.
 */
export interface StoredRecord {
  id: string;
  updatedAt: number;
  deletedAt?: number;
}

/**
 * Schema version 2.
 * - completedAt: set exactly when status === 'done'.
 * - deletedAt:   set on a tombstone. Tombstones stay in storage (so deletions
 *                survive merges and imports) but are hidden from every view.
 * - updatedAt:   bumped on EVERY change, including delete and restore; merge
 *                relies on it to decide which copy is newer.
 */
export interface Item extends StoredRecord {
  id: string;
  title: string;
  context?: string;
  status: Status;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  deletedAt?: number;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Runtime check for data we did not produce in this session (storage, imports). */
export function isItem(value: unknown): value is Item {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    !(
      typeof v.id === 'string' &&
      v.id.length > 0 &&
      typeof v.title === 'string' &&
      (v.context === undefined || typeof v.context === 'string') &&
      typeof v.status === 'string' &&
      (STATUSES as readonly string[]).includes(v.status) &&
      isTimestamp(v.createdAt) &&
      isTimestamp(v.updatedAt) &&
      (v.completedAt === undefined || isTimestamp(v.completedAt)) &&
      (v.deletedAt === undefined || isTimestamp(v.deletedAt))
    )
  ) {
    return false;
  }
  // Invariant: completedAt exists if and only if the item is done.
  return (v.status === 'done') === (v.completedAt !== undefined);
}

export function isLive(item: Item): boolean {
  return item.deletedAt === undefined;
}
