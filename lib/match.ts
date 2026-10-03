import type { Beer } from './db';

function normalize(s: string): string {
  return s
    .toLowerCase()
    // Fold accents ("Märzen" → "marzen", OCR's "TỌNE" → "tone") instead of
    // dropping the letter, so labels and OCR misreads compare on their base letters.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Beer names that are just a style/category term (several dedicated GF
 * breweries literally name a product "IPA" or "Stout"). A menu's style
 * column repeats these same words for unrelated beers, so a bare substring
 * match on one of these names is unreliable on its own.
 */
const GENERIC_STYLE_NAMES = new Set([
  'ipa', 'india pale ale', 'pale ale', 'amber', 'amber ale', 'blonde', 'blonde ale',
  'stout', 'lager', 'pilsner', 'porter', 'wheat', 'wheat beer', 'gluten free',
  'saison', 'session ale', 'brown ale', 'red ale', 'golden ale', 'dark lager', 'bock',
]);

const BREWERY_STOP_WORDS = new Set([
  'brewing', 'beer', 'beers', 'brewery', 'breweries', 'co', 'company', 'the', 'craft',
]);

/** The single word most likely to identify a brewery in printed text, e.g. "Glutenberg" out of "Glutenberg (Brasseurs Sans Gluten)". */
function breweryToken(brewery: string): string {
  const words = normalize(brewery.replace(/\(.*?\)/g, '')).split(' ').filter(Boolean);
  return words.find((w) => !BREWERY_STOP_WORDS.has(w) && w.length > 2) ?? words[0] ?? '';
}

/**
 * Whether `needle` and `token` both occur within `window` lines of each
 * other. Menus print a beer's own brewery close to its name/style, so this
 * distinguishes an entry's own style column from a same-named style word
 * printed for a different beer elsewhere on the menu.
 */
function occursNear(lines: string[], needle: string, token: string, window: number): boolean {
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(needle)) continue;
    const from = Math.max(0, i - window);
    const to = Math.min(lines.length, i + window + 1);
    for (let j = from; j < to; j++) {
      if (lines[j].includes(token)) return true;
    }
  }
  return false;
}

/** One beer whose name or brewery appeared in the OCR text, and whether it counted. */
export type MatchCandidate = {
  beer: Beer;
  field: 'name' | 'brewery';
  /** The normalized name or brewery that was looked for. */
  needle: string;
  /** The normalized OCR text it was found as; differs from `needle` for a near-miss read. */
  found: string;
  /** Why the hit was not counted as a match; absent when it was. */
  rejected?: string;
};

/**
 * How many single-letter mistakes OCR may make in a word and still match it.
 * Short words must be exact: one wrong letter in "ale" or "ipa" makes a
 * different word, and a wrong match can show a gluten beer as gluten-free.
 */
function allowedEdits(word: string): number {
  if (word.length >= 9) return 2;
  if (word.length >= 5) return 1;
  return 0;
}

/** Levenshtein distance, giving up (returning max + 1) once it exceeds `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, row[j]);
    }
    if (rowMin > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/**
 * Looks for `needle`'s words as consecutive OCR words, letting a few letters
 * be misread ("delici0us ipa" for "delicious ipa"). Returns the OCR words it
 * matched, preferring an exact read, or null.
 *
 * A near-miss needs some exact anchor, since one wrong letter turns many
 * words into other real words ("sans" vs the beer "Sansa"): a multi-word name
 * needs at least one word read exactly, and a single-word name must be long
 * enough (8+ letters) that a one-letter slip can't plausibly be another word.
 */
function findWords(ocrWords: string[], needle: string): string | null {
  const words = needle.split(' ');
  const single = words.length === 1;
  if (single && needle.length < 8) return ocrWords.includes(needle) ? needle : null;

  let nearMiss: string | null = null;
  for (let i = 0; i + words.length <= ocrWords.length; i++) {
    const window = ocrWords.slice(i, i + words.length);
    if (window.every((w, j) => w === words[j])) return needle;
    if (nearMiss) continue;
    const anchored = single || window.some((w, j) => w === words[j]);
    const close = window.every((w, j) => {
      const max = single ? 1 : allowedEdits(words[j]);
      return editDistance(w, words[j], max) <= max;
    });
    if (anchored && close) nearMiss = window.join(' ');
  }
  return nearMiss;
}

