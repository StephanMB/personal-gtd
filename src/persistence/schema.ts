import { isItem, isProject, type Item, type Project } from '../domain/model.ts';

/**
 * App state that is not a record: when you last reviewed, when you last
 * exported. It lives in the document so it is exported, migrated and merged
 * like everything else, rather than in a stray localStorage key.
 */
export interface Settings {
  lastReviewedAt?: number;
  lastExportAt?: number;
  /** Explanations the user has waved away; they never come back. */
  dismissedHints?: string[];
  /** Follow the operating system, or force one. */
  theme?: 'system' | 'light' | 'dark';
  language?: 'en' | 'nl';
}

/**
 * Stored document format.
 *   v1 (step 0/1): a bare array of items under "gtd:items".
 *   v2 (step 2):   { schemaVersion: 2, items } under "gtd:data";
 *                  items gain completedAt and deletedAt.
 *   v3 (step 4):   the document gains a projects collection.
 *   v4 (step 4):   the document gains a settings section.
 */
export const SCHEMA_VERSION = 4;

/** Everything the app stores, without the envelope. */
export interface DocContents {
  items: Item[];
  projects: Project[];
  settings: Settings;
}

export interface StoredDoc extends DocContents {
  schemaVersion: typeof SCHEMA_VERSION;
}

/**
 * MIGRATIONS[n] upgrades a version-n document to version n+1.
 * They take `unknown` on purpose: old data is untrusted input. They reshape
 * what they recognise and pass everything else through untouched; the single
 * isItem()/isProject() check at the end of migrate() is the gate.
 *
 * Rules: a migration that has shipped is never edited, only followed by a new
 * one. Each gets a fixture test.
 */
const MIGRATIONS: Record<number, (doc: unknown) => unknown> = {
  1: (doc) => ({
    schemaVersion: 2,
    items: (doc as unknown[]).map((raw) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const item = raw as Record<string, unknown>;
      // Best available completion time for items finished before v2.
      if (item.status === 'done' && item.completedAt === undefined) {
        return { ...item, completedAt: item.updatedAt };
      }
      return item;
    }),
  }),

  /**
   * A new collection, not a new field. An optional field would need no bump,
   * because operations copy records with a spread and unknown fields survive a
   * round trip through an older build. A collection does not survive: a v2
   * build writes { schemaVersion, items } and the projects would be gone.
   */
  2: (doc) => ({ ...(doc as object), schemaVersion: 3, projects: [] }),

  /**
   * A section, not a field: the same reasoning as the projects collection.
   * An optional FIELD on a record survives an older build, because operations
   * copy records with a spread. A top-level section does not: save() writes an
   * explicit shape, so a v3 build would drop it on the next write.
   */
  3: (doc) => ({ ...(doc as object), schemaVersion: 4, settings: {} }),
};

const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Settings are read leniently: a setting this build cannot make sense of is
 * dropped, but one it has never heard of is kept.
 *
 * That is what makes this section genuinely additive, unlike a new top-level
 * section: a newer build can add a setting and an older build will hand it
 * back untouched instead of silently deleting it on the next save.
 */
function readSettings(value: unknown): Settings {
  if (typeof value !== 'object' || value === null) return {};
  const raw = value as Record<string, unknown>;
  const settings: Settings = { ...(raw as Settings) };
  delete settings.lastReviewedAt;
  delete settings.lastExportAt;
  delete settings.dismissedHints;
  delete settings.theme;
  delete settings.language;
  if (timestamp(raw.lastReviewedAt)) settings.lastReviewedAt = raw.lastReviewedAt;
  if (timestamp(raw.lastExportAt)) settings.lastExportAt = raw.lastExportAt;
  if (Array.isArray(raw.dismissedHints)) {
    settings.dismissedHints = raw.dismissedHints.filter((id): id is string => typeof id === 'string');
  }
  if (raw.theme === 'system' || raw.theme === 'light' || raw.theme === 'dark') settings.theme = raw.theme;
  if (raw.language === 'en' || raw.language === 'nl') settings.language = raw.language;
  return settings;
}

export function detectVersion(data: unknown): number | null {
  if (Array.isArray(data)) return 1;
  if (typeof data === 'object' && data !== null) {
    const version = (data as { schemaVersion?: unknown }).schemaVersion;
    if (typeof version === 'number' && Number.isInteger(version) && version >= 2) return version;
  }
  return null;
}

export type MigrateResult =
  | { kind: 'ok'; doc: StoredDoc; from: number; invalid: number }
  | { kind: 'corrupt' }
  | { kind: 'newer'; version: number };

export function migrate(data: unknown): MigrateResult {
  const from = detectVersion(data);
  if (from === null) return { kind: 'corrupt' };
  if (from > SCHEMA_VERSION) return { kind: 'newer', version: from };

  let doc = data;
  for (let v = from; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { kind: 'corrupt' };
    doc = step(doc);
  }

  const rawItems = (doc as { items?: unknown }).items;
  if (!Array.isArray(rawItems)) return { kind: 'corrupt' };
  const rawProjects = (doc as { projects?: unknown }).projects ?? [];
  if (!Array.isArray(rawProjects)) return { kind: 'corrupt' };

  const items = rawItems.filter(isItem);
  const projects = rawProjects.filter(isProject);
  return {
    kind: 'ok',
    doc: {
      schemaVersion: SCHEMA_VERSION,
      items,
      projects,
      settings: readSettings((doc as { settings?: unknown }).settings),
    },
    from,
    invalid: rawItems.length - items.length + (rawProjects.length - projects.length),
  };
}
