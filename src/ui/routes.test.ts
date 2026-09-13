import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUSES } from '../domain/model.ts';
import { HOME, parseRoute, pathFor } from './routes.ts';

/** parseRoute takes the pathname and the query string, the way the URL has them. */
const parse = (url: string) => {
  const [pathname, search = ''] = url.split('?');
  return parseRoute(pathname, search);
};

test('every list has a path that parses back to it', () => {
  for (const status of STATUSES) {
    const route = { view: 'list' as const, status };
    assert.deepEqual(parse(pathFor(route)), route);
  }
});

test('a context filter is part of the URL, so it can be bookmarked', () => {
  const filtered = { view: 'list' as const, status: 'next' as const, context: 'home' };
  assert.equal(pathFor(filtered), '/next?context=home');
  assert.deepEqual(parse('/next?context=home'), filtered);
  // An absent or empty filter is the whole list, never a filter matching nothing.
  assert.deepEqual(parse('/next?context='), { view: 'list', status: 'next' });
  assert.equal(pathFor({ view: 'list', status: 'next', context: undefined }), '/next');
});

test('search carries its query, and an empty one is still the search page', () => {
  assert.equal(pathFor({ view: 'search', query: 'roof @home' }), '/search?q=roof+%40home');
  assert.deepEqual(parse('/search?q=roof+%40home'), { view: 'search', query: 'roof @home' });
  assert.equal(pathFor({ view: 'search', query: '' }), '/search');
  assert.deepEqual(parse('/search'), { view: 'search', query: '' });
});

test('the clarify flow has a path of its own', () => {
  const route = { view: 'clarify' as const };
  assert.equal(pathFor(route), '/clarify');
  assert.deepEqual(parseRoute('/clarify'), route);
});

test('the review and settings each have a path of their own', () => {
  assert.deepEqual(parse(pathFor({ view: 'review' })), { view: 'review' });
  assert.deepEqual(parse(pathFor({ view: 'settings' })), { view: 'settings' });
});

test('projects have a list, and each project a page', () => {
  assert.deepEqual(parse(pathFor({ view: 'projects' })), { view: 'projects' });
  const one = { view: 'project' as const, id: 'p1' };
  assert.equal(pathFor(one), '/projects/p1');
  assert.deepEqual(parseRoute('/projects/p1'), one);
  assert.equal(parseRoute('/projects/p1/extra'), null);
});

test('root and trailing slashes go home or to the list; anything else is unknown', () => {
  assert.deepEqual(parseRoute('/'), HOME);
  assert.deepEqual(parseRoute('/next/'), { view: 'list', status: 'next' });
  for (const bad of ['/nope', '/next/extra', '/Inbox']) assert.equal(parseRoute(bad), null, bad);
});
