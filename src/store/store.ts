import type { Item, Project, Status } from '../domain/model.ts';
import {
  capture,
  complete,
  move,
  remove,
  rename,
  purgeTombstones,
  type OpFailure,
  type OpResult,
} from '../domain/operations.ts';
import { mergeRecords } from '../domain/merge.ts';
import { newId as defaultNewId } from '../domain/ids.ts';
import {
  DATA_KEY,
  LEGACY_KEY,
  PRE_MIGRATION_PREFIX,
  QUARANTINE_PREFIX,
  type LoadResult,
  type Repository,
} from '../persistence/repository.ts';
import { SCHEMA_VERSION, type DocContents } from '../persistence/schema.ts';
import { diff, rebaseChanges, revert, type Change } from './undo.ts';

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
  /** Clarifying rewrites a capture into the next physical action. */
  | { type: 'rename'; id: string; title: string }
  /** The two-minute rule: done from wherever it was. */
  | { type: 'complete'; id: string }
  | { type: 'import'; items: Item[]; projects: Project[] }
  /** Undo the latest change, or a specific one (the toast's Undo button). */
  | { type: 'undo'; entryId?: number };

/**
 * 'not-deleted' is excluded: it can only come from restore(), which no command
 * dispatches. Undo puts deleted items back instead. The domain operation stays
 * for the Trash view that would need it.
 * 'internal-error' is a bug in this app, not something a user can cause.
 */
export type CommandFailure =
  | Exclude<OpFailure, 'not-deleted'>
  | 'nothing-to-undo'
  | 'undo-conflict'
  | 'internal-error';

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

/**
 * One undoable change, per collection. A single command can touch both, so
 * undoing it puts both back or neither.
 */
export interface UndoEntry {
  id: number;
  items: Change<Item>[];
  projects: Change<Project>[];
}

