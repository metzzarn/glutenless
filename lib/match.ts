import type { Beer } from './db';

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
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

  return beers.filter((beer) => {
    const name = normalize(beer.name);
    return name && haystack.includes(name);
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
