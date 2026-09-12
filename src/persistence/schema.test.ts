import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrate, detectVersion, SCHEMA_VERSION } from './schema.ts';

const v1Sample: unknown = JSON.parse(readFileSync(new URL('./fixtures/v1-sample.json', import.meta.url), 'utf8'));
const v2Sample: unknown = JSON.parse(readFileSync(new URL('./fixtures/v2-sample.json', import.meta.url), 'utf8'));

test('detectVersion', () => {
  assert.equal(detectVersion([]), 1);
  assert.equal(detectVersion({ schemaVersion: 2, items: [] }), 2);
  assert.equal(detectVersion({ schemaVersion: 7 }), 7);
  for (const bad of [null, 'x', {}, { schemaVersion: '2' }, { schemaVersion: 1.5 }]) assert.equal(detectVersion(bad), null);
});

test('v1 fixture migrates to the current schema', () => {
  const r = migrate(v1Sample);
  assert.equal(r.kind, 'ok');
  if (r.kind !== 'ok') return;
  assert.equal(r.from, 1);
  assert.equal(r.doc.schemaVersion, SCHEMA_VERSION);
  assert.equal(r.invalid, 1, 'the "archived" entry is dropped and counted');
  assert.deepEqual(r.doc.items.map((i) => i.id), ['a1', 'a2', 'a3']);
  const done = r.doc.items.find((i) => i.id === 'a3');
  assert.equal(done?.completedAt, 3000, 'completedAt backfilled from updatedAt');
  assert.equal(r.doc.items.find((i) => i.id === 'a2')?.completedAt, undefined);
  assert.deepEqual(r.doc.projects, [], 'and arrives with the collection v3 added');
});

test('current-version documents pass through unchanged', () => {
  const doc = {
    schemaVersion: SCHEMA_VERSION,
    items: [{ id: 'x', title: 't', status: 'inbox', createdAt: 1, updatedAt: 1 }],
    projects: [{ id: 'p', title: 'Kitchen painted', status: 'active', createdAt: 1, updatedAt: 1 }],
  };
  const r = migrate(doc);
  assert.ok(r.kind === 'ok' && r.from === SCHEMA_VERSION && r.invalid === 0);
  assert.deepEqual(r.kind === 'ok' && r.doc, doc);
});

test('migrating is idempotent: migrate(migrate(x).doc) === migrate(x).doc', () => {
  const first = migrate(v1Sample);
  assert.ok(first.kind === 'ok');
  const second = migrate(first.kind === 'ok' ? first.doc : null);
  assert.deepEqual(second.kind === 'ok' && second.doc, first.doc);
});

test('documents from a newer version are refused, not guessed at', () => {
  assert.deepEqual(migrate({ schemaVersion: SCHEMA_VERSION + 1, items: [] }), { kind: 'newer', version: SCHEMA_VERSION + 1 });
});

test('unrecognisable shapes are corrupt', () => {
  for (const bad of [null, {}, { schemaVersion: 2 }, { schemaVersion: 2, items: 'nope' }]) {
    assert.equal(migrate(bad).kind, 'corrupt', JSON.stringify(bad));
  }
});

test('v2 fixture gains the projects collection and keeps every item as it was', () => {
  const r = migrate(v2Sample);
  assert.equal(r.kind, 'ok');
  if (r.kind !== 'ok') return;
  assert.equal(r.from, 2);
  assert.equal(r.doc.schemaVersion, SCHEMA_VERSION);
  assert.equal(r.invalid, 0);
  assert.deepEqual(r.doc.projects, [], 'a new collection starts empty');
  assert.deepEqual((v2Sample as { items: unknown[] }).items, r.doc.items, 'items are untouched by this migration');
  assert.equal(r.doc.items.find((i) => i.id === 'b4')?.deletedAt, 1200, 'tombstones survive');
});

test('projects are validated like items, and bad ones are counted', () => {
  const r = migrate({
    schemaVersion: 3,
    items: [],
    projects: [
      { id: 'p1', title: 'Kitchen painted', status: 'active', createdAt: 1, updatedAt: 1 },
      { id: 'p2', title: 'Broken', status: 'archived', createdAt: 1, updatedAt: 1 },
      { id: 'p3', title: 'Says done without a time', status: 'done', createdAt: 1, updatedAt: 1 },
    ],
  });
  assert.ok(r.kind === 'ok');
  if (r.kind !== 'ok') return;
  assert.deepEqual(r.doc.projects.map((p) => p.id), ['p1']);
  assert.equal(r.invalid, 2);
});

test('migrating a v3 document twice changes nothing', () => {
  const first = migrate(v2Sample);
  assert.ok(first.kind === 'ok');
  const second = migrate(first.kind === 'ok' ? first.doc : null);
  assert.deepEqual(second.kind === 'ok' && second.doc, first.kind === 'ok' && first.doc);
});
