import type { Beer } from './db';
import { normalizeForSearch, searchBeers } from './search';

/*
 * Speech recognizers spell names they don't know the way they sound
 * ("rodaness" for Rådanäs, "alpine glow" for Alpenglow, "dora" for Daura),
 * and say numbers as words ("nittionio" for 99). This turns the recognizer's
 * candidate transcripts into the search query most likely meant: numbers as
 * digits, words that sound like a word of our list replaced by it, and the
 * candidate that finds beers and fits our names best chosen.
 */

const SV_UNITS: Record<string, number> = { noll: 0, en: 1, ett: 1, tva: 2, tre: 3, fyra: 4, fem: 5, sex: 6, sju: 7, atta: 8, nio: 9 };
const SV_TEENS: Record<string, number> = { tio: 10, elva: 11, tolv: 12, tretton: 13, fjorton: 14, femton: 15, sexton: 16, sjutton: 17, arton: 18, nitton: 19 };
const SV_TENS: Record<string, number> = { tjugo: 20, trettio: 30, fyrtio: 40, femtio: 50, sextio: 60, sjuttio: 70, attio: 80, nittio: 90 };
const EN_UNITS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const EN_TEENS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const EN_TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** A Swedish number written as one word, up to 999: "nittionio" → 99, "hundratjugo" → 120. */
function swedishNumber(word: string): number | null {
  let rest = word;
  let value = 0;
  const hundred = rest.match(/^(en|ett|tva|tre|fyra|fem|sex|sju|atta|nio)?hundra/);
  if (hundred) {
    value += (hundred[1] ? SV_UNITS[hundred[1]] : 1) * 100;
    rest = rest.slice(hundred[0].length);
    if (!rest) return value;
  }
  if (rest in SV_TEENS) return value + SV_TEENS[rest];
  for (const [tens, n] of Object.entries(SV_TENS)) {
    if (!rest.startsWith(tens)) continue;
    const unit = rest.slice(tens.length);
    if (!unit) return value + n;
    if (unit in SV_UNITS && unit !== 'noll') return value + n + SV_UNITS[unit];
    return null;
  }
  return rest in SV_UNITS ? value + SV_UNITS[rest] : null;
}

/** Number words, Swedish or English, as digits: "nittionio light" → "99 light", "ninety nine" → "99". */
export function spokenNumbersToDigits(text: string): string {
  const words = normalizeForSearch(text).split(' ').filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w in EN_TENS) {
      const next = words[i + 1];
      if (next && next in EN_UNITS && EN_UNITS[next] > 0) {
        out.push(String(EN_TENS[w] + EN_UNITS[next]));
        i++;
      } else out.push(String(EN_TENS[w]));
      continue;
    }
    if (w in EN_TEENS) out.push(String(EN_TEENS[w]));
    else if (w in EN_UNITS) out.push(String(EN_UNITS[w]));
    else {
      const sv = swedishNumber(w);
      out.push(sv === null ? w : String(sv));
    }
  }
  return out.join(' ');
}

/**
 * How a word sounds, roughly, in Swedish or English spelling: consonants
 * kept with like-sounding ones merged, each run of vowels one "*".
 * "radanas" and "rodaness" are both "r*d*n*s"; "alpenglow" and "alpineglo"
 * "*lp*ngl*".
 */
export function soundKey(word: string): string {
  return word
    .replace(/igh/g, 'aj')
    .replace(/ght/g, 't')
    .replace(/sch|sh|sj|stj|skj/g, 's')
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/ck|c|q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/z/g, 's')
    .replace(/([aeiouy])w(?![aeiouy])/g, '$1')
    .replace(/w/g, 'v')
    .replace(/(?<=.)h/g, '')
    .replace(/[aeiouy]+/g, '*')
    .replace(/([^*])\1+/g, '$1');
}

type Vocabulary = { display: Map<string, string>; bySound: Map<string, string[]>; byConsonants: Map<string, string[]> };
const vocabularyCache = new WeakMap<Beer[], Vocabulary>();

