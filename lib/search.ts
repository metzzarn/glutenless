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

/**
 * Short words must be exact: one typo in "ipa" or "dam" would match far too
 * much. Two typos only from 9 letters: with two, "brewoog" (for "brewdog")
 * also matched "brewing" and "brewery", so half the list.
 */
function allowedTypos(length: number): number {
  return length >= 9 ? 2 : length >= 4 ? 1 : 0;
}

/**
 * Edit distance where swapping two neighbouring letters ("ghotsfish") is one
 * typo, not two. Gives up early once it can only exceed `max`.
 */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let prevMin = 0;
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      row[j] = d;
      rowMin = Math.min(rowMin, d);
    }
    // A swap reaches back two rows, so only stop once both are past `max`.
    if (rowMin > max && prevMin > max) return max + 1;
    prev2 = prev;
    prev = row;
    prevMin = rowMin;
  }
  return prev[b.length];
}

/**
 * How far a query word is from a beer word: 0 if it's a prefix of it,
 * otherwise its typos against the word (or the word's start, while still
 * typing), or Infinity when that's more than allowed.
 */
function wordDistance(queryWord: string, word: string): number {
  if (word.startsWith(queryWord)) return 0;
  const max = allowedTypos(queryWord.length);
  if (max === 0) return Infinity;
  const whole = editDistance(queryWord, word, max);
  const start = word.length > queryWord.length ? editDistance(queryWord, word.slice(0, queryWord.length), max) : Infinity;
  const best = Math.min(whole, start);
  return best <= max ? best : Infinity;
}

/**
 * Matches name, brewery, style, country and the user's own note. Every query
 * word has to match; exact substring hits come first, in list order, then
 * typo-tolerant ones ("glutenburg", "daura dam"), fewest typos first.
 */
export function searchBeers(beers: Beer[], query: string): Beer[] {
  const q = normalizeForSearch(query);
  if (!q) return beers;
  const queryWords = q.split(' ');

  const exact: Beer[] = [];
  const fuzzy: { beer: Beer; typos: number }[] = [];
  for (const beer of beers) {
    const { text, words } = indexBeer(beer);
    if (queryWords.every((qw) => text.includes(qw))) {
      exact.push(beer);
      continue;
    }
    let typos = 0;
    for (const qw of queryWords) {
      typos += Math.min(...words.map((w) => wordDistance(qw, w)));
      if (typos === Infinity) break;
    }
    if (typos !== Infinity) fuzzy.push({ beer, typos });
  }
  // Array.sort is stable, so equally close typo matches keep list order.
  fuzzy.sort((a, b) => a.typos - b.typos);
  return [...exact, ...fuzzy.map((f) => f.beer)];
}
