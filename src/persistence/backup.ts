import type { Item } from '../domain/model.ts';
import { migrate, SCHEMA_VERSION, type StoredDoc } from './schema.ts';

const FORMAT = 'personal-gtd-backup';

/**
 * Backup file v2 = an envelope around a stored document. Because the payload
 * IS a stored document, backups go through the exact same migrations as
 * storage, forever. The envelope version only changes if the envelope does.
 *
 * v1 (step 1): { format, version: 1, exportedAt, items: <v1 items> }
 * v2 (step 2): { format, version: 2, exportedAt, data: <StoredDoc> }
 */
interface BackupFileV2 {
  format: typeof FORMAT;
  version: 2;
  exportedAt: string;
  data: StoredDoc;
}

/** Includes tombstones, so deletions carry over to wherever the file is imported. */
export function serializeBackup(items: Item[], now = new Date()): string {
  const file: BackupFileV2 = {
    format: FORMAT,
    version: 2,
    exportedAt: now.toISOString(),
    data: { schemaVersion: SCHEMA_VERSION, items },
  };
  return JSON.stringify(file, null, 2);
}

export function backupFilename(now = new Date()): string {
  return `gtd-backup-${now.toISOString().slice(0, 10)}.json`;
}

export type ParseBackupResult = { ok: true; items: Item[]; invalid: number } | { ok: false; error: string };

/**
 * Accepts backup files v1 and v2, and bare arrays (a raw step-1 localStorage
 * value or a quarantined copy), so recovered data can be imported the same way.
 */
export function parseBackup(text: string): ParseBackupResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }

  let payload: unknown;
  if (Array.isArray(data)) {
    payload = data;
  } else if (typeof data === 'object' && data !== null && (data as { format?: unknown }).format === FORMAT) {
    const file = data as { version?: unknown; items?: unknown; data?: unknown };
    if (file.version === 1) payload = file.items; // v1 items are a v1 document
    else if (file.version === 2) payload = file.data;
    else return { ok: false, error: `This backup was made by a newer version of the app (format ${String(file.version)}).` };
  } else if (typeof data === 'object' && data !== null && 'schemaVersion' in data) {
    payload = data; // a raw step-2 storage value
  } else {
    return { ok: false, error: 'This does not look like a Personal GTD backup.' };
  }

  const result = migrate(payload);
  switch (result.kind) {
    case 'ok':
      return { ok: true, items: result.doc.items, invalid: result.invalid };
    case 'newer':
      return { ok: false, error: `This backup was made by a newer version of the app (schema ${result.version}).` };
    case 'corrupt':
      return { ok: false, error: 'The backup is damaged: it has no readable item list.' };
  }
}