/**
 * Every name/brewery hit for a single can or bottle, including the ones the
 * matcher discards — the scan debug screen shows all of them.
 *
 * Only a beer's name identifies it. A brewery alone doesn't: most breweries
 * here also make beers with gluten (Stone's only gluten-reduced beer is
 * Delicious IPA), so a brewery hit is listed but never counted. A generic
 * name ("IPA", "Stout") only counts when the beer's brewery is also on the
 * label, otherwise another brewery's IPA would be shown as our gluten-free one.
 */
export function findCanCandidates(text: string, beers: Beer[]): MatchCandidate[] {
  const ocrWords = normalize(text).split(' ').filter(Boolean);
  if (!ocrWords.length) return [];

  const candidates: MatchCandidate[] = [];
  const seenBreweries = new Set<string>();
  for (const beer of beers) {
    const name = normalize(beer.name);
    const nameFound = name ? findWords(ocrWords, name) : null;
    if (nameFound) {
      let rejected: string | undefined;
      if (GENERIC_STYLE_NAMES.has(name)) {
        const token = breweryToken(beer.brewery);
        if (!token || !findWords(ocrWords, token)) {
          rejected = `generic name without brewery "${token}"`;
        }
      }
      candidates.push({ beer, field: 'name', needle: name, found: nameFound, rejected });
    }

    // Listed once per brewery, so a recognized brewery shows up in debugging.
    const brewery = normalize(beer.brewery);
    if (!brewery || seenBreweries.has(brewery)) continue;
    const breweryFound = findWords(ocrWords, brewery);
    if (breweryFound) {
      seenBreweries.add(brewery);
      candidates.push({
        beer,
        field: 'brewery',
        needle: brewery,
        found: breweryFound,
        rejected: "a brewery alone doesn't say which of its beers this is",
      });
    }
  }
  return candidates;
}

/**
 * There's no external beer-recognition database here — matching is limited to
 * the beers already in our local dataset. This finds the beer whose name best
 * overlaps with recognized OCR text, picking the longest name so "IPA" doesn't
 * outrank "Shrouded Summit IPA", then an exact read over a near-miss.
 */
export function matchBeerByText(text: string, beers: Beer[]): Beer | null {
  let best: MatchCandidate | null = null;
  for (const candidate of findCanCandidates(text, beers)) {
    if (candidate.rejected) continue;
    if (
      !best ||
      candidate.needle.length > best.needle.length ||
      (candidate.needle.length === best.needle.length &&
        candidate.found === candidate.needle &&
        best.found !== best.needle)
    ) {
      best = candidate;
    }
  }
  return best?.beer ?? null;
}

/** Every beer name found in a menu's OCR text, including the ones the matcher discards. */
export function findMenuCandidates(text: string, beers: Beer[]): MatchCandidate[] {
  const haystack = normalize(text);
  if (!haystack) return [];

  const lines = text.split('\n').map(normalize);

  const candidates: MatchCandidate[] = [];
  for (const beer of beers) {
    const name = normalize(beer.name);
    if (!name || !haystack.includes(name)) continue;
    let rejected: string | undefined;
    if (GENERIC_STYLE_NAMES.has(name)) {
      const token = breweryToken(beer.brewery);
      if (!token || !occursNear(lines, name, token, 2)) {
        rejected = `generic name without brewery "${token}" nearby`;
      }
    }
    candidates.push({ beer, field: 'name', needle: name, found: name, rejected });
  }
  return candidates;
}

/** Same idea, but returns every beer that appears anywhere in a menu's OCR text. */
export function matchBeersInMenuText(text: string, beers: Beer[]): Beer[] {
  return findMenuCandidates(text, beers)
    .filter((candidate) => !candidate.rejected)
    .map((candidate) => candidate.beer);
}

/** The lowercase, punctuation-free form of OCR text that the matchers search. */
export { normalize as normalizeOcrText };
