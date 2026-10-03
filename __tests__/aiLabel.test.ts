jest.mock('../modules/label-reader', () => ({}));

import beersSeed from '../data/beers.json';
import { agreedText, matchAiText } from '../lib/aiLabel';
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
