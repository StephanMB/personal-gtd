export type Status = 'inbox' | 'next' | 'waiting' | 'someday' | 'done';

export interface Item {
  id: string;
  title: string;
  context?: string;
  status: Status;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'gtd:items';

export function loadItems(): Item[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Item[]) : [];
  } catch {
    return [];
  }
}

export function saveItems(items: Item[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// "Buy milk @errands" -> { title: "Buy milk", context: "errands" }
export function parseCapture(input: string): { title: string; context?: string } {
  const match = input.match(/^(.*?)\s*@(\S+)\s*$/);
  if (match) {
    return { title: match[1].trim(), context: match[2] };
  }
  return { title: input.trim() };
}

export function createItem(input: string): Item {
  const { title, context } = parseCapture(input);
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
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