/** Our names' and breweries' words, by normalized form (to their spelling in the list) and by sound. */
function vocabulary(beers: Beer[]): Vocabulary {
  let vocab = vocabularyCache.get(beers);
  if (vocab) return vocab;
  const display = new Map<string, string>();
  for (const beer of beers) {
    for (const raw of `${beer.name} ${beer.brewery.replace(/\(.*?\)/g, '')}`.split(/[\s/]+/)) {
      const word = normalizeForSearch(raw).replace(/ /g, '');
      if (word.length >= 2 && !display.has(word)) display.set(word, raw.replace(/[^\p{L}\p{N}'-]/gu, ''));
    }
  }
  const bySound = new Map<string, string[]>();
  const byConsonants = new Map<string, string[]>();
  for (const word of display.keys()) {
    const key = soundKey(word);
    bySound.set(key, [...(bySound.get(key) ?? []), word]);
    const consonants = key.replace(/\*/g, '');
    byConsonants.set(consonants, [...(byConsonants.get(consonants) ?? []), word]);
  }
  vocab = { display, bySound, byConsonants };
  vocabularyCache.set(beers, vocab);
  return vocab;
}

/**
 * The word of our list that `word` sounds like, closest in spelling; null
 * when none. Long words may also differ in their vowels ("alpine glow" for
 * Alpenglow): from four consonants, the consonants alone are compared.
 */
function soundsLike(word: string, vocab: Vocabulary): string | null {
  if (word.length < 4 || /\d/.test(word)) return null;
  const key = soundKey(word);
  const consonants = key.replace(/\*/g, '');
  if (consonants.length < 2) return null;
  const matches = vocab.bySound.get(key) ?? (consonants.length >= 4 ? vocab.byConsonants.get(consonants) : undefined);
  if (!matches) return null;
  return [...matches].sort((a, b) => spellingDistance(word, a) - spellingDistance(word, b))[0];
}

function spellingDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return row[b.length];
}

type Reading = { query: string; known: number; words: number; changed: number };

/** One way of hearing the transcript, with words joined or replaced to fit our list. */
function fitToList(text: string, vocab: Vocabulary): Reading {
  const words = normalizeForSearch(text).split(' ').filter(Boolean);
  const out: string[] = [];
  let known = 0;
  let changed = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1];
    // Two words that make one of ours, first: "brew dog" is BrewDog, though
    // "brew" alone is a word of ours too; "arton femtiosex" is Arton56.
    if (next !== undefined) {
      const joins = [w + next, w + spokenNumbersToDigits(next)];
      const exact = joins.find((j) => vocab.display.has(j));
      if (exact) {
        out.push(vocab.display.get(exact)!);
        known++;
        i++;
        continue;
      }
    }
    if (vocab.display.has(w)) {
      out.push(vocab.display.get(w)!);
      known++;
      continue;
    }
    if (next !== undefined) {
      const match = soundsLike(w + next, vocab);
      if (match) {
        out.push(vocab.display.get(match)!);
        known++;
        changed++;
        i++;
        continue;
      }
    }
    const match = soundsLike(w, vocab);
    if (match) {
      out.push(vocab.display.get(match)!);
      known++;
      changed++;
    } else out.push(w);
  }
  return { query: out.join(' '), known, words: out.length, changed };
}

/**
 * The search query a spoken search most likely meant, from the recognizer's
 * candidate transcripts (best first). Each is tried as heard and with its
 * number words as digits; the reading that finds beers wins, then the one
 * whose words are most our list's, then the one changed least, then the
 * recognizer's order.
 */
export function queryFromSpeech(transcripts: string[], beers: Beer[]): string {
  const vocab = vocabulary(beers);
  let best: (Reading & { finds: boolean }) | null = null;
  for (const transcript of transcripts) {
    const variants = [...new Set([normalizeForSearch(transcript), spokenNumbersToDigits(transcript)])];
    for (const variant of variants) {
      if (!variant) continue;
      const reading = fitToList(variant, vocab);
      const candidate = { ...reading, finds: searchBeers(beers, reading.query).length > 0 };
      if (
        !best ||
        (candidate.finds && !best.finds) ||
        (candidate.finds === best.finds &&
          (candidate.known / candidate.words > best.known / best.words ||
            (candidate.known / candidate.words === best.known / best.words && candidate.changed < best.changed)))
      ) {
        best = candidate;
      }
    }
  }
  return best?.query ?? transcripts[0] ?? '';
}
