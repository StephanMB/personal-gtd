import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUSES } from '../domain/model.ts';
import { HOME, parseRoute, pathFor } from './routes.ts';

test('every list has a path that parses back to it', () => {
  for (const status of STATUSES) {
    const route = { view: 'list' as const, status };
    assert.deepEqual(parseRoute(pathFor(route)), route);
  }
});

test('the clarify flow has a path of its own', () => {
  const route = { view: 'clarify' as const };
  assert.equal(pathFor(route), '/clarify');
  assert.deepEqual(parseRoute('/clarify'), route);
});

test('root and trailing slashes go home or to the list; anything else is unknown', () => {
  assert.deepEqual(parseRoute('/'), HOME);
  assert.deepEqual(parseRoute('/next/'), { view: 'list', status: 'next' });
  for (const bad of ['/nope', '/next/extra', '/Inbox']) assert.equal(parseRoute(bad), null, bad);
});