export interface StoreState {
  /** All items, tombstones included. Views go through domain/queries. */
  readonly items: readonly Item[];
  readonly projects: readonly Project[];
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
  /**
   * Where the underlying error of a storage or command failure goes. The user
   * sees a Problem or a failure reason; this is the detail that says why
   * (quota, blocked, private mode), which is exactly what is missing when
   * something goes wrong. Injected so the store stays testable.
   */
  onError?: (message: string, error: unknown) => void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const BLOCKING: ReadonlySet<Problem['kind']> = new Set(['paused', 'newer', 'unavailable']);

export function createStore({
  repository: repo,
  now = Date.now,
  newId = defaultNewId,
  undoLimit = 50,
  onError = (message, error) => console.error(message, error),
}: StoreOptions): Store {
  let state: StoreState = { items: [], projects: [], problem: null, unsaved: false, undoStack: [] };
  const listeners = new Set<(state: StoreState) => void>();
  let queue: Promise<unknown> = Promise.resolve();
  let nextEntryId = 1;
  /** Unreadable data already copied aside, so the same data is never copied twice. */
  let stashed: string | null = null;
  /** What storage held when this tab last looked, so an unchanged read is skipped. */
  let lastRaw: string | null = null;

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

  /**
   * Copy data we could not read aside before a save overwrites it. Returns the
   * key, or null when even the copy did not fit.
   */
  function stash(prefix: string, raw: string): string | null {
    if (raw === stashed) return null;
    const key = repo.stash(prefix, raw);
    if (key) stashed = raw;
    return key;
  }

  /**
   * Storage this tab must not adopt or overwrite, handled the same way at boot
   * and later in the session: unreadable data is copied aside first, data from
   * a newer build locks the tab, and unavailable storage is reported.
   * Returns true when it handled the result.
   */
  function handleUnusable(result: LoadResult): boolean {
    switch (result.kind) {
      case 'corrupt': {
        // The legacy key is never written, so it needs no copy.
        if (result.source === LEGACY_KEY) {
          set({ problem: { kind: 'corrupt', copyKey: null, leftInLegacy: true, raw: result.raw } });
          return true;
        }
        if (result.raw === stashed) return true; // already set aside, banner already shown
        const key = stash(QUARANTINE_PREFIX, result.raw);
        set({
          problem: key
            ? { kind: 'corrupt', copyKey: key, leftInLegacy: false, raw: result.raw }
            : { kind: 'paused', cause: 'corrupt', raw: result.raw },
        });
        return true;
      }

      case 'newer':
        // Written by a newer build (another tab, or after a rollback).
        if (state.problem?.kind !== 'newer') set({ problem: { kind: 'newer', version: result.version } });
        return true;

      case 'unavailable':
        onError('[gtd] storage unavailable', result.error);
        if (state.problem?.kind !== 'unavailable') set({ problem: { kind: 'unavailable' } });
        return true;

      default:
        return false;
    }
  }

  /** Adopt storage when it is safe: never over memory that is ahead of it. */
  function refresh(): void {
    if (!canWrite() || state.unsaved) return;
    const fresh = repo.load();
    if (handleUnusable(fresh)) return;
    if (fresh.kind === 'ok') {
      // Entries we cannot read appeared since boot: set them aside before the
      // next save replaces them.
      if (fresh.invalid > 0 && fresh.source === DATA_KEY) {
        const key = stash(QUARANTINE_PREFIX, fresh.raw);
        if (key) set({ problem: { kind: 'unreadable-items', count: fresh.invalid, copyKey: key } });
        else if (state.problem === null) set({ problem: { kind: 'paused', cause: 'unreadable-items', raw: fresh.raw } });
        return;
      }
      if (fresh.from === SCHEMA_VERSION) {
        // Storage holds exactly what we last saw. Re-parsing it would hand
        // every component new objects and re-render the lists for nothing.
        if (fresh.raw === lastRaw) return;
        lastRaw = fresh.raw;
        set({ items: fresh.items, projects: fresh.projects });
      }
    } else if (fresh.kind === 'empty' && (state.items.length > 0 || state.projects.length > 0)) {
      lastRaw = null;
      set({ items: [], projects: [] });
    }
  }

  /** Commit a document (plus any other state) and write it, reporting failure as a Problem. */
  function save(contents: DocContents, patch: Partial<StoreState> = {}): void {
    if (!canWrite()) {
      set({ ...patch, ...contents, unsaved: true });
      return;
    }
    const result = repo.save(contents);
    if (result.ok) {
      lastRaw = result.raw;
      const problem = state.problem?.kind === 'save-failed' ? null : state.problem;
      set({ ...patch, ...contents, unsaved: false, problem });
    } else {
      onError('[gtd] save failed', result.error);
      set({ ...patch, ...contents, unsaved: true, problem: { kind: 'save-failed' } });
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
      case 'rename':
        return rename(items, command.id, command.title, t);
      case 'complete':
        return complete(items, command.id, t);
    }
  }

  function undo(entryId: number | undefined, before: DocContents): DispatchResult {
    const stack = state.undoStack;
    const entry = entryId === undefined ? stack.at(-1) : stack.find((e) => e.id === entryId);
    if (!entry) return { ok: false, reason: 'nothing-to-undo' };

    const t = now();
    const items = revert(before.items, entry.items, t);
    const projects = revert(before.projects, entry.projects, t);
    // All or nothing across collections: one command can have changed both.
    if (!items.ok || !projects.ok) return { ok: false, reason: 'undo-conflict' };

    const remaining = stack
      .filter((e) => e !== entry)
      .map((e) => {
        const rebasedItems = rebaseChanges(e.items, items.restored);
        const rebasedProjects = rebaseChanges(e.projects, projects.restored);
        return rebasedItems === e.items && rebasedProjects === e.projects
          ? e
          : { ...e, items: rebasedItems, projects: rebasedProjects };
      });

    save({ items: items.items, projects: projects.items }, { undoStack: remaining });
    return { ok: true, entryId: null };
  }

  function run(command: Command): DispatchResult {
    refresh();
    const before: DocContents = { items: [...state.items], projects: [...state.projects] };

    if (command.type === 'undo') return undo(command.entryId, before);

    let after: DocContents;
    let counts: { added: number; updated: number; deleted: number } | undefined;
    if (command.type === 'import') {
      const items = mergeRecords(before.items, command.items);
      const projects = mergeRecords(before.projects, command.projects);
      after = { items: items.items, projects: projects.items };
      counts = {
        added: items.added + projects.added,
        updated: items.updated + projects.updated,
        deleted: items.deleted + projects.deleted,
      };
    } else {
      const result = apply(command, before.items);
      if (!result.ok) {
        // restore() is the only source of 'not-deleted' and nothing dispatches it.
        return result as { ok: false; reason: CommandFailure };
      }
      after = { items: result.items, projects: before.projects };
    }

    const changed = {
      items: diff(before.items, after.items),
      projects: diff(before.projects, after.projects),
    };
    if (changed.items.length === 0 && changed.projects.length === 0) return { ok: true, entryId: null, counts };

    const entry: UndoEntry = { id: nextEntryId++, ...changed };
    save(after, { undoStack: [...state.undoStack, entry].slice(-undoLimit) });
    return { ok: true, entryId: entry.id, counts };
  }

  function boot(): void {
    const result = repo.load();
    if (!handleUnusable(result)) {
      switch (result.kind) {
        case 'empty':
          break;

        case 'ok': {
          // Anything about to be overwritten that is not already safe elsewhere
          // is stashed first. Legacy data is safe: LEGACY_KEY is never written.
          const needsCopy = result.source === DATA_KEY && (result.invalid > 0 || result.from < SCHEMA_VERSION);
          let problem: Problem | null = null;
          if (needsCopy) {
            const prefix = result.invalid > 0 ? QUARANTINE_PREFIX : `${PRE_MIGRATION_PREFIX}v${result.from}:`;
            const key = stash(prefix, result.raw);
            if (!key) {
              set({
                items: result.items,
                projects: result.projects,
                problem: {
                  kind: 'paused',
                  cause: result.invalid > 0 ? 'unreadable-items' : 'migration',
                  raw: result.raw,
                },
              });
              break;
            }
            if (result.invalid > 0) problem = { kind: 'unreadable-items', count: result.invalid, copyKey: key };
          }
          const items = purgeTombstones(result.items, now());
          const projects = purgeTombstones(result.projects, now());
          lastRaw = result.raw;
          set({ items, projects, problem });
          const purged = items.length !== result.items.length || projects.length !== result.projects.length;
          if (purged || result.from < SCHEMA_VERSION || result.invalid > 0) save({ items, projects });
          break;
        }
      }
    }

    repo.subscribe(() =>
      void enqueue(() => {
        try {
          refresh();
        } catch (error) {
          onError('[gtd] refresh failed', error);
        }
      }),
    );
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /**
     * A thrown error here is a bug, not something a user can cause: report it
     * and answer with a failure, so the click says something went wrong
     * instead of disappearing into an unhandled rejection.
     */
    dispatch: (command) =>
      enqueue((): DispatchResult => {
        try {
          return run(command);
        } catch (error) {
          onError('[gtd] command failed', error);
          return { ok: false, reason: 'internal-error' };
        }
      }),
    boot,
    dismissProblem() {
      if (state.problem && !BLOCKING.has(state.problem.kind) && state.problem.kind !== 'save-failed') set({ problem: null });
    },
    resumeSaving() {
      if (state.problem?.kind !== 'paused') return;
      set({ problem: null });
      save({ items: [...state.items], projects: [...state.projects] });
    },
  };
}
