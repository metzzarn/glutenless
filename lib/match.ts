import type { Beer } from './db';

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
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

/**
 * There's no external beer-recognition database here — matching is limited to
 * the beers already in our local dataset. This finds the beer whose name (or
 * brewery) best overlaps with recognized OCR text, picking the longest match
 * so "IPA" doesn't outrank "Shrouded Summit IPA".
 */
export function matchBeerByText(text: string, beers: Beer[]): Beer | null {
  const haystack = normalize(text);
  if (!haystack) return null;

  let best: { beer: Beer; len: number } | null = null;
  for (const beer of beers) {
    for (const field of [beer.name, beer.brewery]) {
      const needle = normalize(field);
      if (needle && haystack.includes(needle)) {
        if (!best || needle.length > best.len) best = { beer, len: needle.length };
      }
    }
  }
  return best?.beer ?? null;
}

/** Same idea, but returns every beer that appears anywhere in a menu's OCR text. */
export function matchBeersInMenuText(text: string, beers: Beer[]): Beer[] {
  const haystack = normalize(text);
  if (!haystack) return [];

  const lines = text.split('\n').map(normalize);

  return beers.filter((beer) => {
    const name = normalize(beer.name);
    if (!name || !haystack.includes(name)) return false;
    if (!GENERIC_STYLE_NAMES.has(name)) return true;

    const token = breweryToken(beer.brewery);
    return !!token && occursNear(lines, name, token, 2);
  });
}

/**
 * Placeholder barcode lookup: without a real UPC/EAN -> beer database, we
 * deterministically map a scanned barcode to one of our local beers (same
 * barcode always resolves to the same beer). Swap for a real lookup once a
 * barcode dataset/service is wired up.
 */
export function matchBeerByBarcode(barcode: string, beers: Beer[]): Beer | null {
  if (!barcode || beers.length === 0) return null;
  let hash = 0;
  for (let i = 0; i < barcode.length; i++) {
    hash = (hash * 31 + barcode.charCodeAt(i)) >>> 0;
  }
  return beers[hash % beers.length];
}
