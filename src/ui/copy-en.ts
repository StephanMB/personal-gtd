import type { Status } from '../domain/model.ts';
import type { CommandFailure, Problem } from '../store/store.ts';
import type { Decision } from './keys.ts';
import type { HintId } from './hints.ts';

/**
 * Every string the app shows, in English. The store and domain return data (a
 * failure reason, a Problem); only these dictionaries turn them into words.
 *
 * This one is the reference: `Dictionary` is its shape, so a translation that
 * misses a key, or invents one, does not compile.
 */
export const en = {
  appName: 'Personal GTD',
  skipToList: 'Skip to list',
  navLabel: 'Lists',

  lists: {
    inbox: 'Inbox',
    next: 'Next actions',
    waiting: 'Waiting for',
    someday: 'Someday / maybe',
    done: 'Done',
  } satisfies Record<Status, string>,

  empty: {
    inbox: 'Inbox zero. Capture anything that has your attention.',
    next: 'No next actions. Clarify your inbox to add some.',
    waiting: 'Not waiting on anyone.',
    someday: 'Nothing parked for later.',
    done: 'Nothing completed yet.',
  } satisfies Record<Status, string>,

  moveLabel(from: Status, to: Status): string {
    if (from === 'done') return 'Reopen';
    if (to === 'done') return 'Done';
    return { inbox: 'To inbox', next: 'Next', waiting: 'Waiting', someday: 'Someday', done: 'Done' }[to];
  },

  capture: {
    label: 'Capture',
    placeholder: 'Capture a thought… (try "Buy milk @errands")',
    submit: 'Add',
    addedElsewhere: 'Added to Inbox.',
  },

  deleteLabel: (title: string) => `Delete "${title}"`,
  deleted: (title: string) => `Deleted "${title}".`,
  undo: 'Undo',
  undone: 'Undone.',

  failure: {
    'empty-input': 'Nothing to capture.',
    'not-found': 'That item no longer exists. It may have been changed in another tab.',
    'not-allowed': 'That item was moved in another tab. The list has been refreshed.',
    deleted: 'That item was deleted in another tab.',
    'nothing-to-undo': 'Nothing to undo.',
    'undo-conflict': "Can't undo: that item was changed again since, probably in another tab.",
    'internal-error': 'Something went wrong, so your data was not changed.',
  } satisfies Record<CommandFailure, string>,

  backup: {
    export: 'Export',
    import: 'Import…',
    never: 'Never exported.',
    last: (days: number) => (days === 0 ? 'Last export: today.' : `Last export: ${days} day${days === 1 ? '' : 's'} ago.`),
    imported: (c: { added: number; updated: number; deleted: number }) =>
      `Imported: ${c.added} new, ${c.updated} updated, ${c.deleted} deleted.`,
    importFailed: (reason: string) => `Import failed: ${reason}`,
  },

  clarify: {
    title: 'Clarify',
    start: (count: number) => `Clarify ${count} item${count === 1 ? '' : 's'}`,
    progress: (position: number, total: number) => `Item ${position} of ${total}`,
    question: 'What is the very next physical action?',
    decisions: {
      next: 'Next action',
      waiting: 'Waiting for',
      someday: 'Someday',
      done: 'Done',
      trash: 'Trash',
      project: 'Make a project',
    } satisfies Record<Decision, string>,
    twoMinuteRule: 'If it takes less than two minutes, do it now and press d. Anything can be undone with Ctrl+Z.',
    edit: 'Edit the title',
    save: 'Save',
    leave: 'Leave (Esc)',
    empty: 'Inbox zero. Nothing left to clarify.',
    backToInbox: 'Back to Inbox',
  },

  projects: {
    title: 'Projects',
    /** The query a plain list can never answer, which is why projects exist. */
    stalled: 'No next action',
    stalledCount: (count: number) => `${count} project${count === 1 ? '' : 's'} with no next action`,
    actionCount: (count: number) =>
      count === 0 ? 'No actions yet' : `${count} action${count === 1 ? '' : 's'}`,
    empty: 'No projects yet. In the inbox, press p on something that needs more than one action.',
    promoted: (title: string) => `"${title}" is a project now. What is its first next action?`,
    addAction: 'Add the next action',
    addActionPlaceholder: 'The very next physical action…',
    gone: 'That project is no longer here.',
    back: 'All projects',
    markDone: 'Project done',
    drop: 'Drop it',
    reopen: 'Reopen',
    statusDone: 'Done',
    statusDropped: 'Dropped',
  },

  review: {
    title: 'Weekly review',
    intro: 'A pass over everything, so you can close the laptop believing the system is complete.',
    steps: {
      inbox: 'Empty the inbox',
      projects: 'Projects with no next action',
      waiting: 'Waiting for, older than a week',
      someday: 'Someday, untouched for months',
      completed: 'What you finished this week',
      backup: 'Export a backup',
    },
    clear: 'Clear',
    clarify: (count: number) => `Clarify ${count} item${count === 1 ? '' : 's'}`,
    toChase: (count: number) => `${count} to chase`,
    toRevisit: (count: number) => `${count} to promote or drop`,
    nothing: 'Nothing here to deal with.',
    completedCount: (count: number) =>
      count === 0 ? 'Nothing finished this week yet.' : `${count} finished this week`,
    exportNow: 'Export now',
    exportedToday: 'Exported today.',
    finish: 'Finish review',
    finished: 'Review done. See you next week.',
    never: 'Never reviewed',
    sinceReview: (days: number) =>
      days === 0 ? 'Reviewed today' : `Reviewed ${days} day${days === 1 ? '' : 's'} ago`,
  },

  /**
   * One sentence at the moment it applies, plus the reason behind it. These
   * say WHY the app behaves as it does, because the how is visible already.
   */
  hints: {
    'capture-context': {
      text: 'Tag where it happens',
      supporting:
        'A trailing @word becomes a context: "Buy milk @errands". Email addresses are left alone, so jan@minbzk.nl stays intact.',
    },
    'clarify-inbox': {
      text: 'Decide once per item',
      supporting:
        'Clarifying walks the inbox oldest first, one decision at a time, because re-reading the whole list is how an inbox stops being trusted.',
    },
    'clarify-keys': {
      text: 'One key per decision',
      supporting:
        'n, w, s for the lists, d if you just did it, t for the bin, e to rewrite it. Nothing here is final: Ctrl+Z takes the last one back.',
    },
    'project-first-action': {
      text: 'What is the very next action?',
      supporting:
        'The project title is the outcome you want. What goes here is the next physical thing you would actually do, and it is filed as a next action straight away.',
    },
    'stalled-projects': {
      text: 'This one has stopped',
      supporting:
        'A project with no next action and nobody to chase will not move by itself. That is what the red count means, and it is the one thing a flat task list can never tell you.',
    },
    'export-backup': {
      text: 'Export is the real backup',
      supporting:
        'Everything lives in this browser. Clearing site data wipes it, and Safari deletes storage for sites unused for a week. Importing merges, so an export is never destructive to come back to.',
    },
    'review-cadence': {
      text: 'Once a week is the point',
      supporting:
        'The pass is what lets you trust the lists between passes. Finishing records the date, and the sidebar starts nudging after seven days.',
    },
  } satisfies Record<HintId, { text: string; supporting: string }>,

  recovered: {
    heading: 'Recovered data',
    /** Just the moment: the row and the button labels put it in a sentence. */
    savedAt: (date: Date | null) =>
      date === null ? 'at an unknown time' : `on ${date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`,
    rowTitle: (when: string) => `Set aside ${when}`,
    detail: (size: number, reason: 'unreadable' | 'pre-migration') =>
      `${reason === 'unreadable' ? 'Data that could not be read' : 'Copy from before an upgrade'} (${Math.max(1, Math.round(size / 1024))} kB)`,
    download: 'Download',
    downloadLabel: (when: string) => `Download the copy set aside ${when}`,
    deleteLabel: (when: string) => `Delete the copy set aside ${when}`,
    deleted: 'Recovered copy deleted.',
    gone: 'That copy is no longer in this browser.',
  },

  problem(p: Problem): { text: string; supporting?: string } {
    switch (p.kind) {
      case 'unreadable-items':
        return { text: `${p.count} saved item(s) could not be read and were left out.`, supporting: `A copy was kept in this browser under "${p.copyKey}".` };
      case 'corrupt':
        return p.leftInLegacy
          ? { text: 'Your saved data could not be read.', supporting: 'It was left untouched in this browser (gtd:items).' }
          : { text: 'Your saved data could not be read.', supporting: `A copy was kept in this browser under "${p.copyKey}".` };
      case 'paused': {
        const cause = {
          corrupt: 'Your saved data could not be read, and no safety copy fits in browser storage.',
          'unreadable-items': 'Some saved items could not be read, and no safety copy fits in browser storage.',
          migration: 'Your data needs an upgrade, and no safety copy fits in browser storage.',
        }[p.cause];
        return { text: cause, supporting: 'Saving is paused so nothing is overwritten. Download the data first, then resume.' };
      }
      case 'newer':
        return { text: `Your data was saved by a newer version of this app (schema ${p.version}).`, supporting: "This version can't read it, so nothing is saved here. Reload once the newer version is deployed." };
      case 'unavailable':
        return { text: 'Browser storage is unavailable, so nothing will be saved.', supporting: 'Use Export before closing this tab.' };
      case 'save-failed':
        return { text: 'Your last change could not be saved.', supporting: 'Browser storage may be full or blocked. Export your data now so nothing is lost.' };
    }
  },
  problemActions: { download: 'Download data', resume: 'Resume saving', export: 'Export' },

  appearance: {
    theme: 'Appearance',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
    language: 'Language',
    english: 'English',
    dutch: 'Nederlands',
    /** The design system announces this in Dutch unless it is overridden. */
    listArrowHint: 'Use the arrow keys to move through the list.',
  },
};

/** The shape every language has to provide. */
export type Dictionary = typeof en;
