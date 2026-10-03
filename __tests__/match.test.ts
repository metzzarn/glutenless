import { matchBeerByText, matchBeersInMenuText } from '../lib/match';
import beersSeed from '../data/beers.json';
import type { Beer, BeerData } from '../lib/db';
import { statusFromFlags } from '../lib/status';

function toBeer(b: BeerData): Beer {
  return { ...b, status: statusFromFlags(b.glutenFree), favorite: false, personalNote: '' };
}

const beers: Beer[] = (beersSeed as BeerData[]).map(toBeer);

describe('matchBeerByText', () => {
  it('matches on exact name within noisy OCR text', () => {
    const ocr = 'DAURA DAMM\nPale Lager\n5.4% ABV';
    expect(matchBeerByText(ocr, beers)?.name).toBe('Daura Damm');
  });

  it('matches a beer by its name when the brewery is also printed', () => {
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

  it("does not match a generic name (IPA, Stout...) on another brewery's can", () => {
    expect(matchBeerByText('MAREA ALTA\nIPA\nIndia Pale Ale 6.5%', beers)).toBeNull();
    expect(matchBeerByText('Guinness\nDraught Stout', beers)).toBeNull();
  });

  it("matches a generic name when the beer's own brewery is on the label", () => {
    const glutenbergIpa = matchBeerByText('GLUTENBERG\nIPA\nsans gluten', beers);
    expect(glutenbergIpa?.brewery).toBe('Glutenberg (Brasseurs Sans Gluten)');
    expect(glutenbergIpa?.name).toBe('IPA');

    const omissionLager = matchBeerByText('OMISSION\nLAGER\ncrafted to remove gluten', beers);
    expect(omissionLager?.brewery).toBe('Omission Brewing');
    expect(omissionLager?.name).toBe('Lager');
  });

  it('ignores accents on either side, so OCR that drops or adds them still matches', () => {
    expect(matchBeerByText('MARZEN FESTIVAL LAGER', beers)?.name).toBe('Märzen Festival Lager');
    expect(matchBeerByText('Radanas IPA GLUTENFRI', beers)?.brewery).toBe('Rådanäs Bryggeri');
    expect(matchBeerByText('Stag Bàn', beers)?.name).toBe('Stag Bán');
  });

  it('never matches on a brewery alone, since breweries also make beers with gluten', () => {
    // Stone's only gluten-reduced beer is Delicious IPA; this is Stone IPA.
    expect(matchBeerByText('STONE\nIPA\nStone Brewing', beers)).toBeNull();
    expect(matchBeerByText('OMISSION BREWING', beers)).toBeNull();
  });

  it('matches a name with a misread letter when another word of it was read exactly', () => {
    expect(matchBeerByText('TONE\nDelicions\nIPA', beers)?.name).toBe('Delicious IPA');
    expect(matchBeerByText('DAUBA DAMM', beers)?.name).toBe('Daura Damm');
  });

  it('does not match short or unanchored near-misses that could be other words', () => {
    // "sans" is one letter off Brewski's "Sansa", which is not gluten-free.
    expect(matchBeerByText('GLUTENBERG\nsans gluten', beers)?.name).not.toBe('Sansa');
    expect(matchBeerByText('Delicions IPX', beers)).toBeNull();
    expect(matchBeerByText('DAURA DAMN', beers)).toBeNull();
  });

  it('accepts one misread letter in a long single-word name', () => {
    expect(matchBeerByText('REDBRIDCE', beers)?.name).toBe('Redbridge');
    expect(matchBeerByText('REDBRIDCF', beers)).toBeNull();
  });

  it('prefers an exact read over a near-miss of the same length', () => {
    const near = { id: 1, name: 'Daura Dame', brewery: 'X' } as Beer;
    const exact = { id: 2, name: 'Daura Damm', brewery: 'Y' } as Beer;
    expect(matchBeerByText('DAURA DAMM', [near, exact])).toBe(exact);
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

describe('matchBeersInMenuText edge cases', () => {
  const custom = (id: number, name: string, brewery: string) =>
    ({ id, name, brewery, style: '', personalNote: '' }) as Beer;

  it('returns nothing for a blank menu', () => {
    expect(matchBeersInMenuText('  \n ', beers)).toEqual([]);
  });

  it("falls back to a brewery's first word when every word is generic", () => {
    const stout = custom(1, 'Stout', 'Beer Co');
    expect(matchBeersInMenuText('STOUT\nBEER CO', [stout])).toEqual([stout]);
    expect(matchBeersInMenuText('STOUT\nSomeone Else', [stout])).toEqual([]);
  });

  it('never matches a generic name whose brewery has no usable word', () => {
    const stout = custom(1, 'Stout', '(Gluten Free)');
    expect(matchBeersInMenuText('STOUT\nGLUTEN FREE', [stout])).toEqual([]);
  });
});
