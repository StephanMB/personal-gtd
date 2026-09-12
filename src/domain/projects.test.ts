import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promote, renameProject, setProjectStatus } from './operations.ts';
import { actionsInProject, activeProjects, stalledProjects } from './queries.ts';
import { isItem, isProject, type Item, type Project, type Status } from './model.ts';
import { makeItem } from './test-helpers.ts';

const project = (overrides: Partial<Project> = {}): Project => ({
  id: 'p1',
  title: 'Kitchen painted',
  status: 'active',
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

test('promote turns the item into a project and leaves a tombstone behind', () => {
  const items = [makeItem({ id: 'a', title: "Mom's birthday" })];
  const r = promote(items, [], 'a', 'p-new', 50);
  assert.ok(r.ok);
  if (!r.ok) return;

  assert.equal(r.projects.length, 1);
  assert.equal(r.projects[0].title, "Mom's birthday", 'the project takes the title you already phrased');
  assert.equal(r.projects[0].status, 'active');
  assert.ok(isProject(r.projects[0]));
  assert.equal(r.items[0].deletedAt, 50, 'the item became the project, so it does not linger as an action');
  assert.ok(isItem(r.items[0]));

  assert.deepEqual(promote(r.items, r.projects, 'a', 'p2', 60), { ok: false, reason: 'deleted' });
  assert.deepEqual(promote(items, [], 'zzz', 'p2', 60), { ok: false, reason: 'not-found' });
});

test('a project can be renamed, finished and dropped, keeping the completedAt invariant', () => {
  const projects = [project()];
  assert.deepEqual(renameProject(projects, 'p1', '   ', 20), { ok: false, reason: 'empty-input' });

  const renamed = renameProject(projects, 'p1', 'Kitchen painted properly', 20);
  assert.ok(renamed.ok && renamed.projects[0].title === 'Kitchen painted properly');

  const done = setProjectStatus(projects, 'p1', 'done', 30);
  assert.ok(done.ok);
  if (!done.ok) return;
  assert.equal(done.projects[0].completedAt, 30);
  assert.ok(isProject(done.projects[0]));

  const reopened = setProjectStatus(done.projects, 'p1', 'active', 40);
  assert.ok(reopened.ok && reopened.projects[0].completedAt === undefined, 'no stale completion time');

  const dropped = setProjectStatus(projects, 'p1', 'dropped', 50);
  assert.ok(dropped.ok && dropped.projects[0].completedAt === undefined);
});

test('stalled: an active project with nothing moving it', () => {
  const action = (status: Status, projectId?: string, extra: Partial<Item> = {}) =>
    makeItem({ id: `${status}-${projectId ?? 'none'}`, status, projectId, ...extra });

  // Each row is a project and the single action it has (or none).
  const cases: { name: string; actions: Item[]; stalled: boolean }[] = [
    { name: 'no actions at all', actions: [], stalled: true },
    { name: 'only an inbox capture', actions: [action('inbox', 'p1')], stalled: true },
    { name: 'only a someday action', actions: [action('someday', 'p1')], stalled: true },
    { name: 'only a finished action', actions: [action('done', 'p1')], stalled: true },
    { name: 'a next action', actions: [action('next', 'p1')], stalled: false },
    { name: 'waiting on someone', actions: [action('waiting', 'p1')], stalled: false },
    { name: 'a next action that was deleted', actions: [action('next', 'p1', { deletedAt: 5 })], stalled: true },
    { name: "someone else's next action", actions: [action('next', 'p2')], stalled: true },
  ];

  for (const { name, actions, stalled } of cases) {
    const result = stalledProjects([project()], actions);
    assert.equal(result.length === 1, stalled, name);
  }

  assert.deepEqual(stalledProjects([project({ status: 'done', completedAt: 1 })], []), [], 'a finished project is not stalled');
  assert.deepEqual(stalledProjects([project({ deletedAt: 5 })], []), [], 'nor is a deleted one');
});

test('project views: active ones oldest first, actions with done last', () => {
  const projects = [
    project({ id: 'p2', createdAt: 2000 }),
    project({ id: 'p1', createdAt: 1000 }),
    project({ id: 'p3', status: 'dropped', createdAt: 500 }),
  ];
  assert.deepEqual(activeProjects(projects).map((p) => p.id), ['p1', 'p2']);

  const items = [
    makeItem({ id: 'done', status: 'done', completedAt: 10, updatedAt: 10, projectId: 'p1' }),
    makeItem({ id: 'old', status: 'next', updatedAt: 20, projectId: 'p1' }),
    makeItem({ id: 'fresh', status: 'next', updatedAt: 30, projectId: 'p1' }),
    makeItem({ id: 'other', status: 'next', updatedAt: 40, projectId: 'p2' }),
  ];
  assert.deepEqual(actionsInProject(items, 'p1').map((i) => i.id), ['fresh', 'old', 'done']);
});
