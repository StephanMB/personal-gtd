import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diff, rebase, revert } from './undo.ts';
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
  const a1 = { ...a, status: 'next' as const, updatedAt: 20 }; // entry 1: inbox -> next
  const a2 = { ...a1, status: 'someday' as const, updatedAt: 30 }; // entry 2: next -> someday
  const e1 = { changes: diff([a], [a1]) };
  const e2 = { changes: diff([a1], [a2]) };
  const undo2 = revert([a2], e2.changes, 40);
  assert.ok(undo2.ok);
  if (!undo2.ok) return;
  const [rebased] = rebase([e1], undo2.restored);
  const undo1 = revert(undo2.items, rebased.changes, 50);
  assert.ok(undo1.ok, 'no false conflict');
  assert.equal(undo1.ok && undo1.items[0].status, 'inbox');
  assert.equal(rebase([e1], []).at(0), e1, 'untouched entries keep their identity');
});
