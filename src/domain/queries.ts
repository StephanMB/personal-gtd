import { isLive, type Item, type Status } from './model.ts';

export function liveItems(items: Item[]): Item[] {
  return items.filter(isLive);
}

/** Items shown in one list, newest first. Done is ordered by completion. */
export function itemsInStatus(items: Item[], status: Status): Item[] {
  const key = (item: Item) => (status === 'done' ? (item.completedAt ?? item.updatedAt) : item.updatedAt);
  return items.filter((item) => isLive(item) && item.status === status).sort((a, b) => key(b) - key(a));
}
