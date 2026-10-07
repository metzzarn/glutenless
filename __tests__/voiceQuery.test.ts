import beersSeed from '../data/beers.json';
import type { Beer, BeerData } from '../lib/db';
import { searchBeers } from '../lib/search';
import { statusFromFlags } from '../lib/status';
import { queryFromSpeech, soundKey, spokenNumbersToDigits } from '../lib/voiceQuery';

const beers: Beer[] = (beersSeed as BeerData[]).map((b) => ({ ...b, status: statusFromFlags(b.glutenFree), favorite: false, personalNote: '' }));
const heard = (...transcripts: string[]) => queryFromSpeech(transcripts, beers);
const firstResult = (...transcripts: string[]) => searchBeers(beers, heard(...transcripts))[0]?.name;

describe('spoken numbers', () => {
  it('turns Swedish and English number words into digits', () => {
    expect(spokenNumbersToDigits('nittionio light')).toBe('99 light');
    expect(spokenNumbersToDigits('tjugoåtta hundratjugo')).toBe('28 120');
    expect(spokenNumbersToDigits('ninety nine light')).toBe('99 light');
  });
});

describe('sound keys', () => {
  it('give names the same key however they were spelt by ear', () => {
    expect(soundKey('radanas')).toBe(soundKey('rodaness'));
    expect(soundKey('daura')).toBe(soundKey('dora'));
    expect(soundKey('light')).toBe(soundKey('lajt'));
  });
});

describe('the query a spoken search meant', () => {
  it('replaces words that sound like names in our list', () => {
    expect(heard('rodaness')).toBe('Rådanäs');
    expect(heard('rådanes ipa')).toBe('Rådanäs IPA');
    expect(heard('dora damm')).toBe('Daura Damm');
  });

  it('joins words that make one of our names', () => {
    expect(heard('roda ness')).toBe('Rådanäs');
    expect(heard('alpen glow')).toBe('Alpenglow');
    expect(heard('alpine glow')).toBe('Alpenglow');
    expect(heard('brew dog vagabond')).toBe('BrewDog Vagabond');
    expect(heard('arton femtiosex')).toBe('Arton56');
  });

  it('says numbers as digits when that finds beers', () => {
    expect(firstResult('nittionio light')).toBe('99 Light');
    expect(firstResult('ninety nine light')).toBe('99 Light');
    expect(firstResult('99 lajt')).toBe('99 Light');
  });

  it("prefers the recognizer's candidate that finds beers", () => {
    expect(heard('hej', 'glutenberg')).toBe('Glutenberg');
  });

  it('leaves words it has no match for as heard', () => {
    expect(heard('stella artwa')).toBe('Stella artwa');
  });
});
