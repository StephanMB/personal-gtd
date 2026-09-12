import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA_KEY, LEGACY_KEY } from '../persistence/repository.ts';
import { itemsInStatus, live } from '../domain/queries.ts';
import { MemoryStore, openTab } from './test-helpers.ts';

const stored = (s: MemoryStore) => JSON.parse(s.getItem(DATA_KEY) ?? 'null');
const titles = (items: readonly { title: string }[]) => items.map((i) => i.title);

test('capture, move and undo round trip through storage', async () => {
  const storage = new MemoryStore();
  const store = openTab(storage);
  const r = await store.dispatch({ type: 'capture', input: 'Buy milk @errands' });
  assert.ok(r.ok && r.entryId !== null);
  const [item] = store.getState().items;
  assert.equal(item.context, 'errands');
  assert.equal(stored(storage).items.length, 1);

  await store.dispatch({ type: 'move', id: item.id, to: 'next' });
  assert.equal(itemsInStatus([...store.getState().items], 'next').length, 1);

  assert.ok((await store.dispatch({ type: 'undo' })).ok);
  assert.equal(store.getState().items[0].status, 'inbox');
  assert.ok((await store.dispatch({ type: 'undo' })).ok, 'undoing twice in a row works');
  assert.deepEqual(live([...store.getState().items]), [], 'undoing the capture leaves a tombstone');
  assert.deepEqual(await store.dispatch({ type: 'undo' }), { ok: false, reason: 'nothing-to-undo' });
});

test('commands run one at a time, in dispatch order', async () => {
  const store = openTab(new MemoryStore());
  const results = await Promise.all(['one', 'two', 'three'].map((input) => store.dispatch({ type: 'capture', input })));
  assert.ok(results.every((r) => r.ok));
  assert.deepEqual(titles(store.getState().items), ['one', 'two', 'three']);
});

test('a command sees what another tab saved, and fails cleanly on stale targets', async () => {
  const storage = new MemoryStore();
  const tabA = openTab(storage);
  const tabB = openTab(storage);
  await tabA.dispatch({ type: 'capture', input: 'shared' });
  const id = tabA.getState().items[0].id;

  await tabB.dispatch({ type: 'capture', input: 'from B' });
  assert.deepEqual(titles(tabB.getState().items), ['shared', 'from B'], 'B re-read before writing');

  await tabB.dispatch({ type: 'remove', id });
  assert.deepEqual(await tabA.dispatch({ type: 'move', id, to: 'next' }), { ok: false, reason: 'deleted' });
});

test('undo refuses to overwrite a change made in another tab', async () => {
  const storage = new MemoryStore();
  const tabA = openTab(storage);
  const tabB = openTab(storage);
  await tabA.dispatch({ type: 'capture', input: 'x' });
  const id = tabA.getState().items[0].id;
  await tabA.dispatch({ type: 'move', id, to: 'next' });
  await tabB.dispatch({ type: 'move', id, to: 'done' });
  assert.deepEqual(await tabA.dispatch({ type: 'undo' }), { ok: false, reason: 'undo-conflict' });
  assert.equal(tabA.getState().items[0].status, 'done');
});

test('undo by entry id reverts that change only (the toast Undo)', async () => {
  const store = openTab(new MemoryStore());
  await store.dispatch({ type: 'capture', input: 'a' });
  await store.dispatch({ type: 'capture', input: 'b' });
  const [a] = store.getState().items;
  const removed = await store.dispatch({ type: 'remove', id: a.id });
  await store.dispatch({ type: 'capture', input: 'c' });
  assert.ok(removed.ok && removed.entryId !== null);
  await store.dispatch({ type: 'undo', entryId: removed.ok ? removed.entryId! : -1 });
  assert.deepEqual(titles(live([...store.getState().items])), ['a', 'b', 'c']);
});

test('undo history is bounded', async () => {
  const store = openTab(new MemoryStore(), { undoLimit: 2 });
  for (const input of ['1', '2', '3']) await store.dispatch({ type: 'capture', input });
  assert.equal(store.getState().undoStack.length, 2);
});

