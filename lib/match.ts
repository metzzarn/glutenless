import type { Beer } from './db';

function normalize(s: string): string {
  return s
    .toLowerCase()
    // Fold accents ("Märzen" → "marzen", OCR's "TỌNE" → "tone") instead of
    // dropping the letter, so labels and OCR misreads compare on their base letters.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Words that describe a beer's style rather than name it. Many gluten-free
 * beers are named with nothing else ("IPA", "Hazy IPA", "West Coast Pale
 * Ale"), and any brewery's beer of that style prints the same words — a Stone
 * Hazy IPA, which contains gluten, matched Aurochs' gluten-free "Hazy IPA".
 */
const STYLE_WORDS = new Set(
  (
    'ipa ipl dipa neipa apa esb india pale ale ales lager lagers pils pilsner pilsener stout porter ' +
    'amber blonde blond golden gold red brown dark black white wheat weiss weizen witbier wit hefeweizen ' +
    'sour gose kolsch helles dunkel dunkles bock doppelbock marzen festbier session hazy juicy new ' +
    'england west coast double triple tripel dubbel quad imperial american english belgian irish german ' +
    'mexican light lite premium classic original craft beer cerveza bier birra biere gluten free ' +
    'glutenfri glutenfrei sin senza sans reduced removed alcohol alkoholfrei non zero cream extra special ' +
    'bitter mild saison farmhouse fruit sparkling radler shandy honey rice hoppy hop hops unfiltered ' +
    'keller natural bio organic ekologisk and the of with'
  ).split(' '),
);

/** Words that claim a beer is gluten-free or gluten-reduced, in the languages of our list. */
const GLUTEN_CLAIM_WORDS = new Set(['gluten', 'free', 'glutenfri', 'glutenfrei', 'sin', 'senza', 'sans', 'gf', 'reduced', 'removed']);

/**
 * The words of a beer's name a label must show to identify it: all but the
 * style words, which labels often leave out ("Vagabond Pale Ale" is printed
 * "VAGABOND"). Gluten-free claims always stay: "Peroni Nastro Azzurro Gluten
 * Free" and the regular Peroni, which contains gluten, differ only by them.
 */
function distinctiveWords(name: string): string[] {
  return name.split(' ').filter((word) => word && (!STYLE_WORDS.has(word) || GLUTEN_CLAIM_WORDS.has(word)));
}

/**
 * A name made only of style words ("Hazy IPA", "Light Lager") identifies no
 * particular beer, so it only counts alongside the beer's own brewery.
 */
function isGenericName(name: string): boolean {
  return name.split(' ').every((word) => STYLE_WORDS.has(word));
}

const BREWERY_STOP_WORDS = new Set([
  'brewing', 'beer', 'beers', 'brewery', 'breweries', 'co', 'company', 'the', 'craft',
]);

/** Words a label can print around a brewery's name, or leave out of it. */
const BREWERY_KEY_STOP_WORDS = new Set([
  ...BREWERY_STOP_WORDS,
  'brasserie', 'brauerei', 'privatbrauerei', 'bryggeri', 'brouwerij', 'birra',
  'gluten', 'free', 'de', 'du',
]);

/**
 * The distinctive words that show a brewery's own name was printed: "stone"
 * for "Stone Brewing", "glutenberg" for "Glutenberg (Brasseurs Sans Gluten)",
 * and each alternative of "Coors / Molson Coors".
 */
function breweryKeys(brewery: string): string[] {
  return brewery
    .replace(/\(.*?\)/g, '')
    .split('/')
    .map((part) => normalize(part).split(' ').filter((w) => w && !BREWERY_KEY_STOP_WORDS.has(w)).join(' '))
    .filter((key) => key.length >= 3);
}

/** The single word most likely to identify a brewery in printed text, e.g. "Glutenberg" out of "Glutenberg (Brasseurs Sans Gluten)". */
function breweryToken(brewery: string): string {
  const words = normalize(brewery.replace(/\(.*?\)/g, '')).split(' ').filter(Boolean);
  return words.find((w) => !BREWERY_STOP_WORDS.has(w) && w.length > 2) ?? words[0] ?? '';
}

/**
 * Whether `needle` and `token` both occur within `window` lines of each
 * other. Menus print a beer's own brewery close to its name/style, so this
 * distinguishes an entry's own style column from a same-named style word
 * printed for a different beer elsewhere on the menu.
 */
function occursNear(lines: string[], needle: string, token: string, window: number): boolean {
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(needle)) continue;
    const from = Math.max(0, i - window);
    const to = Math.min(lines.length, i + window + 1);
    for (let j = from; j < to; j++) {
      if (lines[j].includes(token)) return true;
    }
  }
  return false;
}

