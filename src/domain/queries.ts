import { isLive, type Item, type Project, type Status, type StoredRecord } from './model.ts';

/** Everything that is not a tombstone, in any collection. */
export function live<T extends StoredRecord>(records: readonly T[]): T[] {
  return records.filter(isLive);
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

/** Projects still being worked on, oldest first: the order you started them. */
export function activeProjects(projects: readonly Project[]): Project[] {
  return live(projects)
    .filter((project) => project.status === 'active')
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Every action belonging to a project, newest first; done ones last. */
export function actionsInProject(items: readonly Item[], projectId: string): Item[] {
  return live(items)
    .filter((item) => item.projectId === projectId)
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || b.updatedAt - a.updatedAt);
}

/**
 * Active projects that nothing is going to move: no next action and nothing
 * waiting on anyone. This is the query a plain list can never answer, and the
 * reason projects exist at all. Waiting counts as moving: the ball is with
 * someone else, which is not the same as having stopped.
 */
export function stalledProjects(projects: readonly Project[], items: readonly Item[]): Project[] {
  const moving = new Set(
    live(items)
      .filter((item) => item.projectId !== undefined && (item.status === 'next' || item.status === 'waiting'))
      .map((item) => item.projectId),
  );
  return activeProjects(projects).filter((project) => !moving.has(project.id));
}

const DAY = 24 * 60 * 60 * 1000;

/** Waiting-for older than this is worth chasing. */
export const STALE_WAITING_MS = 7 * DAY;
/** Someday untouched for this long is worth promoting or dropping. */
export const STALE_SOMEDAY_MS = 90 * DAY;

/**
 * The three queries the weekly review is made of. No new data: the most
 * valuable screen in the app is a handful of filters over what is already
 * there, which is what the layering was for.
 */
export function staleWaiting(items: readonly Item[], now: number, olderThan = STALE_WAITING_MS): Item[] {
  return live(items)
    .filter((item) => item.status === 'waiting' && now - item.updatedAt >= olderThan)
    .sort((a, b) => a.updatedAt - b.updatedAt);
}

export function untouchedSomeday(items: readonly Item[], now: number, olderThan = STALE_SOMEDAY_MS): Item[] {
  return live(items)
    .filter((item) => item.status === 'someday' && now - item.updatedAt >= olderThan)
    .sort((a, b) => a.updatedAt - b.updatedAt);
}

/** What you finished in a period: the part that makes a review feel worth doing. */
export function completedBetween(items: readonly Item[], from: number, to: number): Item[] {
  return live(items)
    .filter((item) => item.status === 'done' && item.completedAt !== undefined && item.completedAt >= from && item.completedAt <= to)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
}