test('a failed save keeps memory ahead of storage until saving works again', async () => {
  const storage = new MemoryStore();
  const store = openTab(storage);
  await store.dispatch({ type: 'capture', input: 'saved' });
  storage.failWrites = true;
  await store.dispatch({ type: 'capture', input: 'only in memory' });
  assert.equal(store.getState().problem?.kind, 'save-failed');
  assert.equal(store.getState().unsaved, true);

  await store.dispatch({ type: 'capture', input: 'still only in memory' });
  assert.equal(store.getState().items.length, 3, 'the re-read did not throw memory away');

  storage.failWrites = false;
  await store.dispatch({ type: 'capture', input: 'recovered' });
  assert.equal(store.getState().problem, null);
  assert.equal(store.getState().unsaved, false);
  assert.equal(stored(storage).items.length, 4);
});

test('boot: corrupt data is quarantined and the app carries on', async () => {
  const storage = new MemoryStore();
  storage.data.set(DATA_KEY, '{oops');
  const store = openTab(storage);
  const problem = store.getState().problem;
  assert.ok(problem?.kind === 'corrupt' && problem.copyKey?.startsWith('gtd:quarantine:'));
  assert.equal(storage.getItem(problem.kind === 'corrupt' ? problem.copyKey! : ''), '{oops');
  await store.dispatch({ type: 'capture', input: 'after' });
  assert.equal(stored(storage).items.length, 1);
});

test('boot: when no safety copy fits, saving pauses until the user resumes', async () => {
  const storage = new MemoryStore();
  storage.data.set(DATA_KEY, '{oops');
  storage.failWrites = true;
  const store = openTab(storage);
  assert.equal(store.getState().problem?.kind, 'paused');

  storage.failWrites = false;
  await store.dispatch({ type: 'capture', input: 'while paused' });
  assert.equal(storage.getItem(DATA_KEY), '{oops', 'the only copy is untouched');
  assert.equal(store.getState().unsaved, true);

  store.resumeSaving();
  assert.equal(store.getState().problem, null);
  assert.deepEqual(titles(stored(storage).items), ['while paused']);
});

test('boot: data from a newer schema makes the tab read-only', async () => {
  const storage = new MemoryStore();
  const newer = JSON.stringify({ schemaVersion: 99, items: [] });
  storage.data.set(DATA_KEY, newer);
  const store = openTab(storage);
  assert.deepEqual(store.getState().problem, { kind: 'newer', version: 99 });
  await store.dispatch({ type: 'capture', input: 'x' });
  assert.equal(storage.getItem(DATA_KEY), newer);
  store.dismissProblem();
  assert.equal(store.getState().problem?.kind, 'newer', 'blocking problems cannot be dismissed');
});

test('boot: step-1 data is migrated and saved without a problem', () => {
  const storage = new MemoryStore();
  const v1 = JSON.stringify([{ id: 'a', title: 'Old', status: 'done', createdAt: 1, updatedAt: 3 }]);
  storage.data.set(LEGACY_KEY, v1);
  const store = openTab(storage);
  assert.equal(store.getState().problem, null);
  assert.equal(stored(storage).schemaVersion, 4);
  assert.equal(storage.getItem(LEGACY_KEY), v1);
});

test('boot: unavailable storage is reported', () => {
  const store = openTab(new MemoryStore(), {
    repository: {
      load: () => ({ kind: 'unavailable', error: new Error('blocked') }),
      save: () => ({ ok: false, error: new Error('blocked') }),
      stash: () => null,
      subscribe: () => () => {},
      listStashed: () => [],
      readStashed: () => null,
      writeStashed: () => false,
      deleteStashed: () => {},
    },
  });
  assert.deepEqual(store.getState().problem, { kind: 'unavailable' });
});

