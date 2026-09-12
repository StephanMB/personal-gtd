import type { Item, Project } from '../domain/model.ts';
import { itemsInStatus, live, stalledProjects } from '../domain/queries.ts';
import type { Settings } from '../persistence/schema.ts';

/**
 * Just-in-time explanation.
 *
 * This app makes assumptions about how it will be used, and most of them are
 * invisible until they surprise you: that the inbox is processed oldest first,
 * that a project without a next action has quietly stopped, that export is the
 * only real backup. None of that is worth a manual nobody reads, and all of it
 * is worth one sentence at the moment it applies.
 *
 * So each hint is attached to the control it is about, appears only when the
 * situation it explains is actually true, and never returns once it has been
 * used or waved away. The rules are pure and live here; the wording lives in
 * copy.ts like every other string.
 */
export type HintId =
  | 'capture-context'
  | 'clarify-inbox'
  | 'clarify-keys'
  | 'project-first-action'
  | 'stalled-projects'
  | 'export-backup'
  | 'review-cadence';

export interface HintContext {
  items: readonly Item[];
  projects: readonly Project[];
  settings: Settings;
  /** What the screen knows and the data does not, e.g. which project you are on. */
  here?: { projectActions?: number };
}

/**
 * When each explanation is worth making. The thresholds are the point: a hint
 * that fires on an empty app is a tutorial, which is the thing we are not
 * building.
 */
const WHEN: Record<HintId, (context: HintContext) => boolean> = {
  // You have captured a few things and never used a context.
  'capture-context': ({ items }) => {
    const open = live(items).filter((item) => item.deletedAt === undefined);
    return open.length >= 3 && open.every((item) => item.context === undefined);
  },

  // Enough has piled up that reading the list is no longer the way through it.
  'clarify-inbox': ({ items }) => itemsInStatus(items, 'inbox').length >= 3,

  // On the decision card itself, the first time you get there.
  'clarify-keys': () => true,

  // A project with no actions is a wish; the next physical action is the point.
  'project-first-action': ({ here }) => here?.projectActions === 0,

  // Something has actually stopped moving, which is what the red badge means.
  'stalled-projects': ({ items, projects }) => stalledProjects(projects, items).length > 0,

  // There is enough in here to be worth losing.
  'export-backup': ({ items, settings }) => settings.lastExportAt === undefined && live(items).length >= 5,

  // On the review page, which you only reach deliberately.
  'review-cadence': () => true,
};

/**
 * Hints whose job is done the moment you use the control they point at.
 *
 * The design system closes a coach mark as "completed" when you do the
 * suggested thing, but a control that navigates away unmounts it first, so the
 * event never lands. These retire on the click instead: you engaged, it said
 * its piece, it should not ask again.
 *
 * The two left out are about what you TYPE rather than what you click, so a
 * click means nothing; both stop applying by themselves once you have used a
 * context or given the project an action.
 */
const RETIRE_ON_USE: ReadonlySet<HintId> = new Set([
  'clarify-inbox',
  'clarify-keys',
  'stalled-projects',
  'export-backup',
  'review-cadence',
]);

export function retiresOnUse(id: HintId): boolean {
  return RETIRE_ON_USE.has(id);
}

export function isDismissed(id: HintId, settings: Settings): boolean {
  return settings.dismissedHints?.includes(id) === true;
}

/** Whether to explain this now: the moment applies and you have not waved it away. */
export function isHintActive(id: HintId, context: HintContext): boolean {
  return !isDismissed(id, context.settings) && WHEN[id](context);
}

/**
 * Which explanation wins when several apply. One at a time: two popovers
 * competing for the same glance is worse than saying nothing.
 *
 * Roughly in order of how immediate the moment is: what you are doing right
 * now beats what you could do next, which beats housekeeping.
 */
export const HINT_PRIORITY: readonly HintId[] = [
  'clarify-keys',
  'project-first-action',
  'stalled-projects',
  'clarify-inbox',
  'capture-context',
  'review-cadence',
  'export-backup',
];

/** The single explanation worth making right now, if any. */
export function firstActiveHint(context: HintContext, available: readonly HintId[]): HintId | null {
  return HINT_PRIORITY.find((id) => available.includes(id) && isHintActive(id, context)) ?? null;
}
