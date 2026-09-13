import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextsInUse, fold, inContext } from './contexts.ts';
import type { Item } from './model.ts';

const NOW = 1_780_000_000_000;

const item = (id: string, title: string, context: string | undefined, extra: Partial<Item> = {}): Item => ({
  id,
  title,
  status: 'next',
  createdAt: NOW,
  updatedAt: NOW,
  ...(context === undefined ? {} : { context }),
  ...extra,
});

test('a context is the same context however you happened to type it', () => {
  assert.equal(fold('home'), 'home');
  assert.equal(fold('Home'), 'home');
  assert.equal(fold('@home'), 'home');
  assert.equal(fold(' HOME. '), 'home');
  assert.equal(fold('home,'), 'home');
  // Not everything is punctuation: a context can legitimately contain one.
  assert.equal(fold('e-mail'), 'e-mail');
  assert.equal(fold('@'), '');
});

test('contexts are derived from the items, commonest first', () => {
  const items = [
    item('1', 'Ring the dentist', 'calls'),
    item('2', 'Ring the vet', 'Calls'),
    item('3', 'Buy milk', 'errands'),
    item('4', 'Nothing tagged', undefined),
  ];
  assert.deepEqual(contextsInUse(items), [
    { key: 'calls', label: 'calls', count: 2 },
    { key: 'errands', label: 'errands', count: 1 },
  ]);
});

test('the spelling you used last is the one shown', () => {
  const items = [
    item('1', 'Older', 'home'),
    item('2', 'Newer', 'Home', { updatedAt: NOW + 1000 }),
  ];
  assert.deepEqual(contextsInUse(items), [{ key: 'home', label: 'Home', count: 2 }]);
});

test('tombstones and empty tags are not contexts you can filter by', () => {
  const items = [
    item('1', 'Deleted', 'calls', { deletedAt: NOW }),
    item('2', 'Punctuation only', '@'),
    item('3', 'Real', 'errands'),
  ];
  assert.deepEqual(contextsInUse(items), [{ key: 'errands', label: 'errands', count: 1 }]);
});

test('filtering keeps the order the list was already in', () => {
  const items = [
    item('1', 'First', 'Home'),
    item('2', 'Second', 'errands'),
    item('3', 'Third', 'home'),
  ];
  assert.deepEqual(
    inContext(items, 'home').map((i) => i.id),
    ['1', '3'],
  );
});