/** One beer whose name or brewery appeared in the OCR text, and whether it counted. */
export type MatchCandidate = {
  beer: Beer;
  field: 'name' | 'brewery';
  /** The normalized name or brewery that was looked for. */
  needle: string;
  /** The normalized OCR text it was found as; differs from `needle` for a near-miss read. */
  found: string;
  /** Why the hit was not counted as a match; absent when it was. */
  rejected?: string;
};

/**
 * How many single-letter mistakes OCR may make in a word and still match it.
 * Short words must be exact: one wrong letter in "ale" or "ipa" makes a
 * different word, and a wrong match can show a gluten beer as gluten-free.
 */
function allowedEdits(word: string): number {
  if (word.length >= 9) return 2;
  if (word.length >= 5) return 1;
  return 0;
}

/** Levenshtein distance, giving up (returning max + 1) once it exceeds `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, row[j]);
    }
    if (rowMin > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/**
 * Looks for `needle`'s words as consecutive OCR words, letting a few letters
 * be misread ("delici0us ipa" for "delicious ipa"). Returns the OCR words it
 * matched, preferring an exact read, or null.
 *
 * A near-miss needs some exact anchor, since one wrong letter turns many
 * words into other real words ("sans" vs the beer "Sansa"): a multi-word name
 * needs at least one word read exactly, and a single-word name must be long
 * enough (8+ letters) that a one-letter slip can't plausibly be another word.
 */
function findWords(ocrWords: string[], needle: string): string | null {
  const words = needle.split(' ');
  const single = words.length === 1;
  if (single && needle.length < 8) return ocrWords.includes(needle) ? needle : null;

  let nearMiss: string | null = null;
  for (let i = 0; i + words.length <= ocrWords.length; i++) {
    const window = ocrWords.slice(i, i + words.length);
    if (window.every((w, j) => w === words[j])) return needle;
    if (nearMiss) continue;
    const anchored = single || window.some((w, j) => w === words[j]);
    const close = window.every((w, j) => {
      const max = single ? 1 : allowedEdits(words[j]);
      return editDistance(w, words[j], max) <= max;
    });
    if (anchored && close) nearMiss = window.join(' ');
  }
  return nearMiss;
}

/**
 * Rejoins words that OCR split apart on letter-spaced lettering: a wordmark
 * printed "S T O N E" reads as "s t o n e" or "ston e". A run of short
 * fragments, at least half of them single letters, becomes one word.
 */
function joinSpacedLetters(words: string[]): string[] {
  const joined: string[] = [];
  let run: string[] = [];
  const flush = () => {
    const singles = run.filter((w) => w.length === 1).length;
    if (run.length >= 2 && singles * 2 >= run.length) joined.push(run.join(''));
    else joined.push(...run);
    run = [];
  };
  for (const word of words) {
    if (word.length <= 4 && /^[a-z]+$/.test(word)) run.push(word);
    else {
      flush();
      joined.push(word);
    }
  }
  flush();
  return joined;
}

/** The OCR words, plus a version with letter-spaced words rejoined when that differs. */
function readings(text: string): string[][] {
  const words = normalize(text).split(' ').filter(Boolean);
  const joined = joinSpacedLetters(words);
  return joined.length === words.length ? [words] : [words, joined];
}

