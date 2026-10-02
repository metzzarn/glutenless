import type { Beer } from './db';

/** Lowercase, accents stripped ("Mönchshof" → "monchshof"), punctuation turned into spaces. */
export function normalizeForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

type Indexed = { text: string; words: string[] };

// Rows are immutable objects, so their search text is built once per row, not per keystroke.
const indexCache = new WeakMap<Beer, Indexed>();

function indexBeer(beer: Beer): Indexed {
  let indexed = indexCache.get(beer);
  if (!indexed) {
    const text = normalizeForSearch(
      [beer.name, beer.brewery, beer.style, beer.country, beer.personalNote].filter(Boolean).join(' ')
    );
    indexed = { text, words: text.split(' ') };
    indexCache.set(beer, indexed);
  }
  return indexed;
}

/** Short words must be exact: one typo in "ipa" or "dam" would match far too much. */
function allowedTypos(length: number): number {
  return length >= 7 ? 2 : length >= 4 ? 1 : 0;
}

/** Edit distance, giving up early once it can only exceed `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, row[j]);
    }
    if (rowMin > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/** A query word matches a beer word if it's a prefix of it, or close to it (or to its start, while still typing). */
function wordMatches(queryWord: string, word: string): boolean {
  if (word.startsWith(queryWord)) return true;
  const max = allowedTypos(queryWord.length);
  if (max === 0) return false;
  return (
    editDistance(queryWord, word, max) <= max ||
    (word.length > queryWord.length && editDistance(queryWord, word.slice(0, queryWord.length), max) <= max)
  );
}

/**
 * Matches name, brewery, style, country and the user's own note. Every query
 * word has to match; exact substring hits come first, typo-tolerant ones
 * ("glutenburg", "daura dam") after them. Order within each group is kept.
 */
export function searchBeers(beers: Beer[], query: string): Beer[] {
  const q = normalizeForSearch(query);
  if (!q) return beers;
  const queryWords = q.split(' ');

  const exact: Beer[] = [];
  const fuzzy: Beer[] = [];
  for (const beer of beers) {
    const { text, words } = indexBeer(beer);
    if (queryWords.every((qw) => text.includes(qw))) exact.push(beer);
    else if (queryWords.every((qw) => words.some((w) => wordMatches(qw, w)))) fuzzy.push(beer);
  }
  return [...exact, ...fuzzy];
}
