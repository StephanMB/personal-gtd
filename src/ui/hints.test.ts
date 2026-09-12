import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHintActive, retiresOnUse } from './hints.ts';
import { makeItem } from '../domain/test-helpers.ts';
import type { Item, Project } from '../domain/model.ts';
import type { Settings } from '../persistence/schema.ts';

const context = (items: Item[] = [], projects: Project[] = [], settings: Settings = {}, here?: { projectActions?: number }) => ({
  items,
  projects,
  settings,
  here,
});

const project = (overrides: Partial<Project> = {}): Project => ({
  id: 'p1',
  title: 'Kitchen painted',
  status: 'active',
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

test('an explanation waits until the situation it explains is true', () => {
  // Contexts: only once you have captured a few things and used none.
  const two = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
  const three = [...two, makeItem({ id: 'c' })];
  assert.equal(isHintActive('capture-context', context(two)), false, 'not on an almost empty app');
  assert.equal(isHintActive('capture-context', context(three)), true);
  assert.equal(
    isHintActive('capture-context', context([...two, makeItem({ id: 'c', context: 'errands' })])),
    false,
    'nothing to explain once you are already doing it',
  );

  // Clarifying: only once reading the list stops being the way through it.
  assert.equal(isHintActive('clarify-inbox', context(two)), false);
  assert.equal(isHintActive('clarify-inbox', context(three)), true);

  // Stalled: only when something actually has stopped.
  assert.equal(isHintActive('stalled-projects', context([], [project()])), true);
  const moving = [makeItem({ id: 'x', status: 'next', projectId: 'p1' })];
  assert.equal(isHintActive('stalled-projects', context(moving, [project()])), false);

  // Backup: only once there is enough in here to be worth losing.
  const five = Array.from({ length: 5 }, (_, i) => makeItem({ id: `i${i}` }));
  assert.equal(isHintActive('export-backup', context(three)), false);
  assert.equal(isHintActive('export-backup', context(five)), true);
  assert.equal(isHintActive('export-backup', context(five, [], { lastExportAt: 1 })), false, 'already exporting');

  // The first action of a project, on that project's page.
  assert.equal(isHintActive('project-first-action', context([], [], {}, { projectActions: 0 })), true);
  assert.equal(isHintActive('project-first-action', context([], [], {}, { projectActions: 2 })), false);
  assert.equal(isHintActive('project-first-action', context()), false, 'not outside a project page');
});

test('an explanation that has been used or waved away never comes back', () => {
  const three = [makeItem({ id: 'a' }), makeItem({ id: 'b' }), makeItem({ id: 'c' })];
  assert.equal(isHintActive('clarify-inbox', context(three)), true);
  assert.equal(isHintActive('clarify-inbox', context(three, [], { dismissedHints: ['clarify-inbox'] })), false);
  assert.equal(
    isHintActive('capture-context', context(three, [], { dismissedHints: ['clarify-inbox'] })),
    true,
    'and dismissing one says nothing about the others',
  );
});

test('hints about a control retire when you use it; hints about typing do not', () => {
  for (const id of ['clarify-inbox', 'clarify-keys', 'stalled-projects', 'export-backup', 'review-cadence'] as const) {
    assert.equal(retiresOnUse(id), true, id);
  }
  // These two are about what you type, and stop applying by themselves.
  assert.equal(retiresOnUse('capture-context'), false);
  assert.equal(retiresOnUse('project-first-action'), false);
});
