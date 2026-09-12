import { STATUSES, type Status } from '../domain/model.ts';

/**
 * The URL scheme, as pure functions (tested without a browser).
 * One view per list for now; projects and the review get their own routes later.
 */
export type Route = { view: 'list'; status: Status };

export const HOME: Route = { view: 'list', status: 'inbox' };

export function pathFor(route: Route): string {
  return `/${route.status}`;
}

/** null means "no such page": the app redirects home. */
export function parseRoute(pathname: string): Route | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return HOME;
  if (segments.length === 1 && (STATUSES as readonly string[]).includes(segments[0])) {
    return { view: 'list', status: segments[0] as Status };
  }
  return null;
}
