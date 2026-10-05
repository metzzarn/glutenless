import type { Beer } from '../lib/db';
import { breweryQuery, normalizeForSearch, searchBeers } from '../lib/search';
import beersSeed from '../data/beers.json';

const beer = (id: number, over: Partial<Beer>) =>
  ({ id, name: '', brewery: '', style: '', country: '', personalNote: '', ...over }) as Beer;

const beers = [
  beer(1, { name: 'Blonde', brewery: 'Glutenberg (Brasseurs Sans Gluten)', style: 'Blonde Ale', country: 'Canada' }),
  beer(2, { name: 'Daura Damm', brewery: 'Damm / Estrella Damm', style: 'Pale Lager', country: 'Spain' }),
  beer(3, { name: 'Grapefruit IPA', brewery: 'Ghostfish Brewing', style: 'IPA', country: 'USA' }),
  beer(4, { name: 'Dark Lager', brewery: 'Mönchshof', style: 'Dunkel', country: 'Germany', personalNote: 'Sold at the corner shop' }),
];
const ids = (query: string) => searchBeers(beers, query).map((b) => b.id);

describe('normalizeForSearch', () => {
  it('lowercases, strips accents and turns punctuation into single spaces', () => {
    expect(normalizeForSearch('  Mönchshof — Dark/Lager! ')).toBe('monchshof dark lager');
  });
});

describe('searchBeers', () => {
  it('returns the list unchanged for an empty query', () => {
    expect(ids('  ')).toEqual([1, 2, 3, 4]);
  });

  it('matches style, country and the personal note as well as name and brewery', () => {
    expect(ids('lager')).toEqual([2, 4]);
    expect(ids('spain')).toEqual([2]);
    expect(ids('corner shop')).toEqual([4]);
  });

  it('ignores accents in the beer data', () => {
    expect(ids('monchshof')).toEqual([4]);
  });

  it('needs every word to match, in any field and order', () => {
    expect(ids('ghostfish ipa')).toEqual([3]);
    expect(ids('ipa spain')).toEqual([]);
  });

  it('tolerates typos in longer words', () => {
    expect(ids('glutenburg')).toEqual([1]);
    expect(ids('grapefriut')).toEqual([3]);
    expect(ids('estrela')).toEqual([2]);
  });

  it('tolerates a typo in a word still being typed', () => {
    expect(ids('ghostfi')).toEqual([3]);
    expect(ids('ghotsfi')).toEqual([3]);
  });

  it('keeps short words exact', () => {
    expect(ids('ipo')).toEqual([]);
  });

  it('allows two typos only in long words', () => {
    // "brewoog" is one letter off "brewdog" but two off "brewing", which half our breweries share.
    const list = [beer(1, { brewery: 'Ghostfish Brewing' }), beer(2, { brewery: 'BrewDog' }), beer(3, { brewery: 'Abbeydale Brewery' })];
    expect(searchBeers(list, 'brewoog').map((b) => b.id)).toEqual([2]);
    expect(ids('grapefriut')).toEqual([3]);
  });

  it('counts swapped neighbouring letters as one typo', () => {
    expect(ids('ghotsfish')).toEqual([3]);
    expect(ids('estrlela')).toEqual([2]);
  });

  it('ranks typo matches by how close they are', () => {
    // "glutenbugr" is one swap from "glutenburg", two typos from "glutenberg".
    const list = [beer(1, { name: 'Glutenberg' }), beer(2, { name: 'Glutenburg' })];
    expect(searchBeers(list, 'glutenbugr').map((b) => b.id)).toEqual([2, 1]);
  });

  it('ranks exact matches before typo matches', () => {
    const list = [beer(1, { name: 'Pale Lager' }), beer(2, { name: 'Pale Larger' })];
    expect(searchBeers(list, 'larger').map((b) => b.id)).toEqual([2, 1]);
  });
});

describe('breweryQuery', () => {
  it('drops the parent company in brackets', () => {
    expect(breweryQuery('Mongozo (Brouwerij Huyghe)')).toBe('Mongozo');
    expect(breweryQuery('Glutenberg (Brasseurs Sans Gluten)')).toBe('Glutenberg');
    expect(breweryQuery('BrewDog')).toBe('BrewDog');
  });
});

describe('searching for a brewery tapped on a beer page', () => {
  const all = (beersSeed as unknown as Beer[]).map((b) => ({ ...b, favorite: false, personalNote: '' }));

  it("finds every one of the brewery's beers, for every brewery in the list", () => {
    for (const brewery of new Set(all.map((b) => b.brewery))) {
      const found = new Set(searchBeers(all, breweryQuery(brewery)).map((b) => b.id));
      const missing = all.filter((b) => b.brewery === brewery && !found.has(b.id)).map((b) => b.name);
      expect({ brewery, missing }).toEqual({ brewery, missing: [] });
    }
  });
});
