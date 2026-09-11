import { STATUSES, type Item, type Status } from '../domain/model.ts';
import { newId } from '../domain/ids.ts';
import { TRANSITIONS } from '../domain/transitions.ts';
import { capture, move, remove, restore, purgeTombstones, type OpFailure, type OpResult } from '../domain/operations.ts';
import { itemsInStatus } from '../domain/queries.ts';
import { mergeItems } from '../domain/merge.ts';
import { createLocalStorageRepository, DATA_KEY, LEGACY_KEY } from '../persistence/repository.ts';
import { SCHEMA_VERSION } from '../persistence/schema.ts';
import { serializeBackup, backupFilename, parseBackup } from '../persistence/backup.ts';
import { downloadText } from './download.ts';

// ---------------------------------------------------------------------------
// Presentation constants (labels are UI; which moves exist is domain)
// ---------------------------------------------------------------------------

const SECTION_LABELS: Record<Status, string> = {
  inbox: 'Inbox',
  next: 'Next actions',
  waiting: 'Waiting for',
  someday: 'Someday / maybe',
  done: 'Done',
};

function moveLabel(from: Status, to: Status): string {
  if (from === 'done') return '↺ Reopen';
  if (to === 'done') return '✓ Done';
  return `→ ${SECTION_LABELS[to].split(' ')[0]}`;
}

const FAILURE_MESSAGES: Record<OpFailure, string> = {
  'empty-input': 'Nothing to capture.',
  'not-found': 'That item no longer exists (it may have been changed in another tab).',
  'not-allowed': 'That item was moved in another tab. The list has been refreshed.',
  deleted: 'That item was deleted in another tab.',
  'not-deleted': 'That item was already restored.',
};

const LAST_EXPORT_KEY = 'gtd:lastExportAt';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const repo = createLocalStorageRepository();

/** All items, including tombstones. Views filter through domain/queries. */
let items: Item[] = [];
/** False when storage is unavailable, holds newer-version data, or unreadable data could not be set aside. */
let canWrite = true;
/** True when there are changes that exist only in memory. */
let unsaved = false;
let saveFailed = false;
/** The unreadable data most recently quarantined, so the same data is never copied twice. */
let quarantinedRaw: string | null = null;
let persistenceRequested = false;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Adopt what another tab (or a previous session) saved, if it is safe to do
 * so. Stored data this tab can't read is dealt with first, because the next
 * save would overwrite it.
 */
function refreshFromStorage(): void {
  if (!canWrite || unsaved) return;
  const fresh = repo.load();
  switch (fresh.kind) {
    case 'empty':
      items = [];
      break;
    case 'ok':
      if (fresh.invalid > 0 && fresh.source === DATA_KEY) {
        quarantine(fresh.raw, `${fresh.invalid} saved item(s) could not be read and were left out.`);
      }
      if (fresh.from === SCHEMA_VERSION) items = fresh.items;
      break;
    case 'corrupt':
      // The legacy key is never written, so only gtd:data needs a copy.
      if (fresh.source === DATA_KEY) quarantine(fresh.raw, 'Your saved data could not be read.');
      break;
    case 'newer':
      // Another tab runs a newer build: this one must not write over its data.
      goReadOnly(fresh.version);
      break;
    case 'unavailable':
      break; // Keep memory; the save reports the failure.
  }
}

/**
 * The single path for every change: re-read, apply a pure domain operation,
 * save, render. Step 1's rules are unchanged; what changed is that the
 * operation is now a tested domain function that can refuse.
 */
function commit(operation: (current: Item[]) => OpResult): OpResult {
  refreshFromStorage();
  const result = operation(items);
  if (result.ok) {
    items = result.items;
    save();
  } else {
    showToast(FAILURE_MESSAGES[result.reason]);
  }
  render();
  return result;
}

function save(): void {
  if (!canWrite) {
    unsaved = true;
    return;
  }
  const result = repo.save(items);
  if (result.ok) {
    unsaved = false;
    if (saveFailed) {
      saveFailed = false;
      clearStatus();
    }
  } else {
    unsaved = true;
    saveFailed = true;
    console.error('[gtd] save failed', result.error);
    showStatus(
      'Your last change could not be saved (browser storage may be full or blocked). Export your data now so nothing is lost.',
      [{ label: 'Export', run: exportData }],
    );
  }
}

/** Pause saving until the user has a copy of `raw`. */
function pauseWithDownload(message: string, raw: string): void {
  canWrite = false;
  showStatus(`${message} Saving is paused so it is not overwritten. Download it first, then resume.`, [
    { label: 'Download data', run: () => downloadText('gtd-unreadable-data.json', raw) },
    {
      label: 'Resume saving',
      run: () => {
        canWrite = true;
        clearStatus();
        save();
      },
    },
  ]);
}