test('import merges, reports counts, and is undoable as one step', async () => {
  const store = openTab(new MemoryStore());
  await store.dispatch({ type: 'capture', input: 'mine' });
  const incoming = [{ id: 'x', title: 'imported', status: 'next' as const, createdAt: 1, updatedAt: 1 }];
  const r = await store.dispatch({ type: 'import', items: incoming, projects: [], settings: {} });
  assert.deepEqual(r.ok && r.counts, { added: 1, updated: 0, deleted: 0 });
  await store.dispatch({ type: 'undo' });
  assert.deepEqual(titles(live([...store.getState().items])), ['mine']);
  const again = await store.dispatch({ type: 'import', items: [], projects: [], settings: {} });
  assert.deepEqual(again, { ok: true, entryId: null, counts: { added: 0, updated: 0, deleted: 0 } });
});

test('subscribers hear every state change and can unsubscribe', async () => {
  const store = openTab(new MemoryStore());
  let calls = 0;
  const off = store.subscribe(() => calls++);
  await store.dispatch({ type: 'capture', input: 'x' });
  assert.ok(calls > 0);
  off();
  const before = calls;
  await store.dispatch({ type: 'capture', input: 'y' });
  assert.equal(calls, before);
});

test('the underlying error of a failed save is reported, not swallowed', async () => {
  const storage = new MemoryStore();
  const errors: unknown[] = [];
  const store = openTab(storage, { onError: (_message, error) => errors.push(error) });
  storage.failWrites = true;
  await store.dispatch({ type: 'capture', input: 'x' });
  assert.equal(store.getState().problem?.kind, 'save-failed');
  assert.equal(errors.length, 1, 'the banner says what, onError says why');
  assert.ok(errors[0] instanceof DOMException);
});

test('a bug inside a command is reported and answered, not left as a rejection', async () => {
  const messages: string[] = [];
  let broken = false;
  const store = openTab(new MemoryStore(), {
    repository: {
      load: () => {
        if (broken) throw new Error('boom');
        return { kind: 'empty' };
      },
      save: () => ({ ok: true, raw: '' }),
      stash: () => null,
      subscribe: () => () => {},
      listStashed: () => [],
      readStashed: () => null,
      writeStashed: () => false,
      deleteStashed: () => {},
    },
    onError: (message) => messages.push(message),
  });
  broken = true;
  assert.deepEqual(await store.dispatch({ type: 'capture', input: 'x' }), { ok: false, reason: 'internal-error' });
  assert.deepEqual(messages, ['[gtd] command failed']);
});

test('a newer schema appearing after boot locks the tab instead of being overwritten', async () => {
  const storage = new MemoryStore();
  const store = openTab(storage);
  await store.dispatch({ type: 'capture', input: 'mine' });

  const newer = JSON.stringify({ schemaVersion: 99, items: [] });
  storage.data.set(DATA_KEY, newer);
  await store.dispatch({ type: 'capture', input: 'after' });

  assert.equal(store.getState().problem?.kind, 'newer');
  assert.equal(storage.getItem(DATA_KEY), newer, 'an older build never writes over newer data');
  assert.equal(store.getState().unsaved, true);
});

test('data that turns unreadable after boot is copied aside exactly once', async () => {
  const storage = new MemoryStore();
  const store = openTab(storage);
  await store.dispatch({ type: 'capture', input: 'mine' });

  storage.data.set(DATA_KEY, '{oops');
  await store.dispatch({ type: 'capture', input: 'after' });

  const problem = store.getState().problem;
  assert.ok(problem?.kind === 'corrupt' && problem.copyKey);
  const copies = () => [...storage.data.keys()].filter((k) => k.startsWith('gtd:quarantine:'));
  assert.equal(copies().length, 1);
  assert.equal(storage.data.get(copies()[0]), '{oops');
  assert.deepEqual(titles(stored(storage).items), ['mine', 'after'], 'work continues on top of memory');

  await store.dispatch({ type: 'capture', input: 'more' });
  assert.equal(copies().length, 1, 'the same damaged data is never copied twice');
});

test('a command notifies subscribers once: an unchanged read is not an update', async () => {
  const store = openTab(new MemoryStore());
  await store.dispatch({ type: 'capture', input: 'one' });
  let calls = 0;
  store.subscribe(() => calls++);
  await store.dispatch({ type: 'capture', input: 'two' });
  assert.equal(calls, 1, 're-reading our own write must not re-render the lists');
});

