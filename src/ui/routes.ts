import { STATUSES, type Status } from '../domain/model.ts';

/**
 * The URL scheme, as pure functions (tested without a browser).
 * One view per list for now; projects and the review get their own routes later.
 */
export type Route =
  | { view: 'list'; status: Status }
  | { view: 'clarify' }
  | { view: 'projects' }
  | { view: 'project'; id: string };

export const HOME: Route = { view: 'list', status: 'inbox' };

export function pathFor(route: Route): string {
  switch (route.view) {
    case 'clarify':
      return '/clarify';
    case 'projects':
      return '/projects';
    case 'project':
      return `/projects/${route.id}`;
    case 'list':
      return `/${route.status}`;
  }
}

/** null means "no such page": the app redirects home. */
export function parseRoute(pathname: string): Route | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return HOME;
  if (segments.length === 1) {
    if (segments[0] === 'clarify') return { view: 'clarify' };
    if (segments[0] === 'projects') return { view: 'projects' };
    if ((STATUSES as readonly string[]).includes(segments[0])) return { view: 'list', status: segments[0] as Status };
  }
  if (segments.length === 2 && segments[0] === 'projects') return { view: 'project', id: segments[1] };
  return null;
}
