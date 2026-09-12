import type { Item, Project } from '../domain/model.ts';
import type { DocContents, Settings } from '../persistence/schema.ts';
import type { Dictionary } from './copy-en.ts';

/**
 * A demo environment: a full, plausible system to look at without having to
 * type one in, and without going anywhere near your own lists.
 *
 * It is a separate document under its own storage key, so entering and leaving
 * the demo is a URL away and your real data is never read, written or merged.
 * The content is built here as data rather than captured through the UI, so
 * the dates can be spread out: something waiting too long, something parked
 * for months, things finished this week, and a project that has stopped. That
 * is what makes the review and the stalled badge worth looking at.
 */
export const DEMO_PARAM = 'demo';

export function isDemoUrl(search: string): boolean {
  return new URLSearchParams(search).has(DEMO_PARAM);
}

const DAY = 24 * 60 * 60 * 1000;

export function demoDocument(now: number, words: Dictionary['demo']['content'], carried: Settings = {}): DocContents {
  const ago = (days: number) => now - days * DAY;
  const content = words;

  const house: Project = {
    id: 'demo-project-house',
    title: content.projectHouse,
    status: 'active',
    createdAt: ago(40),
    updatedAt: ago(6),
  };
  // Nothing is moving this one: no next action, nobody to chase. It is why
  // the sidebar badge is red the moment the demo opens.
  const garden: Project = {
    id: 'demo-project-garden',
    title: content.projectGarden,
    status: 'active',
    createdAt: ago(21),
    updatedAt: ago(21),
  };

  const item = (
    id: string,
    title: string,
    status: Item['status'],
    created: number,
    updated: number,
    extra: Partial<Item> = {},
  ): Item => ({ id: `demo-${id}`, title, status, createdAt: created, updatedAt: updated, ...extra });

  const items: Item[] = [
    item('inbox-1', content.inboxRoof, 'inbox', ago(2), ago(2)),
    item('inbox-2', content.inboxSlides, 'inbox', ago(1), ago(1)),
    item('inbox-3', content.inboxPermit, 'inbox', ago(1), ago(1), { context: content.contextErrands }),

    item('next-1', content.nextNotary, 'next', ago(6), ago(6), {
      context: content.contextEmail,
      projectId: house.id,
    }),
    item('next-2', content.nextRehearsal, 'next', ago(3), ago(3), { context: content.contextCalls }),

    // Old enough that the weekly review calls it out.
    item('waiting-1', content.waitingQuote, 'waiting', ago(18), ago(11), { context: content.contextEmail }),
    // Parked so long that the review asks whether you still mean it.
    item('someday-1', content.somedaySailing, 'someday', ago(200), ago(140)),

    item('done-1', content.doneTaxes, 'done', ago(9), ago(2), { completedAt: ago(2) }),
    item('done-2', content.doneBikeLight, 'done', ago(8), ago(5), { completedAt: ago(5), context: content.contextErrands }),
    item('done-3', content.donePassport, 'done', ago(70), ago(40), { completedAt: ago(40) }),
  ];

  return {
    items,
    projects: [house, garden],
    settings: {
      // Overdue by a couple of days, so the nudge is visible straight away.
      lastReviewedAt: ago(9),
      lastExportAt: ago(3),
      // Appearance and language follow whatever was chosen for the real app.
      ...carried,
    },
  };
}
