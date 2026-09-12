import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createLocalStorageRepository,
  DATA_KEY,
  LEGACY_KEY,
  PRE_MIGRATION_PREFIX,
  QUARANTINE_PREFIX,
  type KeyValueStore,
} from './repository.ts';
import { SCHEMA_VERSION } from './schema.ts';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  failWrites = false;
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException('full', 'QuotaExceededError');
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  get length() {
    return this.data.size;
  }
}

const v1 = JSON.stringify([{ id: 'a', title: 'A', status: 'done', createdAt: 1, updatedAt: 2 }]);

function setup(initial: Record<string, string> = {}) {
  const store = new MemoryStore();
  for (const [k, v] of Object.entries(initial)) store.data.set(k, v);
  return { store, repo: createLocalStorageRepository(() => store, null) };
}

test('empty storage loads as empty', () => {
  assert.deepEqual(setup().repo.load(), { kind: 'empty' });
});

test('legacy data is migrated in memory and saving never touches the legacy key', () => {
  const { store, repo } = setup({ [LEGACY_KEY]: v1 });
  const loaded = repo.load();
  assert.ok(loaded.kind === 'ok');
  if (loaded.kind !== 'ok') return;
  assert.equal(loaded.source, LEGACY_KEY);
  assert.equal(loaded.from, 1);
  assert.equal(loaded.items[0].completedAt, 2);

  assert.equal(repo.save(loaded.items).ok, true);
  assert.equal(store.getItem(LEGACY_KEY), v1, 'legacy copy untouched (rollback safety)');
  assert.equal(JSON.parse(store.getItem(DATA_KEY)!).schemaVersion, SCHEMA_VERSION);

  const reloaded = repo.load();
  assert.ok(reloaded.kind === 'ok' && reloaded.source === DATA_KEY && reloaded.from === SCHEMA_VERSION);
});

test('current data wins over legacy data', () => {
  const current = JSON.stringify({ schemaVersion: SCHEMA_VERSION, items: [] });
  const { repo } = setup({ [LEGACY_KEY]: v1, [DATA_KEY]: current });
  const loaded = repo.load();
  assert.ok(loaded.kind === 'ok' && loaded.items.length === 0);
});

test('corrupt, newer and unavailable are reported, never thrown', () => {
  assert.equal(setup({ [DATA_KEY]: '{oops' }).repo.load().kind, 'corrupt');
  assert.deepEqual(setup({ [DATA_KEY]: JSON.stringify({ schemaVersion: 99, items: [] }) }).repo.load(), {
    kind: 'newer',
    version: 99,
  });
  const throwing = createLocalStorageRepository(() => {
    throw new DOMException('blocked', 'SecurityError');
  }, null);
  assert.equal(throwing.load().kind, 'unavailable');
  assert.equal(throwing.save([]).ok, false);
  assert.equal(throwing.stash('p:', 'x'), null);
});

test('save failures are returned, not thrown', () => {
  const { store, repo } = setup();
  store.failWrites = true;
  const r = repo.save([]);
  assert.equal(r.ok, false);
});

test('stash keeps a copy under a prefixed key', () => {
  const { store, repo } = setup();
  const key = repo.stash('gtd:quarantine:', 'raw');
  assert.ok(key?.startsWith('gtd:quarantine:'));
  assert.equal(store.getItem(key!), 'raw');
});

test('copies set aside can be listed, read, deleted and put back', () => {
  const { store, repo } = setup();
  const key = repo.stash(QUARANTINE_PREFIX, '{oops')!;
  repo.stash(`${PRE_MIGRATION_PREFIX}v1:`, '[]');
  store.data.set('unrelated', 'x');

  const copies = repo.listStashed();
  assert.deepEqual(copies.map((c) => c.reason).sort(), ['pre-migration', 'unreadable'], 'and nothing unrelated');
  const quarantined = copies.find((c) => c.key === key)!;
  assert.equal(quarantined.size, '{oops'.length);
  assert.ok(quarantined.savedAt instanceof Date, 'the key carries when it was set aside');
  assert.equal(repo.readStashed(key), '{oops');

  repo.deleteStashed(key);
  assert.equal(repo.readStashed(key), null);
  assert.equal(repo.listStashed().length, 1);

  assert.equal(repo.writeStashed(key, '{oops'), true, 'so deleting one can be undone');
  assert.equal(repo.listStashed().length, 2);
});

test('reaching for copies never throws when storage is blocked', () => {
  const throwing = createLocalStorageRepository(() => {
    throw new DOMException('blocked', 'SecurityError');
  }, null);
  assert.deepEqual(throwing.listStashed(), []);
  assert.equal(throwing.readStashed('k'), null);
  assert.equal(throwing.writeStashed('k', 'v'), false);
  throwing.deleteStashed('k');
});
