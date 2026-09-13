import { fold } from './contexts.ts';
import { isLive, type Item, type Project } from './model.ts';

/**
 * Finding one thing you half remember.
 *
 * No index: scanning a few thousand records per keystroke is well under a
 * frame, and an index is a second copy of the truth that can be wrong. When
 * that stops being true, measure first.
 *
 * The ranking is the whole design. Typing the start of a title should put it
 * first, because that is what you do when you know what you are looking for;
 * a word buried in the middle comes after, because that is what you do when
 * you don't. Everything else is a tie-break.
 */
export interface Query {
  /** Words that have to appear somewhere. */
  terms: readonly string[];
  /** @tags, folded, that the item has to carry. */
  contexts: readonly string[];
}

/**
 * "roof @home" -> terms ["roof"], contexts ["home"].
 *
 * The same @ rule as capture, so the one syntax in the app means one thing:
 * tag where it happens, and find it by where it happens.
 */
export function parseQuery(raw: string): Query {
  const terms: string[] = [];
  const contexts: string[] = [];
  for (const word of raw.trim().split(/\s+/)) {
    if (word === '') continue;
    if (word.startsWith('@') && word.length > 1) contexts.push(fold(word));
    else terms.push(word.toLowerCase());
  }
  return { terms, contexts };
}

export function isEmpty(query: Query): boolean {
  return query.terms.length === 0 && query.contexts.length === 0;
}

/** Lower is better. Ranked on the title, which is what you were typing at. */
const STARTS = 0;
const WORD_STARTS = 1;
const CONTAINS = 2;
const ELSEWHERE = 3;

function rankInTitle(title: string, term: string): number {
  const lower = title.toLowerCase();
  if (lower.startsWith(term)) return STARTS;
  const at = lower.indexOf(term);
  if (at < 0) return ELSEWHERE;
  return /\s/.test(lower[at - 1] ?? ' ') ? WORD_STARTS : CONTAINS;
}

/** Every term has to be somewhere; the first one decides how high it lands. */
function matches(haystacks: readonly string[], terms: readonly string[]): boolean {
  const all = haystacks.join(' ').toLowerCase();
  return terms.every((term) => all.includes(term));
}

function rank(title: string, terms: readonly string[]): number {
  return terms.length === 0 ? ELSEWHERE : rankInTitle(title, terms[0]);
}

export function searchItems(items: readonly Item[], query: Query): Item[] {
  if (isEmpty(query)) return [];
  return items
    .filter((item) => {
      if (!isLive(item)) return false;
      const context = item.context === undefined ? '' : fold(item.context);
      if (!query.contexts.every((wanted) => wanted === context)) return false;
      return matches([item.title, context], query.terms);
    })
    .sort(
      (a, b) =>
        rank(a.title, query.terms) - rank(b.title, query.terms) ||
        // What you finished is rarely what you were looking for.
        Number(a.status === 'done') - Number(b.status === 'done') ||
        b.updatedAt - a.updatedAt,
    );
}

/**
 * Projects are searched too. Half of what you half remember is an outcome
 * rather than an action, and a search that cannot find "House sale" is a
 * search you stop trusting.
 */
export function searchProjects(projects: readonly Project[], query: Query): Project[] {
  // A project has no context, so a tag in the query rules them all out.
  if (isEmpty(query) || query.contexts.length > 0) return [];
  return projects
    .filter((project) => isLive(project) && matches([project.title], query.terms))
    .sort(
      (a, b) =>
        rank(a.title, query.terms) - rank(b.title, query.terms) ||
        Number(a.status !== 'active') - Number(b.status !== 'active') ||
        b.updatedAt - a.updatedAt,
    );
}
