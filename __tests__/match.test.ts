import { matchBeerByBarcode, matchBeerByText, matchBeersInMenuText } from '../lib/match';
import beersSeed from '../data/beers.json';
import type { Beer } from '../lib/db';
import { statusFromFlags } from '../lib/status';

function toBeer(b: Omit<Beer, 'favorite' | 'status'>): Beer {
  return { ...b, status: statusFromFlags(b.glutenFree), favorite: false };
}

const beers: Beer[] = (beersSeed as Omit<Beer, 'favorite' | 'status'>[]).map(toBeer);

describe('matchBeerByText', () => {
  it('matches on exact name within noisy OCR text', () => {
    const ocr = 'DAURA DAMM\nPale Lager\n5.4% ABV';
    expect(matchBeerByText(ocr, beers)?.name).toBe('Daura Damm');
  });

  it('matches a beer via its brewery when the brewery is unique in the dataset', () => {
    const ocr = 'Stone Delicious IPA - Stone Brewing';
    expect(matchBeerByText(ocr, beers)?.name).toBe('Delicious IPA');
  });

  it('prefers the longer/more specific needle when multiple candidates match', () => {
    // Synthetic fixture (not the real dataset) so this tie-break behavior
    // doesn't depend on which real beers happen to share a brewery string.
    const candidates: Beer[] = [
      toBeer({
        id: 1001,
        name: 'IPA',
        brewery: 'Test Brewing',
        style: 'IPA',
        abv: 5,
        ibu: null,
        ppm: '<20 ppm',
        glutenFree: true,
        glutenRemoved: false,
        discontinued: false,
        country: 'USA',
        grains: ['sorghum'],
        note: '',
        breweryUrl: '',
      }),
      toBeer({
        id: 1002,
        name: 'Shrouded Summit IPA',
        brewery: 'Ghostfish',
        style: 'IPA',
        abv: 6,
        ibu: null,
        ppm: '<20 ppm',
        glutenFree: true,
        glutenRemoved: false,
        discontinued: false,
        country: 'USA',
        grains: ['millet'],
        note: '',
        breweryUrl: '',
      }),
    ];
    const ocr = 'Shrouded Summit IPA - Ghostfish Brewing';
    expect(matchBeerByText(ocr, candidates)?.name).toBe('Shrouded Summit IPA');
  });

  it('returns null when nothing overlaps', () => {
    expect(matchBeerByText('Completely Unrelated Text', beers)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(matchBeerByText('', beers)).toBeNull();
  });
});

describe('matchBeersInMenuText', () => {
  it('finds every local beer mentioned in a menu blob', () => {
    const menu = `
      DRAFT LIST
      Redbridge .... 7
      Daura Damm .... 8
      Some Other Non-GF Beer .... 6
    `;
    const matches = matchBeersInMenuText(menu, beers).map((b) => b.name);
    expect(matches).toEqual(expect.arrayContaining(['Redbridge', 'Daura Damm']));
    expect(matches).toHaveLength(2);
  });

  it('returns an empty array when no beers are mentioned', () => {
    expect(matchBeersInMenuText('Nothing here', beers)).toEqual([]);
  });

  it('does not match a generic style name (IPA, Stout, Amber...) unless its brewery is also present', () => {
    // Regular (non-GF) menu where "Estilo" happens to repeat style words that
    // are also literal product names of unrelated GF beers in our dataset.
    const menu = `
      GLUTENBERG
      BLONDE
      PALE ALE SIN GLUTEN

      MAREA ALTA
      IPA
      INDIA PALE ALE

      PUERTO VIEJO
      AMBER ALE

      LOBA NEGRA
      STOUT
      DRY STOUT
    `;
    const matches = matchBeersInMenuText(menu, beers).map((b) => `${b.brewery} - ${b.name}`);
    expect(matches).toEqual(['Glutenberg (Brasseurs Sans Gluten) - Blonde']);
  });
});

describe('matchBeerByBarcode', () => {
  it('is deterministic for the same barcode', () => {
    const a = matchBeerByBarcode('012345678905', beers);
    const b = matchBeerByBarcode('012345678905', beers);
    expect(a).toEqual(b);
  });

  it('returns null for empty input', () => {
    expect(matchBeerByBarcode('', beers)).toBeNull();
  });
});
