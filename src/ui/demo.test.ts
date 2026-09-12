import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isItem, isProject } from '../domain/model.ts';
import { itemsInStatus, completedBetween, stalledProjects, staleWaiting, untouchedSomeday } from '../domain/queries.ts';
import { en } from './copy-en.ts';
import { demoDocument, isDemoUrl } from './demo.ts';

const NOW = 1_780_000_000_000;
const WEEK = 7 * 24 * 60 * 60 * 1000;
const doc = demoDocument(NOW, en.demo.content);

test('the demo is a URL away, and nothing else turns it on', () => {
  assert.equal(isDemoUrl('?demo'), true);
  assert.equal(isDemoUrl('?demo=1'), true);
  assert.equal(isDemoUrl(''), false);
  assert.equal(isDemoUrl('?other=demo'), false);
});

test('every record in the demo is one the app could have made itself', () => {
  for (const item of doc.items) assert.ok(isItem(item), item.title);
  for (const project of doc.projects) assert.ok(isProject(project), project.title);
  const ids = [...doc.items.map((i) => i.id), ...doc.projects.map((p) => p.id)];
  assert.equal(new Set(ids).size, ids.length, 'no duplicate ids');
});

test('the demo shows the things that are otherwise hard to see', () => {
  // A full set of lists, so every view has something in it.
  for (const status of ['inbox', 'next', 'waiting', 'someday', 'done'] as const) {
    assert.ok(itemsInStatus(doc.items, status).length > 0, status);
  }
  // A project that has stopped: the red badge has something to count.
  assert.equal(stalledProjects(doc.projects, doc.items).length, 1);
  // And every step of the weekly review has content.
  assert.ok(staleWaiting(doc.items, NOW).length > 0, 'something worth chasing');
  assert.ok(untouchedSomeday(doc.items, NOW).length > 0, 'something parked too long');
  assert.ok(completedBetween(doc.items, NOW - WEEK, NOW).length > 0, 'something finished this week');
  assert.ok((doc.settings.lastReviewedAt ?? 0) < NOW - WEEK, 'and the review is overdue');
});

test('appearance and language carry into the demo, nothing else does', () => {
  const carried = demoDocument(NOW, en.demo.content, { theme: 'dark', language: 'nl', lastExportAt: 1 });
  assert.equal(carried.settings.theme, 'dark');
  assert.equal(carried.settings.language, 'nl');
});