/** Copy unreadable data aside before a save can overwrite it; pause saving if even that fails. */
function quarantine(raw: string, problem: string): void {
  if (raw === quarantinedRaw) return;
  const key = repo.stash('gtd:quarantine:', raw);
  if (key) {
    quarantinedRaw = raw;
    showStatus(`${problem} A copy was kept in this browser under "${key}".`, [dismiss]);
  } else {
    pauseWithDownload(problem, raw);
  }
}

/** Data from a newer build (e.g. after a rollback): never overwrite it. */
function goReadOnly(version: number): void {
  canWrite = false;
  showStatus(
    `Your data was saved by a newer version of this app (schema ${version}). This version can't read it, so nothing will be saved here. Reload once the newer version is deployed.`,
  );
}

function boot(): void {
  const result = repo.load();
  switch (result.kind) {
    case 'empty':
      items = [];
      break;

    case 'ok': {
      items = result.items;
      const problems: string[] = [];
      if (result.invalid > 0) problems.push(`${result.invalid} saved item(s) could not be read and were left out.`);

      // Anything we are about to overwrite that is not already safe elsewhere
      // gets stashed first. Legacy data is safe: we never write LEGACY_KEY.
      const needsCopy = result.source === DATA_KEY && (result.invalid > 0 || result.from < SCHEMA_VERSION);
      if (needsCopy) {
        const prefix = result.invalid > 0 ? 'gtd:quarantine:' : `gtd:pre-migration:v${result.from}:`;
        const key = repo.stash(prefix, result.raw);
        if (!key) {
          pauseWithDownload(problems.join(' ') || 'Your data needs an upgrade but no safety copy could be made.', result.raw);
          break;
        }
        if (problems.length) problems.push(`A copy was kept in this browser under "${key}".`);
      } else if (problems.length && result.source === LEGACY_KEY) {
        problems.push(`The original data was left untouched under "${LEGACY_KEY}".`);
      }
      if (problems.length) showStatus(problems.join(' '), [dismiss]);

      const purged = purgeTombstones(items, Date.now());
      const changed = purged.length !== items.length || result.from < SCHEMA_VERSION || result.invalid > 0;
      items = purged;
      if (changed) save(); // writes the current schema version
      break;
    }

    case 'corrupt':
      items = [];
      if (result.source === LEGACY_KEY) {
        showStatus(
          `Your saved data could not be read. It was left untouched under "${LEGACY_KEY}" in this browser.`,
          [{ label: 'Download data', run: () => downloadText('gtd-unreadable-data.json', result.raw) }, dismiss],
        );
      } else {
        quarantine(result.raw, 'Your saved data could not be read.');
      }
      break;

    case 'newer':
      goReadOnly(result.version);
      break;

    case 'unavailable':
      canWrite = false;
      console.error('[gtd] storage unavailable', result.error);
      showStatus('Browser storage is unavailable, so nothing will be saved. Use Export before closing this tab.', [
        { label: 'Export', run: exportData },
      ]);
      break;
  }

  repo.subscribe(() => {
    refreshFromStorage();
    render();
  });

  window.addEventListener('beforeunload', (event) => {
    if (unsaved) event.preventDefault();
  });
}

// ---------------------------------------------------------------------------
// Commands (thin wrappers: the rules live in domain/operations)
// ---------------------------------------------------------------------------

function captureItem(value: string): void {
  commit((current) => capture(current, value, newId(), Date.now()));
  if (!persistenceRequested) {
    persistenceRequested = true;
    void requestPersistence();
  }
}

function moveItem(id: string, to: Status): void {
  commit((current) => move(current, id, to, Date.now()));
}

function deleteItem(item: Item): void {
  const result = commit((current) => remove(current, item.id, Date.now()));
  if (result.ok) {
    showToast(`Deleted "${item.title}".`, {
      label: 'Undo',
      run: () => commit((current) => restore(current, item.id, Date.now())),
    });
  }
}

function exportData(): void {
  downloadText(backupFilename(), serializeBackup(items));
  try {
    localStorage.setItem(LAST_EXPORT_KEY, String(Date.now()));
  } catch {
    // Not critical: the export itself succeeded.
  }
  renderBackupInfo();
}

async function importFile(file: File): Promise<void> {
  const parsed = parseBackup(await file.text());
  if (!parsed.ok) {
    showToast(`Import failed: ${parsed.error}`);
    return;
  }
  const preview = mergeItems(items, parsed.items);
  const skipped = parsed.invalid > 0 ? ` ${parsed.invalid} unreadable entries will be skipped.` : '';
  const deletions = preview.deleted > 0 ? ` ${preview.deleted} will be deleted here, because the backup deleted them after your last change.` : '';
  const ok = window.confirm(
    `Import from "${file.name}"?\n\n` +
      `${preview.added} new, ${preview.updated} updated.${deletions} Where both sides changed an item, the newer version wins.${skipped}`,
  );
  if (!ok) return;

  let merged = preview;
  commit((current) => {
    merged = mergeItems(current, parsed.items);
    return { ok: true, items: merged.items };
  });
  showToast(`Imported: ${merged.added} new, ${merged.updated} updated, ${merged.deleted} deleted.`);
}

