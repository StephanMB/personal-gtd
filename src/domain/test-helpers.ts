import type { Item } from './model.ts';

/** Build a valid item with sensible defaults; override what the test is about. */
export function makeItem(overrides: Partial<Item> = {}): Item {
  const item: Item = { id: 'i1', title: 'Test item', status: 'inbox', createdAt: 1000, updatedAt: 1000, ...overrides };
  if (item.status === 'done' && item.completedAt === undefined) item.completedAt = item.updatedAt;
  return item;
}
