import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isItem } from './model.ts';
import { newId } from './ids.ts';
import { makeItem } from './test-helpers.ts';

test('isItem accepts valid items, including tombstones', () => {
  assert.ok(isItem(makeItem()));
  assert.ok(isItem(makeItem({ status: 'done', completedAt: 2000, updatedAt: 2000 })));
  assert.ok(isItem(makeItem({ deletedAt: 3000, updatedAt: 3000 })));
});

test('isItem rejects wrong shapes', () => {
  for (const bad of [null, 42, 'x', [], {}, { ...makeItem(), status: 'archived' }, { ...makeItem(), updatedAt: NaN }, { ...makeItem(), id: '' }, { ...makeItem(), deletedAt: 'yesterday' }]) {
    assert.ok(!isItem(bad), JSON.stringify(bad));
  }
});

test('isItem enforces: completedAt exists if and only if done', () => {
  assert.ok(!isItem({ ...makeItem(), status: 'done', completedAt: undefined }));
  assert.ok(!isItem({ ...makeItem({ status: 'next' }), completedAt: 5 }));
});

test('newId falls back to a valid v4 UUID without crypto.randomUUID', (t) => {
  // randomUUID lives on Crypto.prototype; an own property shadows it until deleted.
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
  t.after(() => delete (crypto as { randomUUID?: unknown }).randomUUID);
  assert.equal(typeof crypto.randomUUID, 'undefined');
  assert.match(newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
