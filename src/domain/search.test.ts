import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Item, Project } from './model.ts';
import { isEmpty, parseQuery, searchItems, searchProjects } from './search.ts';

const NOW = 1_780_000_000_000;

const item = (id: string, title: string, extra: Partial<Item> = {}): Item => ({
  id,
  title,
  status: 'next',
  createdAt: NOW,
  updatedAt: NOW,
  ...extra,
});

const project = (id: string, title: string, extra: Partial<Project> = {}): Project => ({
  id,
  title,
  status: 'active',
  createdAt: NOW,
  updatedAt: NOW,
  ...extra,
});

test('a query is words to find and @tags to narrow by', () => {
  assert.deepEqual(parseQuery('  roof  @Home '), { terms: ['roof'], contexts: ['home'] });
  assert.deepEqual(parseQuery('Ring THE vet'), { terms: ['ring', 'the', 'vet'], contexts: [] });
  // A lone @ is someone mid-thought, not a filter that hides everything.
  assert.deepEqual(parseQuery('@'), { terms: ['@'], contexts: [] });
  assert.equal(isEmpty(parseQuery('   ')), true);
});

test('the start of a title beats a word inside it, which beats anywhere else', () => {
  const items = [
    item('mid', 'Reroofing quote'),
    item('word', 'Fix the roof tiles'),
    item('start', 'Roof needs looking at'),
  ];
  assert.deepEqual(
    searchItems(items, parseQuery('roof')).map((i) => i.id),
    ['start', 'word', 'mid'],
  );
});

test('every word has to match, and the first one decides the order', () => {
  const items = [item('1', 'Ring the dentist'), item('2', 'Ring the vet')];
  assert.deepEqual(
    searchItems(items, parseQuery('ring vet')).map((i) => i.id),
    ['2'],
  );
  assert.deepEqual(searchItems(items, parseQuery('ring plumber')), []);
});

test('an @tag narrows to one context, and matches it however it was typed', () => {
  const items = [
    item('1', 'Ring the dentist', { context: 'Calls' }),
    item('2', 'Ring the vet', { context: 'errands' }),
  ];
  assert.deepEqual(
    searchItems(items, parseQuery('ring @calls')).map((i) => i.id),
    ['1'],
  );
  // The tag alone is a filter in its own right.
  assert.deepEqual(
    searchItems(items, parseQuery('@errands')).map((i) => i.id),
    ['2'],
  );
});

test('what is finished or deleted does not crowd out what is not', () => {
  const items = [
    item('done', 'Roof inspected', { status: 'done', completedAt: NOW, updatedAt: NOW + 10 }),
    item('open', 'Roof quote to chase'),
    item('gone', 'Roof something', { deletedAt: NOW }),
  ];
  assert.deepEqual(
    searchItems(items, parseQuery('roof')).map((i) => i.id),
    ['open', 'done'],
  );
});

test('projects are searched too, but a context tag rules them out', () => {
  const projects = [project('p1', 'House sale completed'), project('p2', 'Garden ready')];
  assert.deepEqual(
    searchProjects(projects, parseQuery('house')).map((p) => p.id),
    ['p1'],
  );
  assert.deepEqual(searchProjects(projects, parseQuery('house @home')), []);
});

test('an empty query finds nothing rather than everything', () => {
  assert.deepEqual(searchItems([item('1', 'Anything')], parseQuery('')), []);
  assert.deepEqual(searchProjects([project('p1', 'Anything')], parseQuery('  ')), []);
});
