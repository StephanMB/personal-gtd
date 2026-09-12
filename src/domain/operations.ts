import { createItem } from './capture.ts';
import { isLive, type Item, type Project, type ProjectStatus, type Status, type StoredRecord } from './model.ts';
import { canTransition, transition } from './transitions.ts';

/**
 * Every change to the list is one of these pure functions. They never throw
 * for conditions a user can cause (e.g. acting on an item another tab just
 * changed): they return a failure the UI can explain.
 */
export type OpFailure = 'empty-input' | 'not-found' | 'not-allowed' | 'deleted' | 'not-deleted';
export type OpResult = { ok: true; items: Item[] } | { ok: false; reason: OpFailure };
/** For operations on the projects collection. */
export type ProjectOpResult = { ok: true; projects: Project[] } | { ok: false; reason: OpFailure };
/** For the one operation that changes both collections at once. */
export type DocOpResult = { ok: true; items: Item[]; projects: Project[] } | { ok: false; reason: OpFailure };

function replace(items: Item[], updated: Item): Item[] {
  return items.map((item) => (item.id === updated.id ? updated : item));
}

export interface CaptureOptions {
  /** The project it belongs to, when added from a project page. */
  projectId?: string;
  /**
   * Where it lands. Capturing goes to the inbox by definition; an action added
   * to a project has already been clarified, so it goes straight to next.
   */
  status?: Status;
}

export function capture(
  items: Item[],
  input: string,
  id: string,
  now: number,
  options: CaptureOptions = {},
): OpResult {
  if (input.trim() === '') return { ok: false, reason: 'empty-input' };
  const item = createItem(input, id, now);
  if (options.projectId !== undefined) item.projectId = options.projectId;
  if (options.status !== undefined) item.status = options.status;
  return { ok: true, items: [...items, item] };
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

function replaceProject(projects: Project[], updated: Project): Project[] {
  return projects.map((project) => (project.id === updated.id ? updated : project));
}

/**
 * Turn a captured item into the project it actually is.
 *
 * The item becomes the project and leaves a tombstone: keeping it as well
 * would leave an action with the project's own name, which is the outcome and
 * not a next action. Undo puts the item back and tombstones the project, which
 * is why undo works across collections.
 */
export function promote(
  items: Item[],
  projects: Project[],
  itemId: string,
  projectId: string,
  now: number,
): DocOpResult {
  const item = items.find((i) => i.id === itemId);
  if (!item) return { ok: false, reason: 'not-found' };
  if (!isLive(item)) return { ok: false, reason: 'deleted' };
  const project: Project = { id: projectId, title: item.title, status: 'active', createdAt: now, updatedAt: now };
  return {
    ok: true,
    items: replace(items, { ...item, deletedAt: now, updatedAt: now }),
    projects: [...projects, project],
  };
}

export function renameProject(projects: Project[], id: string, title: string, now: number): ProjectOpResult {
  const trimmed = title.trim();
  if (trimmed === '') return { ok: false, reason: 'empty-input' };
  const project = projects.find((p) => p.id === id);
  if (!project) return { ok: false, reason: 'not-found' };
  if (!isLive(project)) return { ok: false, reason: 'deleted' };
  if (project.title === trimmed) return { ok: true, projects };
  return { ok: true, projects: replaceProject(projects, { ...project, title: trimmed, updatedAt: now }) };
}

/** Finish or drop a project, keeping the completedAt invariant. */
export function setProjectStatus(
  projects: Project[],
  id: string,
  status: ProjectStatus,
  now: number,
): ProjectOpResult {
  const project = projects.find((p) => p.id === id);
  if (!project) return { ok: false, reason: 'not-found' };
  if (!isLive(project)) return { ok: false, reason: 'deleted' };
  if (project.status === status) return { ok: true, projects };
  const { completedAt: _dropped, ...rest } = project;
  const updated: Project = { ...rest, status, updatedAt: now };
  if (status === 'done') updated.completedAt = now;
  return { ok: true, projects: replaceProject(projects, updated) };
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
