import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capture, complete, move, remove, rename, restore, purgeTombstones, TOMBSTONE_RETENTION_MS } from './operations.ts';
import { itemsInStatus, liveItems } from './queries.ts';
import type { Item } from './model.ts';
import { makeItem } from './test-helpers.ts';

test('capture appends an inbox item and refuses empty input', () => {
  const r = capture([], 'Buy milk', 'n1', 10);
  assert.ok(r.ok);
  assert.equal(r.items[0].status, 'inbox');
  assert.deepEqual(capture([], '   ', 'n2', 10), { ok: false, reason: 'empty-input' });
});

test('move applies allowed transitions and refuses the rest without throwing', () => {
  const items = [makeItem({ id: 'a', status: 'inbox' })];
  const ok = move(items, 'a', 'next', 20);
  assert.ok(ok.ok && ok.items[0].status === 'next');
  assert.deepEqual(move(items, 'a', 'done', 20), { ok: false, reason: 'not-allowed' });
  assert.deepEqual(move(items, 'zzz', 'next', 20), { ok: false, reason: 'not-found' });
});

test('operations never mutate their input', () => {
  // Frozen input: any in-place write would throw (ES modules run in strict mode).
  const items = Object.freeze([Object.freeze(makeItem({ id: 'a' }))]) as unknown as Item[];
  move(items, 'a', 'next', 20);
  remove(items, 'a', 20);
  capture(items, 'x', 'n', 20);
});

test('remove makes a tombstone that queries hide; restore brings it back', () => {
  const items = [makeItem({ id: 'a', status: 'next' })];
  const removed = remove(items, 'a', 30);
  assert.ok(removed.ok);
  assert.equal(removed.items.length, 1, 'tombstone is kept');
  assert.equal(removed.items[0].deletedAt, 30);
  assert.equal(removed.items[0].updatedAt, 30, 'delete bumps updatedAt so merges see it');
  assert.deepEqual(itemsInStatus(removed.items, 'next'), []);
  assert.deepEqual(liveItems(removed.items), []);
  assert.deepEqual(move(removed.items, 'a', 'done', 31), { ok: false, reason: 'deleted' });

  const restored = restore(removed.items, 'a', 40);
  assert.ok(restored.ok);
  assert.equal(restored.items[0].deletedAt, undefined);
  assert.equal(restored.items[0].updatedAt, 40);
  assert.deepEqual(restore(restored.items, 'a', 41), { ok: false, reason: 'not-deleted' });
});

test('purgeTombstones drops only tombstones past retention', () => {
  const now = 10 * TOMBSTONE_RETENTION_MS;
  const items = [
    makeItem({ id: 'live' }),
    makeItem({ id: 'recent', deletedAt: now - 1000, updatedAt: now - 1000 }),
    makeItem({ id: 'old', deletedAt: now - TOMBSTONE_RETENTION_MS, updatedAt: 0 }),
  ];
  assert.deepEqual(purgeTombstones(items, now).map((i) => i.id), ['live', 'recent']);
});

test('the inbox is ordered oldest first, the way GTD processes it', () => {
  const items = [
    makeItem({ id: 'new', createdAt: 200, updatedAt: 900 }),
    makeItem({ id: 'old', createdAt: 100, updatedAt: 100 }),
  ];
  assert.deepEqual(itemsInStatus(items, 'inbox').map((i) => i.id), ['old', 'new']);
});

test('done items are ordered by completion time, others by last update', () => {
  const items = [
    makeItem({ id: 'd1', status: 'done', completedAt: 100, updatedAt: 500 }),
    makeItem({ id: 'd2', status: 'done', completedAt: 200, updatedAt: 200 }),
  ];
  assert.deepEqual(itemsInStatus(items, 'done').map((i) => i.id), ['d2', 'd1']);
});

test('rename rewrites a captured note into an action, and refuses an empty title', () => {
  const items = [makeItem({ id: 'a', title: "Mom's birthday" })];
  const renamed = rename(items, 'a', '  Call the bakery about a cake  ', 50);
  assert.ok(renamed.ok);
  assert.equal(renamed.ok && renamed.items[0].title, 'Call the bakery about a cake', 'trimmed');
  assert.equal(renamed.ok && renamed.items[0].updatedAt, 50);
  assert.deepEqual(rename(items, 'a', '   ', 50), { ok: false, reason: 'empty-input' });
  assert.deepEqual(rename(items, 'zzz', 'x', 50), { ok: false, reason: 'not-found' });
  assert.equal(rename(items, 'a', "Mom's birthday", 50).ok, true, 'renaming to the same title is a no-op');
});

test('complete is the two-minute rule: done from the inbox, which the table refuses', () => {
  const items = [makeItem({ id: 'a', status: 'inbox' })];
  assert.deepEqual(move(items, 'a', 'done', 60), { ok: false, reason: 'not-allowed' }, 'not from a list button');

  const done = complete(items, 'a', 60);
  assert.ok(done.ok);
  if (!done.ok) return;
  assert.equal(done.items[0].status, 'done');
  assert.equal(done.items[0].completedAt, 60, 'the completedAt invariant holds');
  assert.equal(complete(done.items, 'a', 70).ok, true, 'completing something already done is a no-op');
  const removed = remove(items, 'a', 60);
  assert.ok(removed.ok);
  if (removed.ok) assert.deepEqual(complete(removed.items, 'a', 70), { ok: false, reason: 'deleted' });
});