function findInReadings(ocrReadings: string[][], needle: string): string | null {
  for (const words of ocrReadings) {
    const found = findWords(words, needle);
    if (found) return found;
  }
  // Rejoining can't tell where one spaced-out word ends and the next starts
  // ("D A U R A  D A M M" → "dauradamm"), so also try the name without spaces, exactly.
  const compact = needle.replace(/ /g, '');
  if (compact !== needle && ocrReadings.at(-1)!.includes(compact)) return compact;
  // And the other way round: a one-word name read as two ("BREW DOG" for "BrewDog").
  if (compact === needle && needle.length >= 6) {
    const words = ocrReadings[0];
    for (let i = 0; i + 1 < words.length; i++) {
      if (words[i] + words[i + 1] === needle) return `${words[i]} ${words[i + 1]}`;
    }
  }
  return null;
}

/**
 * Every name/brewery hit for a single can or bottle, including the ones the
 * matcher discards — the scan debug screen shows all of them.
 *
 * Only a beer's name identifies it. A brewery alone doesn't: most breweries
 * here also make beers with gluten (Stone's only gluten-reduced beer is
 * Delicious IPA), so a brewery hit is listed but never counted. A generic
 * name ("IPA", "Hazy IPA") only counts when the beer's brewery is also on the
 * label, otherwise another brewery's IPA would be shown as our gluten-free one.
 * And a name never counts when the label shows a different brewery from our list.
 */
export function findCanCandidates(text: string, beers: Beer[]): MatchCandidate[] {
  const ocrReadings = readings(text);
  if (!ocrReadings[0].length) return [];

  const candidates: MatchCandidate[] = [];
  const seenBreweries = new Set<string>();
  for (const beer of beers) {
    const name = normalize(beer.name);
    const nameFound = name ? findInReadings(ocrReadings, name) : null;
    if (nameFound) {
      let rejected: string | undefined;
      if (isGenericName(name)) {
        const token = breweryToken(beer.brewery);
        if (!token || !findInReadings(ocrReadings, token)) {
          rejected = `generic name without brewery "${token}"`;
        }
      }
      candidates.push({ beer, field: 'name', needle: name, found: nameFound, rejected });
    }

    // Listed once per brewery: it identifies the brewery, not the beer.
    if (seenBreweries.has(beer.brewery)) continue;
    seenBreweries.add(beer.brewery);
    for (const key of breweryKeys(beer.brewery)) {
      const breweryFound = findInReadings(ocrReadings, key);
      if (!breweryFound) continue;
      candidates.push({
        beer,
        field: 'brewery',
        needle: key,
        found: breweryFound,
        rejected: "a brewery alone doesn't say which of its beers this is",
      });
      break;
    }
  }

  // A beer named with more than the label printed: once its own brewery is
  // read, every distinctive word of its name counts as naming it, as long as
  // that fits only one of the brewery's beers.
  const breweriesSeen = new Set(candidates.filter((c) => c.field === 'brewery').map((c) => c.beer.brewery));
  const fullyNamed = new Set(candidates.filter((c) => c.field === 'name' && !c.rejected).map((c) => c.beer.id));
  for (const brewery of breweriesSeen) {
    const fits = beers.flatMap((beer) => {
      if (beer.brewery !== brewery || fullyNamed.has(beer.id)) return [];
      const words = distinctiveWords(normalize(beer.name));
      if (!words.some((w) => !STYLE_WORDS.has(w))) return [];
      const found = words.map((w) => findInReadings(ocrReadings, w));
      return found.every(Boolean) ? [{ beer, needle: words.join(' '), found: found.join(' ') }] : [];
    });
    for (const fit of fits) {
      candidates.push({
        beer: fit.beer,
        field: 'name',
        needle: fit.needle,
        found: fit.found,
        rejected: fits.length > 1 ? `several ${brewery} beers fit what was read` : undefined,
      });
    }
  }

  // A label showing another brewery from our list, and not this beer's own,
  // is that other brewery's beer of the same name or style.
  const breweriesRead = new Set(candidates.filter((c) => c.field === 'brewery').map((c) => c.beer.brewery));
  for (const candidate of candidates) {
    if (candidate.field !== 'name' || candidate.rejected || !breweriesRead.size) continue;
    if (!breweriesRead.has(candidate.beer.brewery)) {
      candidate.rejected = `the label shows another brewery (${[...breweriesRead].join(', ')})`;
    }
  }
  return candidates;
}

