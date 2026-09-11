import type { Item } from './gtd';

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
