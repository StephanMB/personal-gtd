export type Status = 'inbox' | 'next' | 'waiting' | 'someday' | 'done';

export const STATUSES: readonly Status[] = ['inbox', 'next', 'waiting', 'someday', 'done'];

export interface Item {
  id: string;
  title: string;
  context?: string;
  status: Status;
  createdAt: number;
  updatedAt: number;
}

/** Runtime check for data we did not produce in this session (storage, imports). */
export function isItem(value: unknown): value is Item {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.title === 'string' &&
    (v.context === undefined || typeof v.context === 'string') &&
    typeof v.status === 'string' &&
    (STATUSES as readonly string[]).includes(v.status) &&
    typeof v.createdAt === 'number' &&
    Number.isFinite(v.createdAt) &&
    typeof v.updatedAt === 'number' &&
    Number.isFinite(v.updatedAt)
  );
}

/**
 * RFC 4122 v4 UUID. crypto.randomUUID() only exists in secure contexts
 * (HTTPS / localhost); crypto.getRandomValues() works everywhere.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// A context is a trailing "@word" that starts the string or follows whitespace,
// so "jan@minbzk.nl" is never split.
const TRAILING_CONTEXT = /^(.*?)(?:^|\s)@(\S+)\s*$/;

// "Buy milk @errands" -> { title: "Buy milk", context: "errands" }
// Rule: never drop captured text. If stripping the context would leave an
// empty title, keep the whole input as the title.
export function parseCapture(input: string): { title: string; context?: string } {
  const trimmed = input.trim();
  const match = trimmed.match(TRAILING_CONTEXT);
  if (match && match[1].trim() !== '') {
    return { title: match[1].trim(), context: match[2] };
  }
  return { title: trimmed };
}

export function createItem(input: string): Item {
  const { title, context } = parseCapture(input);
  const now = Date.now();
  return {
    id: newId(),
    title,
    context,
    status: 'inbox',
    createdAt: now,
    updatedAt: now,
  };
}

export function actionButtons(item: Item): { label: string; status: Status }[] {
  switch (item.status) {
    case 'inbox':
      return [
        { label: '→ Next', status: 'next' },
        { label: '→ Waiting', status: 'waiting' },
        { label: '→ Someday', status: 'someday' },
      ];
    case 'next':
    case 'waiting':
      return [
        { label: '✓ Done', status: 'done' },
        { label: '→ Someday', status: 'someday' },
        { label: '→ Inbox', status: 'inbox' },
      ];
    case 'someday':
      return [
        { label: '→ Next', status: 'next' },
        { label: '→ Inbox', status: 'inbox' },
      ];
    case 'done':
      return [{ label: '↺ Reopen', status: 'next' }];
  }
}
