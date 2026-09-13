import { isLive, type Item } from './model.ts';

/**
 * Contexts, made into things rather than strings.
 *
 * A context is still stored as free text on the item — no record, no id, no
 * migration — because the job to be done ("when I'm at my laptop with twenty
 * minutes, show me only what I can actually do here") never needed one. What
 * it did need is for "@Home", "@home" and "@home." to be the SAME context, and
 * that is a matter of how you compare them, not how you store them.
 *
 * So identity lives here: `fold` is what "the same context" means, and every
 * query goes through it. Renaming and merging are the parts that genuinely
 * want records, and they stay on the menu until they are missed.
 */

/** Leading @ signs and trailing sentence punctuation are typing, not meaning. */
const EDGES = /^[@\s]+|[\s.,;:!?]+$/g;

/**
 * The identity of a context: what two spellings have to share to be one.
 * `toLowerCase` rather than the locale variant, so the same data folds the
 * same way in every language the app is set to.
 */
export function fold(raw: string): string {
  return raw.replace(EDGES, '').toLowerCase();
}

export interface ContextInUse {
  /** What "the same context" means; also what goes in the URL. */
  key: string;
  /** How to show it: the way you last typed it. */
  label: string;
  count: number;
}

/**
 * The contexts actually present in the items given, commonest first.
 *
 * Derived rather than stored, which means the list can never drift from the
 * items and an empty context cannot linger after its last action is gone.
 * Pass the items of one list to filter that list; pass them all for the set
 * in use across the app.
 */
export function contextsInUse(items: readonly Item[]): ContextInUse[] {
  const found = new Map<string, ContextInUse & { seenAt: number }>();
  for (const item of items) {
    if (!isLive(item) || item.context === undefined) continue;
    const key = fold(item.context);
    if (key === '') continue;
    const existing = found.get(key);
    if (existing === undefined) {
      found.set(key, { key, label: item.context, count: 1, seenAt: item.updatedAt });
    } else {
      existing.count += 1;
      // The spelling you used most recently wins, so changing how you write it
      // changes the tag instead of leaving two of them.
      if (item.updatedAt > existing.seenAt) {
        existing.label = item.context;
        existing.seenAt = item.updatedAt;
      }
    }
  }
  return [...found.values()]
    .map(({ key, label, count }) => ({ key, label, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Narrows a list that is already in the right order, so the order survives. */
export function inContext(items: readonly Item[], key: string): Item[] {
  return items.filter((item) => item.context !== undefined && fold(item.context) === key);
}