/**
 * There's no external beer-recognition database here — matching is limited to
 * the beers already in our local dataset. This finds the beer whose name best
 * overlaps with recognized OCR text, picking the longest name so "IPA" doesn't
 * outrank "Shrouded Summit IPA", then an exact read over a near-miss.
 */
export function matchBeerByText(text: string, beers: Beer[]): Beer | null {
  let best: MatchCandidate | null = null;
  for (const candidate of findCanCandidates(text, beers)) {
    if (candidate.rejected) continue;
    if (
      !best ||
      candidate.needle.length > best.needle.length ||
      (candidate.needle.length === best.needle.length &&
        candidate.found === candidate.needle &&
        best.found !== best.needle)
    ) {
      best = candidate;
    }
  }
  return best?.beer ?? null;
}

/**
 * When a label's brewery was read but none of our beer names were (Stone's
 * "Delicious IPA" is in a script font OCR can't read), the beers we list from
 * that brewery, for the person to pick from. Never a match on its own: the
 * brewery also makes beers with gluten that aren't in our list.
 */
export function suggestByBrewery(candidates: MatchCandidate[], beers: Beer[]): Beer[] {
  const breweries = new Set(candidates.filter((c) => c.field === 'brewery').map((c) => c.beer.brewery));
  return beers
    .filter((beer) => breweries.has(beer.brewery))
    .sort((a, b) => Number(a.discontinued) - Number(b.discontinued) || a.name.localeCompare(b.name));
}

/**
 * The words of a beer's name (as written in our list) that none of the label
 * readings contain. A suggestion for "Peroni Nastro Azzurro Gluten Free" on a
 * regular Peroni bottle, which contains gluten, is missing "Gluten Free".
 */
export function unseenNameWords(beer: Beer, texts: string[]): string[] {
  const textReadings = texts.map(readings);
  return beer.name.split(/\s+/).filter((word) => {
    const tokens = normalize(word).split(' ').filter(Boolean);
    return tokens.length > 0 && !tokens.every((t) => textReadings.some((r) => findInReadings(r, t)));
  });
}

/** Whether a word of a beer's name is a gluten-free claim ("Gluten-Free", "Glutenfri", "Sin"). */
export function isGlutenClaimWord(word: string): boolean {
  const tokens = normalize(word).split(' ').filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => GLUTEN_CLAIM_WORDS.has(t));
}

/** Every beer name found in a menu's OCR text, including the ones the matcher discards. */
export function findMenuCandidates(text: string, beers: Beer[]): MatchCandidate[] {
  const haystack = normalize(text);
  if (!haystack) return [];
  const joinedHaystack = readings(text).at(-1)!.join(' ');

  const lines = text.split('\n').map(normalize);

  const candidates: MatchCandidate[] = [];
  for (const beer of beers) {
    const name = normalize(beer.name);
    if (!name || !(haystack.includes(name) || joinedHaystack.includes(name))) continue;
    let rejected: string | undefined;
    if (isGenericName(name)) {
      const token = breweryToken(beer.brewery);
      if (!token || !occursNear(lines, name, token, 2)) {
        rejected = `generic name without brewery "${token}" nearby`;
      }
    }
    candidates.push({ beer, field: 'name', needle: name, found: name, rejected });
  }
  return candidates;
}

/** Same idea, but returns every beer that appears anywhere in a menu's OCR text. */
export function matchBeersInMenuText(text: string, beers: Beer[]): Beer[] {
  return findMenuCandidates(text, beers)
    .filter((candidate) => !candidate.rejected)
    .map((candidate) => candidate.beer);
}

/** The lowercase, punctuation-free form of OCR text that the matchers search. */
export { normalize as normalizeOcrText };
