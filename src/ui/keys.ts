import { STATUSES, type Status } from '../domain/model.ts';

/**
 * Keyboard shortcuts as a pure function from a key press to an action, so the
 * rules are tested without a browser. `shortcuts.ts` wires it to window.
 *
 * Anywhere:
 *   c           focus the capture field
 *   p           clarify the inbox (process it)
 *   1 … 5       go to Inbox, Next, Waiting, Someday, Done
 *   Ctrl/⌘ + Z  undo the last change
 *
 * While clarifying, one key per decision, because the whole point is deciding
 * once per item without reaching for the mouse:
 *   n w s       next action, waiting for, someday
 *   d           done (you just did it)
 *   t           trash
 *   e           edit the title
 *   Escape      leave the flow
 *
 * Single keys never fire while typing. Undo doesn't either: inside a text
 * field, Ctrl+Z belongs to the field's own text undo.
 */
export type Scope = 'global' | 'clarify';

export type Decision = 'next' | 'waiting' | 'someday' | 'done' | 'trash';

export type ShortcutAction =
  | { type: 'focus-capture' }
  | { type: 'clarify' }
  | { type: 'go'; status: Status }
  | { type: 'undo' }
  | { type: 'decide'; decision: Decision }
  | { type: 'edit' }
  | { type: 'leave' };

export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Written out rather than derived from STATUSES by index: adding a view would
 * otherwise shift every digit and break the muscle memory you built. A new
 * view has to be given a key here deliberately, or none at all.
 */
export const LIST_KEYS: Record<Status, string> = {
  inbox: '1',
  next: '2',
  waiting: '3',
  someday: '4',
  done: '5',
};

/** One key per decision, live only inside the clarify flow. */
export const DECISION_KEYS: Record<string, Decision> = {
  n: 'next',
  w: 'waiting',
  s: 'someday',
  d: 'done',
  t: 'trash',
};

export function matchShortcut(e: KeyPress, typing: boolean, scope: Scope = 'global'): ShortcutAction | null {
  if (typing || e.altKey) return null;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') return { type: 'undo' };
  if (mod || e.shiftKey) return null;

  if (scope === 'clarify') {
    if (e.key === 'Escape') return { type: 'leave' };
    if (e.key === 'e') return { type: 'edit' };
    const decision = DECISION_KEYS[e.key];
    if (decision) return { type: 'decide', decision };
  }

  if (e.key === 'c') return { type: 'focus-capture' };
  if (e.key === 'p') return { type: 'clarify' };
  const status = STATUSES.find((s) => LIST_KEYS[s] === e.key);
  return status ? { type: 'go', status } : null;
}

/** Whether the element that really has focus (looked up through shadow roots) takes text. */
export function isTypingTarget(el: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!el?.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}
