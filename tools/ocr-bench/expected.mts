/**
 * The beer list and each bench photo's expected beers, shared by score.mts
 * (cans and bottles) and score_menus.mts.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeOcrText } from '../../lib/match.ts';

export type Beer = { id: number; name: string; brewery: string; [key: string]: unknown };

export const here = dirname(fileURLToPath(import.meta.url));
export const beers: Beer[] = JSON.parse(readFileSync(join(here, '../../data/beers.json'), 'utf8')).map((b: Beer) => ({
  ...b,
  favorite: false,
  personalNote: '',
}));

/**
 * Our beers the photo shows: every word of a name appears in the file name,
 * with a word of its brewery unless the name is three words or more ("Estrella
 * Galicia Gluten Free" is brewed by Hijos de Rivera; two-word names like
 * "Pale Ale" or "Gluten Free" would turn up in unrelated file names).
 */
export function expectedBeers(file: string): Beer[] {
  return file
    .replace(/\.[a-z]+$/i, '')
    .split(' - ')[0]
    .split(' + ')
    .flatMap((part) => {
      const beer = expectedBeer(part);
      return beer ? [beer] : [];
    });
}

function expectedBeer(part: string): Beer | null {
  const words = new Set(normalizeOcrText(part).split(' '));
  const fits = beers.filter(
    (b) =>
      normalizeOcrText(b.name).split(' ').every((w) => words.has(w)) &&
      (normalizeOcrText(b.name).split(' ').length >= 3 || normalizeOcrText(b.brewery).split(' ').some((w) => words.has(w))),
  );
  // The longest name, so "Delicious IPA" wins over a plain "IPA".
  return fits.sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}