test('clarifying: rename then complete, both undoable', async () => {
  const storage = new MemoryStore();
  const store = openTab(storage);
  await store.dispatch({ type: 'capture', input: "Mom's birthday" });
  const { id } = store.getState().items[0];

  await store.dispatch({ type: 'rename', id, title: 'Call the bakery' });
  assert.equal(store.getState().items[0].title, 'Call the bakery');
  assert.deepEqual(await store.dispatch({ type: 'rename', id, title: '  ' }), { ok: false, reason: 'empty-input' });

  await store.dispatch({ type: 'complete', id });
  assert.equal(store.getState().items[0].status, 'done', 'straight from the inbox: the two-minute rule');
  assert.equal(stored(storage).items[0].status, 'done');

  await store.dispatch({ type: 'undo' });
  assert.equal(store.getState().items[0].status, 'inbox');
  await store.dispatch({ type: 'undo' });
  assert.equal(store.getState().items[0].title, "Mom's birthday");
});

test('projects load, survive a save, and import alongside items', async () => {
  const storage = new MemoryStore();
  const project = { id: 'p1', title: 'Kitchen painted', status: 'active' as const, createdAt: 1, updatedAt: 1 };
  storage.data.set(DATA_KEY, JSON.stringify({ schemaVersion: 3, items: [], projects: [project] }));

  const store = openTab(storage);
  assert.deepEqual(store.getState().projects, [project], 'a second collection loads');

  await store.dispatch({ type: 'capture', input: 'Buy paint' });
  assert.deepEqual(stored(storage).projects, [project], 'and an item command does not drop it');

  const incoming = { id: 'p2', title: 'Taxes filed', status: 'active' as const, createdAt: 2, updatedAt: 2 };
  const r = await store.dispatch({ type: 'import', items: [], projects: [incoming], settings: {} });
  assert.deepEqual(r.ok && r.counts, { added: 1, updated: 0, deleted: 0 });
  assert.deepEqual(stored(storage).projects.map((p: { id: string }) => p.id), ['p1', 'p2']);

  await store.dispatch({ type: 'undo' });
  assert.deepEqual(
    live(store.getState().projects).map((p) => p.id),
    ['p1'],
    'importing projects is undoable too, and undoing a creation leaves a tombstone',
  );
});

test('promoting a capture changes both collections, and undo puts both back', async () => {
  const storage = new MemoryStore();
  const store = openTab(storage);
  await store.dispatch({ type: 'capture', input: "Mom's birthday" });
  const { id } = store.getState().items[0];

  const promoted = await store.dispatch({ type: 'promote', id });
  assert.ok(promoted.ok);
  assert.deepEqual(live(store.getState().items), [], 'the item became the project');
  assert.equal(live(store.getState().projects).length, 1);
  const projectId = store.getState().projects[0].id;

  // The first action of the project, captured straight into it.
  await store.dispatch({ type: 'capture', input: 'Call the bakery', projectId });
  assert.equal(live(store.getState().items)[0].projectId, projectId);
  assert.equal(stored(storage).items.at(-1).projectId, projectId);

  await store.dispatch({ type: 'setProjectStatus', id: projectId, status: 'done' });
  assert.equal(store.getState().projects[0].completedAt !== undefined, true);

  await store.dispatch({ type: 'undo' });
  assert.equal(store.getState().projects[0].status, 'active', 'project changes undo like anything else');
});

test('undoing a promote restores the item and tombstones the project, together', async () => {
  const store = openTab(new MemoryStore());
  await store.dispatch({ type: 'capture', input: 'Paint the kitchen' });
  const { id } = store.getState().items[0];
  await store.dispatch({ type: 'promote', id });

  await store.dispatch({ type: 'undo' });
  assert.deepEqual(live(store.getState().items).map((i) => i.title), ['Paint the kitchen']);
  assert.deepEqual(live(store.getState().projects), [], 'both halves of one command come back together');
});
