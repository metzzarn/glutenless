import {
  findCanCandidates,
  isGlutenClaimWord,
  matchBeerByText,
  matchBeersInMenuText,
  suggestByBrewery,
  unseenNameWords,
} from '../lib/match';
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

  it("does not match another brewery's beer named only with style words", () => {
    // A real scan of Stone Hazy IPA, which contains gluten. Aurochs' gluten-free
    // beer is called just "Hazy IPA". First ML Kit's reading, then Gemini Nano's.
    expect(matchBeerByText('NE\nHAZY\nIPA\nAN AMAZiNGLY HAZY IPA\n6.7% alelvol - 12 fl ox', beers)).toBeNull();
    expect(matchBeerByText('STONE\nHAZY\nIPA', beers)).toBeNull();
    expect(matchBeerByText('Sierra Nevada\nDouble IPA', beers)).toBeNull();
    expect(matchBeerByText('Goose Island\nWest Coast IPA', beers)).toBeNull();
    expect(matchBeerByText('AUROCHS\nHAZY IPA', beers)?.brewery).toBe('Aurochs Brewing Co.');
  });

  it('rejects a name when the label shows a different brewery from our list', () => {
    const redbridge = { id: 1, name: 'Redbridge', brewery: 'Anheuser-Busch' } as Beer;
    const stone = { id: 2, name: 'Delicious IPA', brewery: 'Stone Brewing' } as Beer;
    expect(matchBeerByText('STONE\nRedbridge', [redbridge, stone])).toBeNull();
    expect(matchBeerByText('Redbridge', [redbridge, stone])).toBe(redbridge);
    expect(matchBeerByText('ANHEUSER-BUSCH\nRedbridge', [redbridge, stone])).toBe(redbridge);
  });

  it("matches a beer whose label leaves the style out of its name, with its brewery", () => {
    // A real Gemini Nano reading of BrewDog's "Vagabond Pale Ale", which the label calls "VAGABOND".
    expect(matchBeerByText('BREW DOG\nVAGABOND\nGLUTEN FREE', beers)?.name).toBe('Vagabond Pale Ale');
    // Without the brewery, a lone word isn't enough.
    expect(matchBeerByText('VAGABOND', beers)).toBeNull();
  });

  it('never drops gluten-free words from a name', () => {
    // A real Gemini Nano reading of a regular Peroni, which contains gluten.
    expect(matchBeerByText('PERONI\nNASTRO AZZURRO', beers)).toBeNull();
    // Words in a different order than the name still count when all are there.
    expect(matchBeerByText('PERONI\nGLUTEN FREE\nNASTRO AZZURRO', beers)?.name).toBe('Peroni Nastro Azzurro Gluten Free');
  });

  it("matches nothing when the words read fit several of the brewery's beers", () => {
    const lager = { id: 1, name: 'Vagabond Lager', brewery: 'BrewDog' } as Beer;
    const ipa = { id: 2, name: 'Vagabond IPA', brewery: 'BrewDog' } as Beer;
    expect(matchBeerByText('BREWDOG\nVAGABOND', [lager, ipa])).toBeNull();
    expect(matchBeerByText('BREWDOG\nVAGABOND\nIPA', [lager, ipa])).toBe(ipa);
  });

  it('returns null when nothing overlaps', () => {
    expect(matchBeerByText('Completely Unrelated Text', beers)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(matchBeerByText('', beers)).toBeNull();
  });
});

