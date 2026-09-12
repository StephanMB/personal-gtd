import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completedBetween, staleWaiting, untouchedSomeday, STALE_SOMEDAY_MS, STALE_WAITING_MS } from './queries.ts';
import { makeItem } from './test-helpers.ts';

// A realistic clock: 1e9 ms is eleven days after 1970, so "five weeks ago"
// would be a negative timestamp.
const NOW = 1_780_000_000_000;
const ago = (ms: number) => NOW - ms;

test('waiting-for is stale after a week, and the oldest is chased first', () => {
  const items = [
    makeItem({ id: 'fresh', status: 'waiting', updatedAt: ago(STALE_WAITING_MS / 2) }),
    makeItem({ id: 'old', status: 'waiting', updatedAt: ago(STALE_WAITING_MS * 3) }),
    makeItem({ id: 'older', status: 'waiting', updatedAt: ago(STALE_WAITING_MS * 5) }),
    makeItem({ id: 'not-waiting', status: 'next', updatedAt: ago(STALE_WAITING_MS * 5) }),
    makeItem({ id: 'deleted', status: 'waiting', updatedAt: ago(STALE_WAITING_MS * 5), deletedAt: NOW }),
  ];
  assert.deepEqual(staleWaiting(items, NOW).map((i) => i.id), ['older', 'old']);
});

test('someday goes quiet after months', () => {
  const items = [
    makeItem({ id: 'recent', status: 'someday', updatedAt: ago(STALE_SOMEDAY_MS / 2) }),
    makeItem({ id: 'forgotten', status: 'someday', updatedAt: ago(STALE_SOMEDAY_MS * 2) }),
  ];
  assert.deepEqual(untouchedSomeday(items, NOW).map((i) => i.id), ['forgotten']);
});

test('completed in a period, newest first, by when it was finished', () => {
  const week = 7 * 24 * 60 * 60 * 1000;
  const items = [
    makeItem({ id: 'monday', status: 'done', completedAt: ago(week - 1000), updatedAt: NOW }),
    makeItem({ id: 'today', status: 'done', completedAt: ago(1000), updatedAt: NOW }),
    makeItem({ id: 'last-month', status: 'done', completedAt: ago(week * 5), updatedAt: NOW }),
    makeItem({ id: 'unfinished', status: 'next', updatedAt: NOW }),
  ];
  assert.deepEqual(completedBetween(items, ago(week), NOW).map((i) => i.id), ['today', 'monday']);
  assert.deepEqual(completedBetween(items, 0, NOW).map((i) => i.id), ['today', 'monday', 'last-month']);
});
