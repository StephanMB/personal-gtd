import type { Status } from '../domain/model.ts';
import type { CommandFailure, Problem } from '../store/store.ts';

/**
 * Every string the app shows, in one place. The store and domain return
 * data (a failure reason, a Problem); only this file turns them into words.
 * That keeps wording consistent and makes a switch to Dutch one file's work.
 * NLDD's own built-in strings (e.g. "Navigatie") are Dutch by default and
 * are overridden per component through its `translations` property.
 */
export const copy = {
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
    'not-deleted': 'That item was already restored.',
    'nothing-to-undo': 'Nothing to undo.',
    'undo-conflict': "Can't undo: that item was changed again since, probably in another tab.",
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

  problem(p: Problem): { text: string; supporting?: string } {
    switch (p.kind) {
      case 'unreadable-items':
        return { text: `${p.count} saved item(s) could not be read and were left out.`, supporting: `A copy was kept in this browser under "${p.copyKey}".` };
      case 'corrupt':
        return p.leftInLegacy
          ? { text: 'Your saved data could not be read.', supporting: 'It was left untouched in this browser (gtd:items).' }
          : { text: 'Your saved data could not be read.', supporting: `A copy was kept in this browser under "${p.copyKey}".` };
      case 'paused':
        return { text: 'Your saved data could not be read, and no safety copy fits in storage.', supporting: 'Saving is paused so it is not overwritten. Download it first, then resume.' };
      case 'newer':
        return { text: `Your data was saved by a newer version of this app (schema ${p.version}).`, supporting: "This version can't read it, so nothing is saved here. Reload once the newer version is deployed." };
      case 'unavailable':
        return { text: 'Browser storage is unavailable, so nothing will be saved.', supporting: 'Use Export before closing this tab.' };
      case 'save-failed':
        return { text: 'Your last change could not be saved.', supporting: 'Browser storage may be full or blocked. Export your data now so nothing is lost.' };
    }
  },
  problemActions: { download: 'Download data', resume: 'Resume saving', export: 'Export' },
} as const;