describe('suggestByBrewery', () => {
  const suggest = (ocr: string) => suggestByBrewery(findCanCandidates(ocr, beers), beers);

  it("suggests a brewery's beers when its name was read but the beer's wasn't", () => {
    // A real scan: "Delicious IPA" is in a script font OCR reads as "Jekoiod".
    expect(matchBeerByText('STONE\nJekoiod', beers)).toBeNull();
    expect(suggest('STONE\nJekoiod').map((b) => b.name)).toEqual(['Delicious IPA']);
  });

  it("recognizes a brewery by its distinctive words, without 'Brasserie' or 'Brewing'", () => {
    expect(suggest('BRUNEHAUT\nbière blonde').every((b) => b.brewery === 'Brasserie de Brunehaut')).toBe(true);
    expect(suggest('BRUNEHAUT\nbière blonde')).not.toHaveLength(0);
    expect(suggest('MOLSON COORS').every((b) => b.brewery === 'Coors / Molson Coors')).toBe(true);
    expect(suggest('MOLSON COORS')).not.toHaveLength(0);
  });

  it('reads a letter-spaced wordmark that OCR split apart', () => {
    // A real scan of a Delicious IPA can, whose wordmark is printed "S T O N E".
    expect(suggest('STON E\nSYIPA /LEMONDROP & EL DORAm').map((b) => b.name)).toEqual(['Delicious IPA']);
    expect(suggest('S T O N E').map((b) => b.name)).toEqual(['Delicious IPA']);
  });

  it('keeps ordinary short words apart while rejoining spaced letters', () => {
    expect(matchBeerByText("O'BRIEN\nPale Ale", beers)?.brewery).toBe("O'Brien Beer (Rebellion Brewing)");
    expect(matchBeerByText('D A U R A  D A M M', beers)?.name).toBe('Daura Damm');
  });

  it('reads a one-word brewery that OCR split in two', () => {
    // A real Gemini Nano reading of a BrewDog Vagabond label.
    const suggested = suggest('BREW DOG\nVAGABOND\nGLUTEN FREE');
    expect(suggested.map((b) => b.name)).toContain('Vagabond Pale Ale');
    expect(suggested.every((b) => b.brewery === 'BrewDog')).toBe(true);
  });

  it('reads characters OCR commonly mixes up as the intended ones', () => {
    // Real ML Kit readings: a zero for the O in a split "STONE", and an O for the D in "BREWDOG".
    expect(suggest('ST0 NE\nARZY\nIPA').map((b) => b.brewery)).toContain('Stone Brewing');
    expect(suggest('BREWOOG').map((b) => b.brewery)).toContain('BrewDog');
    expect(matchBeerByText('0AURA DAMRN', beers)?.name).toBe('Daura Damm');
    // Short words still have to be read exactly, apart from those look-alike characters.
    expect(matchBeerByText('DAURA DANN', beers)).toBeNull();
  });

  it('lists current beers before discontinued ones', () => {
    const discontinued = suggest('GLUTENBERG').map((b) => b.discontinued);
    expect(discontinued).toEqual([...discontinued].sort((a, b) => Number(a) - Number(b)));
  });

  it('suggests nothing when no brewery was read', () => {
    expect(suggest('Some Barley Lager')).toEqual([]);
  });
});

describe('unseenNameWords', () => {
  const beer = (name: string) => beers.find((b) => b.name === name)!;

  it("lists the gluten-free words missing from a regular beer's label", () => {
    // A real ML Kit reading of a regular Peroni Nastro Azzurro, which contains gluten.
    const ocr = 'AP\nTAL\n8IRA\nPOM\nDAL18 46\nSUPERIORE\nPERONI\nNASTRO\nAZZURRO\nTALIP ANA';
    const unseen = unseenNameWords(beer('Peroni Nastro Azzurro Gluten Free'), [ocr]);
    expect(unseen).toEqual(['Gluten', 'Free']);
    expect(unseen.every(isGlutenClaimWord)).toBe(true);
  });

  it('counts a word seen in any of the readings', () => {
    expect(unseenNameWords(beer('Delicious IPA'), ['STONE', 'STONE\nDelicions IPA'])).toEqual([]);
    expect(unseenNameWords(beer('Vagabond Pale Ale'), ['BREWDOG\nVAGABOND\nGLUTEN FREE'])).toEqual(['Pale', 'Ale']);
  });

  it('recognizes gluten-free claims in the languages of our list', () => {
    expect(['Gluten-Free', 'Glutenfri', 'Glutenfrei', 'Sin', 'Senza'].every(isGlutenClaimWord)).toBe(true);
    expect(['Pale', 'Delicious', 'Nastro'].some(isGlutenClaimWord)).toBe(false);
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
