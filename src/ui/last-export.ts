const KEY = 'gtd:lastExportAt';

/** When the user last exported. A UI nicety, so failures are ignored. */
export function readLastExport(): number | null {
  try {
    const value = Number(localStorage.getItem(KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeLastExport(timestamp: number): void {
  try {
    localStorage.setItem(KEY, String(timestamp));
  } catch {
    // Not critical: the export itself succeeded.
  }
}
