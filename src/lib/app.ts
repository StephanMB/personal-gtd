import { createItem, actionButtons, type Item, type Status } from './gtd';
import {
  readItems,
  writeItems,
  quarantine,
  onExternalChange,
  requestPersistence,
  readLastExport,
  writeLastExport,
} from './storage';
import { serializeBackup, backupFilename, parseBackup, mergeItems, downloadText } from './backup';

const SECTIONS: { status: Status; label: string }[] = [
  { status: 'inbox', label: 'Inbox' },
  { status: 'next', label: 'Next actions' },
  { status: 'waiting', label: 'Waiting for' },
  { status: 'someday', label: 'Someday / maybe' },
  { status: 'done', label: 'Done' },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let items: Item[] = [];
/** False when storage is unavailable, or when unreadable data could not be set aside. */
let canWrite = true;
/** True when there are changes that exist only in memory. */
let unsaved = false;
let saveFailed = false;
/** The unreadable data most recently set aside, so the same data is never copied twice. */
let setAside: string | null = null;
let persistenceRequested = false;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * The single path for every change. Re-reads storage first so a stale copy in
 * this tab can never overwrite what another tab saved in the meantime —
 * unless this tab holds changes that never reached storage: then memory is
 * the newer copy and must win.
 */
function commit(mutate: (current: Item[]) => Item[]): void {
  if (canWrite && !unsaved) {
    const fresh = readItems();
    if (fresh.kind === 'ok') {
      items = fresh.items;
      // Unreadable data appeared since startup: set it aside before the save
      // below overwrites it.
      if (fresh.invalid > 0) {
        handleUnreadable(fresh.raw, `${fresh.invalid} saved item(s) could not be read and were left out.`);
      }
    } else if (fresh.kind === 'empty') {
      items = [];
    } else if (fresh.kind === 'corrupt') {
      handleUnreadable(fresh.raw, 'Your saved data could not be read.');
    }
  }
  items = mutate(items);
  save();
  render();
}

function save(): void {
  if (!canWrite) {
    unsaved = true;
    return;
  }
  const result = writeItems(items);
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

/** Keep unreadable data out of harm's way, then tell the user. */
function handleUnreadable(raw: string, what: string): void {
  // Already copied (e.g. at startup, before the first save replaced it).
  if (raw === setAside) return;
  const download = { label: 'Download unreadable data', run: () => downloadText('gtd-unreadable-data.json', raw) };
  const key = quarantine(raw);
  if (key) {
    setAside = raw;
    showStatus(`${what} A copy was kept in this browser under "${key}".`, [download, dismiss]);
  } else {
    // We could not make a copy, so writing now would destroy the only one.
    canWrite = false;
    showStatus(`${what} Saving is paused so it is not overwritten. Download it first, then resume.`, [
      download,
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
}

function boot(): void {
  const result = readItems();
  switch (result.kind) {
    case 'empty':
      items = [];
      break;
    case 'ok':
      items = result.items;
      if (result.invalid > 0) {
        handleUnreadable(result.raw, `${result.invalid} saved item(s) could not be read and were left out.`);
      }
      break;
    case 'corrupt':
      items = [];
      handleUnreadable(result.raw, 'Your saved data could not be read.');
      break;
    case 'unavailable':
      canWrite = false;
      console.error('[gtd] storage unavailable', result.error);
      showStatus('Browser storage is unavailable, so nothing will be saved. Use Export before closing this tab.', [
        { label: 'Export', run: exportData },
      ]);
      break;
  }

  onExternalChange(() => {
    if (!canWrite || unsaved) return;
    const fresh = readItems();
    if (fresh.kind === 'ok' && fresh.invalid === 0) items = fresh.items;
    else if (fresh.kind === 'empty') items = [];
    else return;
    render();
  });

  window.addEventListener('beforeunload', (event) => {
    if (unsaved) event.preventDefault();
  });
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function captureItem(value: string): void {
  commit((current) => [...current, createItem(value)]);
  if (!persistenceRequested) {
    persistenceRequested = true;
    void requestPersistence();
  }
}

function moveItem(id: string, status: Status): void {
  commit((current) =>
    current.map((item) => (item.id === id ? { ...item, status, updatedAt: Date.now() } : item)),
  );
}

function deleteItem(id: string): void {
  const deleted = items.find((item) => item.id === id);
  if (!deleted) return;
  commit((current) => current.filter((item) => item.id !== id));
  showToast(`Deleted "${deleted.title}".`, {
    label: 'Undo',
    run: () => commit((current) => (current.some((i) => i.id === deleted.id) ? current : [...current, deleted])),
  });
}

function exportData(): void {
  downloadText(backupFilename(), serializeBackup(items));
  writeLastExport(Date.now());
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
  const ok = window.confirm(
    `Import ${parsed.items.length} items from "${file.name}"?\n\n` +
      `${preview.added} new, ${preview.updated} updated. Nothing in your current list is removed.${skipped}`,
  );
  if (!ok) return;

  let result = preview;
  commit((current) => {
    result = mergeItems(current, parsed.items);
    return result.items;
  });
  showToast(`Imported: ${result.added} new, ${result.updated} updated.`);
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

/** Persistent banner for problems that need the user's attention. */
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

/** Short-lived confirmation with an optional action (e.g. Undo). */
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

  for (const action of actionButtons(item)) {
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.addEventListener('click', () => moveItem(item.id, action.status));
    actions.appendChild(btn);
  }

  const del = document.createElement('button');
  del.textContent = '✕';
  del.className = 'delete-btn';
  del.setAttribute('aria-label', `Delete "${item.title}"`);
  del.addEventListener('click', () => deleteItem(item.id));
  actions.appendChild(del);

  li.appendChild(actions);
  return li;
}

function render(): void {
  const root = document.getElementById('gtd-root');
  if (!root) return;
  root.innerHTML = '';

  for (const section of SECTIONS) {
    const sectionItems = items
      .filter((i) => i.status === section.status)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    const details = document.createElement('details');
    details.open = section.status !== 'done';

    const summary = document.createElement('summary');
    summary.textContent = `${section.label} (${sectionItems.length})`;
    details.appendChild(summary);

    const list = document.createElement('ul');
    list.className = 'item-list';
    if (sectionItems.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'Nothing here.';
      list.appendChild(empty);
    } else {
      for (const item of sectionItems) {
        list.appendChild(renderItem(item));
      }
    }
    details.appendChild(list);
    root.appendChild(details);
  }
}

function renderBackupInfo(): void {
  const el = document.getElementById('backup-info');
  if (!el) return;
  const last = readLastExport();
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
    fileInput.value = ''; // allow re-importing the same file
    if (file) void importFile(file);
  });
}

boot();
setupCaptureForm();
setupBackupControls();
render();
renderBackupInfo();
