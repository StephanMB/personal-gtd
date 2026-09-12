import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecords } from './merge.ts';
import { makeItem } from './test-helpers.ts';

const a = makeItem({ id: 'a', updatedAt: 10 });
const b = makeItem({ id: 'b', updatedAt: 10 });

test('adds unknown ids and counts them', () => {
  const r = mergeRecords([a], [a, b]);
  assert.deepEqual([r.added, r.updated, r.deleted], [1, 0, 0]);
  assert.equal(r.items.length, 2);
});

test('is idempotent: merging the same input twice changes nothing', () => {
  const once = mergeRecords([a], [a, b]).items;
  const twice = mergeRecords(once, [a, b]);
  assert.deepEqual(twice.items, once);
  assert.deepEqual([twice.added, twice.updated, twice.deleted], [0, 0, 0]);
});

test('the newer copy wins in both directions; ties keep current', () => {
  const newer = { ...a, title: 'newer', updatedAt: 20 };
  assert.equal(mergeRecords([a], [newer]).items[0].title, 'newer');
  assert.equal(mergeRecords([newer], [a]).items[0].title, 'newer');
  assert.equal(mergeRecords([a], [{ ...a, title: 'tie' }]).items[0].title, a.title);
});

test('an old backup cannot resurrect an item deleted since', () => {
  const tombstone = { ...a, deletedAt: 20, updatedAt: 20 };
  const r = mergeRecords([tombstone], [a]);
  assert.equal(r.items[0].deletedAt, 20);
  assert.deepEqual([r.added, r.updated, r.deleted], [0, 0, 0]);
});

test('a newer deletion in the backup is applied and counted', () => {
  const r = mergeRecords([a], [{ ...a, deletedAt: 20, updatedAt: 20 }]);
  assert.equal(r.items[0].deletedAt, 20);
  assert.equal(r.deleted, 1);
});

test('a restore newer than the deletion wins', () => {
  const tombstone = { ...a, deletedAt: 20, updatedAt: 20 };
  const restored = { ...a, updatedAt: 30 };
  assert.equal(mergeRecords([tombstone], [restored]).items[0].deletedAt, undefined);
});

test('merges any stored record, not only items', () => {
  // The point of the generic: a second collection reuses this function.
  interface Project {
    id: string;
    updatedAt: number;
    deletedAt?: number;
    outcome: string;
  }
  const current: Project[] = [{ id: 'p1', updatedAt: 10, outcome: 'Kitchen painted' }];
  const incoming: Project[] = [
    { id: 'p1', updatedAt: 20, outcome: 'Kitchen painted properly' },
    { id: 'p2', updatedAt: 5, outcome: 'Taxes filed' },
  ];
  const r = mergeRecords(current, incoming);
  assert.deepEqual([r.added, r.updated, r.deleted], [1, 1, 0]);
  assert.equal(r.items.find((p) => p.id === 'p1')?.outcome, 'Kitchen painted properly');
});
