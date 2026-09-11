import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUSES, isItem, type Status } from './model.ts';
import { TRANSITIONS, canTransition, transition } from './transitions.ts';
import { makeItem } from './test-helpers.ts';

function reachable(from: Status): Set<Status> {
  const seen = new Set<Status>([from]);
  const queue = [from];
  while (queue.length) for (const to of TRANSITIONS[queue.shift()!]) if (!seen.has(to)) seen.add(to), queue.push(to);
  return seen;
}

test('the table covers every status and never targets itself', () => {
  for (const from of STATUSES) {
    assert.ok(Array.isArray(TRANSITIONS[from]), from);
    assert.ok(!TRANSITIONS[from].includes(from), `${from} -> ${from}`);
  }
});

test('workflow sanity: every status can reach done, and done can be reopened', () => {
  for (const from of STATUSES) assert.ok(reachable(from).has('done'), `${from} cannot reach done`);
  assert.ok(canTransition('done', 'next'));
});

test('inbox items must be clarified before they can be done', () => {
  assert.ok(!canTransition('inbox', 'done'));
});

test('every allowed transition keeps the item valid (completedAt invariant)', () => {
  for (const from of STATUSES) {
    for (const to of TRANSITIONS[from]) {
      const moved = transition(makeItem({ status: from }), to, 9000);
      assert.ok(isItem(moved), `${from} -> ${to}`);
      assert.equal(moved.status, to);
      assert.equal(moved.updatedAt, 9000);
      assert.equal(moved.completedAt, to === 'done' ? 9000 : undefined);
    }
  }
});
