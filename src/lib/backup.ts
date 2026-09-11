import { isItem, type Item } from './gtd';

const FORMAT = 'personal-gtd-backup';
const VERSION = 1;

interface BackupFileV1 {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  items: Item[];
}

export function serializeBackup(items: Item[], now = new Date()): string {
  const file: BackupFileV1 = { format: FORMAT, version: VERSION, exportedAt: now.toISOString(), items };
  return JSON.stringify(file, null, 2);
}

export function backupFilename(now = new Date()): string {
  return `gtd-backup-${now.toISOString().slice(0, 10)}.json`;
}

export type ParseBackupResult =
  | { ok: true; items: Item[]; invalid: number }
  | { ok: false; error: string };

/**
 * Accepts a backup file, or a bare array (a raw localStorage dump or a
 * quarantined value), so recovered data can be imported the same way.
 */
export function parseBackup(text: string): ParseBackupResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }

  let candidates: unknown[];
  if (Array.isArray(data)) {
    candidates = data;
  } else if (typeof data === 'object' && data !== null && (data as { format?: unknown }).format === FORMAT) {
    const file = data as { version?: unknown; items?: unknown };
    if (file.version !== VERSION) {
      return { ok: false, error: `Unsupported backup version: ${String(file.version)}.` };
    }
    if (!Array.isArray(file.items)) return { ok: false, error: 'The backup has no item list.' };
    candidates = file.items;
  } else {
    return { ok: false, error: 'This does not look like a Personal GTD backup.' };
  }

  const items = candidates.filter(isItem);
  return { ok: true, items, invalid: candidates.length - items.length };
}

/**
 * Non-destructive merge by id: nothing in `current` is removed; for an id in
 * both, the version with the newer updatedAt wins. Importing the same file
 * twice is a no-op.
 */
export function mergeItems(current: Item[], incoming: Item[]): { items: Item[]; added: number; updated: number } {
  const byId = new Map(current.map((item) => [item.id, item]));
  let added = 0;
  let updated = 0;
  for (const item of incoming) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      added++;
    } else if (item.updatedAt > existing.updatedAt) {
      byId.set(item.id, item);
      updated++;
    }
  }
  return { items: [...byId.values()], added, updated };
}

export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
