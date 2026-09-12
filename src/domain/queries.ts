import { isLive, type Item, type Status } from './model.ts';

export function liveItems(items: Item[]): Item[] {
  return items.filter(isLive);
}

/**
 * Items shown in one list.
 *
 * The Inbox is ordered OLDEST first: GTD processes it in arrival order, and a
 * newest-first list reshuffles under you as you touch rows. Every other list
 * is newest first, and Done is ordered by when things were completed.
 */
export function itemsInStatus(items: Item[], status: Status): Item[] {
  const live = items.filter((item) => isLive(item) && item.status === status);
  if (status === 'inbox') return live.sort((a, b) => a.createdAt - b.createdAt);
  const key = (item: Item) => (status === 'done' ? (item.completedAt ?? item.updatedAt) : item.updatedAt);
  return live.sort((a, b) => key(b) - key(a));
}
