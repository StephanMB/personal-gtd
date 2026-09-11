import type { Item } from './model.ts';

// A context is a trailing "@word" that starts the string or follows whitespace,
// so "jan@minbzk.nl" is never split.
const TRAILING_CONTEXT = /^(.*?)(?:^|\s)@(\S+)\s*$/;

export interface ParsedCapture {
  title: string;
  context?: string;
}

/**
 * "Buy milk @errands" -> { title: "Buy milk", context: "errands" }
 * Rule: never drop captured text. If stripping the context would leave an
 * empty title, the whole input becomes the title.
 */
export function parseCapture(input: string): ParsedCapture {
  const trimmed = input.trim();
  const match = trimmed.match(TRAILING_CONTEXT);
  if (match && match[1].trim() !== '') {
    return { title: match[1].trim(), context: match[2] };
  }
  return { title: trimmed };
}

/** Pure: the caller supplies the id and the clock. */
export function createItem(input: string, id: string, now: number): Item {
  const { title, context } = parseCapture(input);
  const item: Item = { id, title, status: 'inbox', createdAt: now, updatedAt: now };
  if (context !== undefined) item.context = context;
  return item;
}
