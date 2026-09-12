import type { Item, Status } from '../domain/model.ts';
import { capture, move, remove, restore, purgeTombstones, type OpFailure, type OpResult } from '../domain/operations.ts';
import { mergeItems } from '../domain/merge.ts';
import { newId as defaultNewId } from '../domain/ids.ts';
import { DATA_KEY, LEGACY_KEY, type Repository } from '../persistence/repository.ts';
import { SCHEMA_VERSION } from '../persistence/schema.ts';
import { diff, rebase, revert, type Change } from './undo.ts';

/**
 * The application store: the one place where state changes.
 *
 * - Framework-free (no Preact, no DOM), so it is tested with node:test and the
 *   UI framework stays replaceable. The architecture test enforces this.
 * - Every command runs through a queue, one at a time. With today's
 *   synchronous repository that changes nothing; it is what keeps "re-read,
 *   apply, save" atomic once the repository becomes async (IndexedDB).
 * - Persistence policy from steps 1 and 2 (quarantine, pause, read-only,
 *   unsaved) lives here now, not in the UI. The UI renders `problem` and
 *   `unsaved`; it decides nothing.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Command =
  | { type: 'capture'; input: string }
  | { type: 'move'; id: string; to: Status }
  | { type: 'remove'; id: string }
  | { type: 'restore'; id: string }
  | { type: 'import'; items: Item[] }
  /** Undo the latest change, or a specific one (the toast's Undo button). */
  | { type: 'undo'; entryId?: number };

export type CommandFailure = OpFailure | 'nothing-to-undo' | 'undo-conflict';

export type DispatchResult =
  | { ok: true; entryId: number | null; counts?: { added: number; updated: number; deleted: number } }
  | { ok: false; reason: CommandFailure };

/** Something the user needs to know about storage. Data, not wording: the UI words it. */
export type Problem =
  | { kind: 'unreadable-items'; count: number; copyKey: string }
  | { kind: 'corrupt'; copyKey: string | null; leftInLegacy: boolean; raw: string }
  | { kind: 'paused'; cause: 'corrupt' | 'unreadable-items' | 'migration'; raw: string }
  | { kind: 'newer'; version: number }
  | { kind: 'unavailable' }
  | { kind: 'save-failed' };

export interface UndoEntry {
  id: number;
  command: Command;
  changes: Change[];
}

export interface StoreState {
  /** All items, tombstones included. Views go through domain/queries. */
  readonly items: readonly Item[];
  readonly problem: Problem | null;
  /** Changes exist that are not in storage. The UI warns before closing. */
  readonly unsaved: boolean;
  /** Newest last. Per tab, in memory. */
  readonly undoStack: readonly UndoEntry[];
}

export interface Store {
  getState(): StoreState;
  subscribe(listener: (state: StoreState) => void): () => void;
  dispatch(command: Command): Promise<DispatchResult>;
  /** Read storage and apply the load policy. Call once, before rendering. */
  boot(): void;
  dismissProblem(): void;
  /** Leave paused mode after the user downloaded the unreadable data. */
  resumeSaving(): void;
}

