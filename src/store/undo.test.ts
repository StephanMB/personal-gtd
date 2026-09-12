import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diff, rebaseChanges, revert } from './undo.ts';
import type { Item } from '../domain/model.ts';
import { makeItem } from '../domain/test-helpers.ts';

const a = makeItem({ id: 'a', updatedAt: 10 });
const b = makeItem({ id: 'b', updatedAt: 10 });

test('diff finds exactly the items whose object changed', () => {
  const a2 = { ...a, status: 'next' as const, updatedAt: 20 };
  const c = makeItem({ id: 'c', updatedAt: 20 });
  assert.deepEqual(diff([a, b], [a2, b, c]), [
    { before: a, after: a2 },
    { before: undefined, after: c },
  ]);
  assert.deepEqual(diff([a, b], [a, b]), []);
});

test('revert restores previous versions and tombstones created items, as new changes', () => {
  const a2 = { ...a, status: 'next' as const, updatedAt: 20 };
  const c = makeItem({ id: 'c', updatedAt: 20 });
  const r = revert([a2, b, c], diff([a, b], [a2, b, c]), 99);
  assert.ok(r.ok);
  if (!r.ok) return;
  const [ra, rb, rc] = r.items;
  assert.equal(ra.status, 'inbox');
  assert.equal(ra.updatedAt, 99, 'undo is the newest change');
  assert.equal(rb, b, 'untouched items keep their identity');
  assert.equal(rc.deletedAt, 99);
});

test('revert refuses when an affected item changed since', () => {
  const a2 = { ...a, status: 'next' as const, updatedAt: 20 };
  const changes = diff([a], [a2]);
  const changedElsewhere = { ...a2, status: 'done' as const, completedAt: 30, updatedAt: 30 };
  assert.deepEqual(revert([changedElsewhere], changes, 99), { ok: false, reason: 'undo-conflict' });
});

test('rebase lets an older entry be undone after a newer one', () => {
  const a1: Item = { ...a, status: 'next', updatedAt: 20 }; // entry 1: inbox -> next
  const a2: Item = { ...a1, status: 'someday', updatedAt: 30 }; // entry 2: next -> someday
  const e1 = { changes: diff([a], [a1]) };
  const e2 = { changes: diff([a1], [a2]) };
  const undo2 = revert([a2], e2.changes, 40);
  assert.ok(undo2.ok);
  if (!undo2.ok) return;
  const rebased = rebaseChanges(e1.changes, undo2.restored);
  const undo1 = revert(undo2.items, rebased, 50);
  assert.ok(undo1.ok, 'no false conflict');
  assert.equal(undo1.ok && undo1.items[0].status, 'inbox');
  assert.equal(rebaseChanges(e1.changes, []), e1.changes, 'untouched changes keep their identity');
});

test('diff and revert work on any stored record', () => {
  interface Project {
    id: string;
    updatedAt: number;
    deletedAt?: number;
    title: string;
  }
  const before: Project[] = [{ id: 'p1', updatedAt: 10, title: 'Paint kitchen' }];
  const after: Project[] = [{ id: 'p1', updatedAt: 20, title: 'Paint the kitchen' }];
  const changes = diff(before, after);
  assert.equal(changes.length, 1);
  const reverted = revert(after, changes, 99);
  assert.ok(reverted.ok);
  if (!reverted.ok) return;
  assert.equal(reverted.items[0].title, 'Paint kitchen');
  assert.equal(reverted.items[0].updatedAt, 99);
});
