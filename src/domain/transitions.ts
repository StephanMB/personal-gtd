import type { Item, Status } from './model.ts';

/**
 * The GTD workflow as data: which lists an item may move to from each list.
 * The UI renders buttons from this table; it never decides the rules itself.
 */
export const TRANSITIONS: Readonly<Record<Status, readonly Status[]>> = {
  inbox: ['next', 'waiting', 'someday'],
  next: ['done', 'someday', 'inbox'],
  waiting: ['done', 'someday', 'inbox'],
  someday: ['next', 'inbox'],
  done: ['next'],
};

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Returns the moved item. Maintains the completedAt invariant.
 * Precondition: canTransition(item.status, to). Callers go through
 * operations.move(), which checks it.
 */
export function transition(item: Item, to: Status, now: number): Item {
  const { completedAt: _dropped, ...rest } = item;
  const moved: Item = { ...rest, status: to, updatedAt: now };
  if (to === 'done') moved.completedAt = now;
  return moved;
}