export interface StoreOptions {
  repository: Repository;
  now?: () => number;
  newId?: () => string;
  undoLimit?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const BLOCKING: ReadonlySet<Problem['kind']> = new Set(['paused', 'newer', 'unavailable']);

export function createStore({ repository: repo, now = Date.now, newId = defaultNewId, undoLimit = 50 }: StoreOptions): Store {
  let state: StoreState = { items: [], problem: null, unsaved: false, undoStack: [] };
  const listeners = new Set<(state: StoreState) => void>();
  let queue: Promise<unknown> = Promise.resolve();
  let nextEntryId = 1;

  function set(patch: Partial<StoreState>): void {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  }

  const canWrite = () => !(state.problem && BLOCKING.has(state.problem.kind));

  /** Serialize work. A failing job must not block the ones behind it. */
  function enqueue<T>(job: () => T | Promise<T>): Promise<T> {
    const run = queue.then(job);
    queue = run.catch(() => undefined);
    return run;
  }

  /** Adopt storage when it is safe: never over memory that is ahead of it. */
  function refresh(): void {
    if (!canWrite() || state.unsaved) return;
    const fresh = repo.load();
    if (fresh.kind === 'ok' && fresh.invalid === 0 && fresh.from === SCHEMA_VERSION) set({ items: fresh.items });
    else if (fresh.kind === 'empty' && state.items.length > 0) set({ items: [] });
  }

  /** Commit `items` (plus any other state) and write it, reporting failure as a Problem. */
  function save(items: readonly Item[], patch: Partial<StoreState> = {}): void {
    if (!canWrite()) {
      set({ ...patch, items, unsaved: true });
      return;
    }
    const result = repo.save([...items]);
    if (result.ok) {
      const problem = state.problem?.kind === 'save-failed' ? null : state.problem;
      set({ ...patch, items, unsaved: false, problem });
    } else {
      set({ ...patch, items, unsaved: true, problem: { kind: 'save-failed' } });
    }
  }

  function apply(command: Exclude<Command, { type: 'undo' } | { type: 'import' }>, items: Item[]): OpResult {
    const t = now();
    switch (command.type) {
      case 'capture':
        return capture(items, command.input, newId(), t);
      case 'move':
        return move(items, command.id, command.to, t);
      case 'remove':
        return remove(items, command.id, t);
      case 'restore':
        return restore(items, command.id, t);
    }
  }

  function run(command: Command): DispatchResult {
    refresh();
    const before = [...state.items];

    if (command.type === 'undo') {
      const stack = state.undoStack;
      const entry = command.entryId === undefined ? stack.at(-1) : stack.find((e) => e.id === command.entryId);
      if (!entry) return { ok: false, reason: 'nothing-to-undo' };
      const reverted = revert(before, entry.changes, now());
      if (!reverted.ok) return reverted;
      save(reverted.items, { undoStack: rebase(stack.filter((e) => e !== entry), reverted.restored) });
      return { ok: true, entryId: null };
    }

    let after: Item[];
    let counts: { added: number; updated: number; deleted: number } | undefined;
    if (command.type === 'import') {
      const merged = mergeItems(before, command.items);
      after = merged.items;
      counts = { added: merged.added, updated: merged.updated, deleted: merged.deleted };
    } else {
      const result = apply(command, before);
      if (!result.ok) return result;
      after = result.items;
    }

    const changes = diff(before, after);
    if (changes.length === 0) return { ok: true, entryId: null, counts };
    const entry: UndoEntry = { id: nextEntryId++, command, changes };
    save(after, { undoStack: [...state.undoStack, entry].slice(-undoLimit) });
    return { ok: true, entryId: entry.id, counts };
  }

  function boot(): void {
    const result = repo.load();
    switch (result.kind) {
      case 'empty':
        break;

      case 'ok': {
        // Anything about to be overwritten that is not already safe elsewhere
        // is stashed first. Legacy data is safe: LEGACY_KEY is never written.
        const needsCopy = result.source === DATA_KEY && (result.invalid > 0 || result.from < SCHEMA_VERSION);
        let problem: Problem | null = null;
        if (needsCopy) {
          const prefix = result.invalid > 0 ? 'gtd:quarantine:' : `gtd:pre-migration:v${result.from}:`;
          const key = repo.stash(prefix, result.raw);
          if (!key) {
            set({
              items: result.items,
              problem: { kind: 'paused', cause: result.invalid > 0 ? 'unreadable-items' : 'migration', raw: result.raw },
            });
            break;
          }
          if (result.invalid > 0) problem = { kind: 'unreadable-items', count: result.invalid, copyKey: key };
        }
        const purged = purgeTombstones(result.items, now());
        set({ items: purged, problem });
        if (purged.length !== result.items.length || result.from < SCHEMA_VERSION || result.invalid > 0) save(purged);
        break;
      }

      case 'corrupt': {
        if (result.source === LEGACY_KEY) {
          set({ problem: { kind: 'corrupt', copyKey: null, leftInLegacy: true, raw: result.raw } });
          break;
        }
        const key = repo.stash('gtd:quarantine:', result.raw);
        set({
          problem: key
            ? { kind: 'corrupt', copyKey: key, leftInLegacy: false, raw: result.raw }
            : { kind: 'paused', cause: 'corrupt', raw: result.raw },
        });
        break;
      }

      case 'newer':
        set({ problem: { kind: 'newer', version: result.version } });
        break;

      case 'unavailable':
        set({ problem: { kind: 'unavailable' } });
        break;
    }

    repo.subscribe(() => void enqueue(refresh));
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch: (command) => enqueue(() => run(command)),
    boot,
    dismissProblem() {
      if (state.problem && !BLOCKING.has(state.problem.kind) && state.problem.kind !== 'save-failed') set({ problem: null });
    },
    resumeSaving() {
      if (state.problem?.kind !== 'paused') return;
      set({ problem: null });
      save(state.items);
    },
  };
}
