jest.mock('../modules/label-reader', () => ({}));

import beersSeed from '../data/beers.json';
import { agreedText, combineAiReadings, matchAiText } from '../lib/aiLabel';
import type { Beer } from '../lib/db';

const beers = beersSeed as unknown as Beer[];

describe('agreedText', () => {
  it('drops words only one reading invented', () => {
    // A real Nano reading of a Delicious IPA can invented the last two lines.
    const readings = [
      'STONE\nDelicious\nIPA\nEST. 1992\nALMOND GROVE, EL PASO, TX',
      'STONE\nDelicious IPA',
      'Stone\nDelicious\nIPA\nEST. 1996',
    ];
    expect(agreedText(readings)).toBe('stone\ndelicious\nipa\nest');
  });

  it('needs at least two readings to agree', () => {
    expect(agreedText(['STONE Delicious IPA'])).toBe('');
    expect(agreedText(['STONE Delicious', 'GLUTENBERG Blonde'])).toBe('');
  });

  it('matches the agreed text like any other reading', () => {
    const agreed = agreedText(['STONE\nDelicious\nIPA', 'Stone Delicious IPA\nmade up']);
    expect(matchAiText(agreed, beers).matches.map((b) => b.name)).toEqual(['Delicious IPA']);
  });
});

describe('combineAiReadings', () => {
  const read = (...texts: string[]) => combineAiReadings(texts.map((t) => matchAiText(t, beers)), beers);

  it('accepts a beer every reading matched', () => {
    expect(read('STONE\nDelicious\nIPA', 'STONE\nDelicious IPA').match?.name).toBe('Delicious IPA');
  });

  it('accepts nothing from a single reading', () => {
    expect(read('STONE\nDelicious\nIPA').match).toBeNull();
  });

  it('falls back to suggestions when the readings disagree', () => {
    const result = read('STONE\nDelicious\nIPA', 'STONE\nIPA');
    expect(result.match).toBeNull();
    expect(result.suggestions.map((b) => b.name)).toEqual(['Delicious IPA']);
  });

  it('matches nothing for a regular Peroni, read by Gemini Nano', () => {
    const result = read('PERONI\nNASTRO AZZURRO', 'PERONI\nNASTRO AZZURRO');
    expect(result.match).toBeNull();
    expect(result.suggestions.map((b) => b.name)).toEqual(['Peroni Nastro Azzurro Gluten Free']);
  });
});
