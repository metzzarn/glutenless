import { statusFromFlags } from '../lib/status';
import beersSeed from '../data/beers.json';

describe('statusFromFlags', () => {
  it('is "free" when glutenFree is true', () => {
    expect(statusFromFlags(true)).toBe('free');
  });

  it('is "low" when glutenFree is false', () => {
    expect(statusFromFlags(false)).toBe('low');
  });

  it('agrees with every entry in data/beers.json', () => {
    for (const beer of beersSeed as { glutenFree: boolean }[]) {
      expect(statusFromFlags(beer.glutenFree)).toBe(beer.glutenFree ? 'free' : 'low');
    }
  });
});