/** Ask the browser not to evict our storage under disk pressure. Best effort. */
async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // Unsupported or refused: export remains the real safeguard.
  }
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

interface NoticeAction {
  label: string;
  run: () => void;
}

const dismiss: NoticeAction = { label: 'Dismiss', run: () => clearStatus() };

function fillNotice(el: HTMLElement, message: string, actions: NoticeAction[]): void {
  el.replaceChildren();
  const text = document.createElement('span');
  text.textContent = message;
  el.appendChild(text);
  for (const action of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = action.label;
    btn.addEventListener('click', action.run);
    el.appendChild(btn);
  }
  el.hidden = false;
}

function showStatus(message: string, actions: NoticeAction[] = []): void {
  const el = document.getElementById('gtd-status');
  if (el) fillNotice(el, message, actions);
}

function clearStatus(): void {
  const el = document.getElementById('gtd-status');
  if (el) {
    el.replaceChildren();
    el.hidden = true;
  }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

function showToast(message: string, action?: NoticeAction): void {
  const el = document.getElementById('gtd-toast');
  if (!el) return;
  clearTimeout(toastTimer);
  const hide = () => {
    el.hidden = true;
    el.replaceChildren();
  };
  const actions = action ? [{ label: action.label, run: () => { hide(); action.run(); } }] : [];
  fillNotice(el, message, actions);
  toastTimer = setTimeout(hide, 8000);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderItem(item: Item): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'item';

  const title = document.createElement('span');
  title.className = 'item-title';
  title.textContent = item.title;
  li.appendChild(title);

  if (item.context) {
    const badge = document.createElement('span');
    badge.className = 'context-badge';
    badge.textContent = `@${item.context}`;
    li.appendChild(badge);
  }

  const actions = document.createElement('span');
  actions.className = 'item-actions';

  for (const to of TRANSITIONS[item.status]) {
    const btn = document.createElement('button');
    btn.textContent = moveLabel(item.status, to);
    btn.addEventListener('click', () => moveItem(item.id, to));
    actions.appendChild(btn);
  }

  const del = document.createElement('button');
  del.textContent = '✕';
  del.className = 'delete-btn';
  del.setAttribute('aria-label', `Delete "${item.title}"`);
  del.addEventListener('click', () => deleteItem(item));
  actions.appendChild(del);

  li.appendChild(actions);
  return li;
}

function render(): void {
  const root = document.getElementById('gtd-root');
  if (!root) return;
  root.innerHTML = '';

  for (const status of STATUSES) {
    const sectionItems = itemsInStatus(items, status);

    const details = document.createElement('details');
    details.open = status !== 'done';

    const summary = document.createElement('summary');
    summary.textContent = `${SECTION_LABELS[status]} (${sectionItems.length})`;
    details.appendChild(summary);

    const list = document.createElement('ul');
    list.className = 'item-list';
    if (sectionItems.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'Nothing here.';
      list.appendChild(empty);
    } else {
      for (const item of sectionItems) list.appendChild(renderItem(item));
    }
    details.appendChild(list);
    root.appendChild(details);
  }
}

function renderBackupInfo(): void {
  const el = document.getElementById('backup-info');
  if (!el) return;
  let last: number | null = null;
  try {
    const value = Number(localStorage.getItem(LAST_EXPORT_KEY));
    if (Number.isFinite(value) && value > 0) last = value;
  } catch {
    // Storage unavailable: treat as never exported.
  }
  if (last === null) {
    el.textContent = 'Never exported.';
    return;
  }
  const days = Math.floor((Date.now() - last) / 86_400_000);
  el.textContent = days === 0 ? 'Last export: today.' : `Last export: ${days} day${days === 1 ? '' : 's'} ago.`;
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function setupCaptureForm(): void {
  const form = document.getElementById('capture-form') as HTMLFormElement | null;
  const input = document.getElementById('capture-input') as HTMLInputElement | null;
  if (!form || !input) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    captureItem(value);
    input.value = '';
  });
}

function setupBackupControls(): void {
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const fileInput = document.getElementById('import-file') as HTMLInputElement | null;

  exportBtn?.addEventListener('click', exportData);
  importBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) void importFile(file);
  });
}

boot();
setupCaptureForm();
setupBackupControls();
render();
renderBackupInfo();
