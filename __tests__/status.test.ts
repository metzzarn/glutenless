import { isGlutenStatusConfirmed, statusFromFlags } from '../lib/status';
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

describe('isGlutenStatusConfirmed', () => {
  it('needs the flag that actually applies to the beer to be confirmed', () => {
    expect(isGlutenStatusConfirmed({ glutenFree: true, glutenRemoved: false, confirmed: ['glutenFree'] })).toBe(true);
    expect(isGlutenStatusConfirmed({ glutenFree: false, glutenRemoved: true, confirmed: ['glutenRemoved'] })).toBe(true);
  });

  it('is not fooled by confirming the flag that does not apply', () => {
    expect(isGlutenStatusConfirmed({ glutenFree: true, glutenRemoved: false, confirmed: ['glutenRemoved'] })).toBe(false);
    expect(isGlutenStatusConfirmed({ glutenFree: false, glutenRemoved: true, confirmed: ['glutenFree', 'ppm'] })).toBe(false);
  });

  it('is false when nothing has been confirmed', () => {
    expect(isGlutenStatusConfirmed({ glutenFree: true, glutenRemoved: false })).toBe(false);
    expect(isGlutenStatusConfirmed({ glutenFree: true, glutenRemoved: false, confirmed: [] })).toBe(false);
  });
});
