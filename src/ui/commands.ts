import type { Item, ProjectStatus } from '../domain/model.ts';
import { parseBackup, serializeBackup, backupFilename } from '../persistence/backup.ts';
import type { StashedCopy } from '../persistence/repository.ts';
import type { Command, DispatchResult } from '../store/store.ts';
import { appState, repository, store } from './app-state.ts';
import { copy } from './copy.ts';
import type { Theme } from './appearance.ts';
import type { Language } from './copy.ts';
import type { HintId } from './hints.ts';
import { downloadText } from './download.ts';
import { notify } from './notify.ts';

/**
 * What the UI's buttons and shortcuts call. Each dispatches a store command
 * and turns a failure into a notification. Components never touch the store
 * directly, so "what happens on click" is readable in one file.
 */
export async function run(command: Command): Promise<DispatchResult> {
  const result = await store.dispatch(command);
  if (!result.ok) notify(copy.failure[result.reason], { variant: 'warning' });
  return result;
}

export async function deleteItem(item: Item): Promise<void> {
  const result = await run({ type: 'remove', id: item.id });
  if (result.ok && result.entryId !== null) {
    const entryId = result.entryId;
    notify(copy.deleted(item.title), { action: { label: copy.undo, run: () => void run({ type: 'undo', entryId }) } });
  }
}

/** Clarifying rewrites a capture into the next physical action. */
export async function renameItem(item: Item, title: string): Promise<boolean> {
  const result = await run({ type: 'rename', id: item.id, title });
  return result.ok;
}

/** The two-minute rule: you just did it, so it is done wherever it was. */
export async function completeItem(item: Item): Promise<void> {
  await run({ type: 'complete', id: item.id });
}

/** Some captures are outcomes, not actions. The item becomes the project. */
export async function promoteItem(item: Item): Promise<boolean> {
  const result = await run({ type: 'promote', id: item.id });
  if (result.ok) notify(copy.projects.promoted(item.title), { variant: 'success' });
  return result.ok;
}

export async function setProjectStatus(id: string, status: ProjectStatus): Promise<void> {
  await run({ type: 'setProjectStatus', id, status });
}

export async function undoLast(): Promise<void> {
  const result = await run({ type: 'undo' });
  if (result.ok) notify(copy.undone);
}

export function exportData(): void {
  downloadText(
    backupFilename(),
    serializeBackup({
      items: [...appState.value.items],
      projects: [...appState.value.projects],
      settings: appState.value.settings,
    }),
  );
  void run({ type: 'settings', patch: { lastExportAt: Date.now() } });
}

/** Records the pass, which is what the sidebar nudge counts from. */
export async function finishReview(): Promise<void> {
  await run({ type: 'settings', patch: { lastReviewedAt: Date.now() } });
  notify(copy.review.finished, { variant: 'success' });
}

/**
 * No confirmation dialog: import is one undoable step, and the notification
 * offers Undo. NLDD's guideline, "undo over confirm", fits exactly.
 */
export async function importFile(file: File): Promise<void> {
  const parsed = parseBackup(await file.text());
  if (!parsed.ok) {
    notify(copy.backup.importFailed(parsed.error), { variant: 'critical' });
    return;
  }
  const result = await run({ type: 'import', items: parsed.items, projects: parsed.projects, settings: parsed.settings });
  if (!result.ok || !result.counts) return;
  const entryId = result.entryId;
  notify(copy.backup.imported(result.counts), {
    variant: 'success',
    action: entryId === null ? undefined : { label: copy.undo, run: () => void run({ type: 'undo', entryId }) },
  });
}

/**
 * Data the app set aside because it could not read it. Until now these copies
 * were written and never mentioned again, so the only way back was the
 * browser console. Deleting one is undoable rather than confirmed: it is the
 * design system's guideline, and this is the one copy of that data.
 */
export const listRecovered = (): StashedCopy[] => repository.listStashed();

export function downloadRecovered(entry: StashedCopy): void {
  const raw = repository.readStashed(entry.key);
  if (raw === null) {
    notify(copy.recovered.gone, { variant: 'warning' });
    return;
  }
  downloadText(`gtd-recovered-${entry.savedAt?.toISOString().slice(0, 10) ?? 'data'}.json`, raw);
}

export function deleteRecovered(entry: StashedCopy, afterChange: () => void): void {
  const raw = repository.readStashed(entry.key);
  repository.deleteStashed(entry.key);
  afterChange();
  notify(copy.recovered.deleted, {
    action:
      raw === null
        ? undefined
        : {
            label: copy.undo,
            run: () => {
              repository.writeStashed(entry.key, raw);
              afterChange();
            },
          },
  });
}

/** An explanation that has been used or waved away does not come back. */
export async function dismissHint(id: HintId): Promise<void> {
  const dismissed = appState.value.settings.dismissedHints ?? [];
  if (dismissed.includes(id)) return;
  await run({ type: 'settings', patch: { dismissedHints: [...dismissed, id] } });
}

export async function setTheme(theme: Theme): Promise<void> {
  await run({ type: 'settings', patch: { theme } });
}

export async function setLanguage(chosen: Language): Promise<void> {
  await run({ type: 'settings', patch: { language: chosen } });
}

export const dismissProblem = () => store.dismissProblem();
export const resumeSaving = () => store.resumeSaving();

let persistenceRequested = false;

/** Ask the browser not to evict our storage under disk pressure. Once per session, best effort. */
export async function requestPersistence(): Promise<void> {
  if (persistenceRequested) return;
  persistenceRequested = true;
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // Unsupported or refused: export remains the real safeguard.
  }
}
