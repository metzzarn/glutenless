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

const ARTICLES = ['la', 'le', 'les', 'el', 'il', 'lo', 'der', 'die', 'das'];

/**
 * Words that describe a beer's style rather than name it. Many gluten-free
 * beers are named with nothing else ("IPA", "Hazy IPA", "West Coast Pale
 * Ale"), and any brewery's beer of that style prints the same words — a Stone
 * Hazy IPA, which contains gluten, matched Aurochs' gluten-free "Hazy IPA".
 * Alcohol words are here too: a US label's government warning ("ALCOHOLIC
 * BEVERAGES") made a Glutenberg IPA can match their "Non-Alcoholic Blonde".
 * Articles are here too: with "Mont Blanc" read, "La" alone named Mont
 * Blanc's gluten-free "La Blonde" on a can of their "La Blanche".
 */
const STYLE_WORDS = new Set([
  ...ARTICLES,
  ...(
    'ipa ipl dipa neipa apa esb india pale ale ales lager lagers pils pilsner pilsener stout porter ' +
    'amber blonde blond golden gold red brown dark black white wheat weiss weizen witbier wit hefeweizen ' +
    'sour gose kolsch helles dunkel dunkles bock doppelbock marzen festbier session hazy juicy new ' +
    'england west coast double triple tripel dubbel quad imperial american english belgian irish german ' +
    'japanese czech italian spanish dutch bavarian british scottish australian ' +
    'mexican light lite premium classic original craft beer cerveza bier birra biere gluten free ' +
    'glutenfri glutenfrei sin senza sans reduced removed alcohol alcoholic alkoholfrei alkoholfri alkoholiton ' +
    'alkoholfritt alcoholvrij alcolica analcolica analcolico na non zero cream extra special ' +
    'bitter mild saison farmhouse fruit sparkling radler shandy honey rice hoppy hop hops unfiltered ' +
    'keller natural bio organic ekologisk and the of with'
  ).split(' '),
]);

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
export function isGenericName(name: string): boolean {
  return name.split(' ').every((word) => STYLE_WORDS.has(word));
}

/**
 * Short names menus print for a beer, checked by hand: each must name only
 * that beer, so that no other beer, with or without gluten, is printed the
 * same way. Matched as whole words, like a full name.
 */
const MENU_SHORT_NAMES: Record<string, string[]> = {
  // Peroni's only gluten-free beer; menus list it as "Peroni Gluten Free".
  'Peroni Nastro Azzurro Gluten Free': ['peroni gluten free'],
};

/** Style words that say nothing about which beer: a menu line's "Craft Beer" doesn't rule out a name without them. */
const NEUTRAL_WORDS = new Set([
  'beer', 'bier', 'birra', 'biere', 'cerveza', 'craft', 'the', 'and', 'of', 'with',
  ...ARTICLES,
]);

/**
 * Names of beers that contain gluten, from breweries in our list, which hold
 * every distinctive word of one of their gluten-free beers: Williams Bros'
 * "Juicy Joker" read as Joker IPA, since "juicy" is a style word. A label
 * printing one never matches, and on a menu its words don't name our beer.
 * Checked against the brewers' own pages.
 */
const GLUTEN_LOOKALIKES = ['juicy joker', 'caesar af'];

/** A reading's words as one string, with any look-alike name in it blanked out. */
function withoutLookalikes(words: string[]): string {
  let text = ` ${words.join(' ')} `;
  for (const name of GLUTEN_LOOKALIKES) text = text.split(` ${name} `).join(' | ');
  return text;
}

const BREWERY_STOP_WORDS = new Set([
  'brewing', 'beer', 'beers', 'brewery', 'breweries', 'co', 'company', 'the', 'craft',
]);

/** Words a label can print around a brewery's name, or leave out of it. */
const BREWERY_KEY_STOP_WORDS = new Set([
  ...BREWERY_STOP_WORDS,
  'brasserie', 'brauerei', 'privatbrauerei', 'bryggeri', 'brouwerij', 'birra',
  'gluten', 'free', 'de', 'du',
  // Finnish "soft drinks factory": Laitilan Wirvoitusjuomatehdas prints just "LAITILAN".
  'wirvoitusjuomatehdas', 'virvoitusjuomatehdas',
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

/**
 * The single word most likely to identify a brewery in printed text, e.g.
 * "Glutenberg" out of "Glutenberg (Brasseurs Sans Gluten)", "Brunehaut" out
 * of "Brasserie de Brunehaut".
 */
function breweryToken(brewery: string): string {
  const words = normalize(brewery.replace(/\(.*?\)/g, '')).split(' ').filter(Boolean);
  return words.find((w) => !BREWERY_KEY_STOP_WORDS.has(w) && w.length > 2) ?? words[0] ?? '';
}

/**
 * Whether `needle` and `token` both occur, as whole words, within `window`
 * lines of each other. Menus print a beer's own brewery close to its
 * name/style, so this distinguishes an entry's own style column from a
 * same-named style word printed for a different beer elsewhere on the menu.
 * An occurrence on a line naming another brewery (`otherBrewery`) is that
 * brewery's: "Glutenberg IPA" beside "Omission Lager" isn't Omission's IPA.
 */
function occursNear(
  lines: string[],
  needle: string,
  token: string,
  window: number,
  otherBrewery: (line: string) => boolean = () => false,
): boolean {
  const has = (line: string, words: string) => ` ${line} `.includes(` ${words} `);
  for (let i = 0; i < lines.length; i++) {
    // The name may be wrapped onto the next line ("Nils Oscar India Ale / Glutenfri").
    const entry = has(lines[i], needle) ? lines[i] : `${lines[i]} ${lines[i + 1] ?? ''}`;
    if (!has(entry, needle)) continue;
    if (!has(entry, token) && otherBrewery(entry)) continue;
    const from = Math.max(0, i - window);
    const to = Math.min(lines.length, i + window + 1);
    for (let j = from; j < to; j++) {
      if (has(lines[j], token)) return true;
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
/**
 * A word with the characters OCR mixes up merged into one form each: a "D"
 * read as "O" ("BREWOOG"), a zero for an O ("ST0NE"), "1"/"l"/"I", "rn" for
 * "m". Comparing skeletons treats those misreads as exact reads.
 */
function skeleton(word: string): string {
  return word
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/[0dq]/g, 'o')
    .replace(/[1i]/g, 'l')
    .replace(/5/g, 's')
    .replace(/8/g, 'b')
    .replace(/2/g, 'z')
    .replace(/6/g, 'g');
}

// Skeletons of a reading's words, computed once per reading rather than per beer.
const skeletonCache = new WeakMap<string[], string[]>();
function skeletons(words: string[]): string[] {
  let cached = skeletonCache.get(words);
  if (!cached) skeletonCache.set(words, (cached = words.map(skeleton)));
  return cached;
}

function findWords(ocrWords: string[], needle: string): string | null {
  const words = needle.split(' ').map(skeleton);
  const ocr = skeletons(ocrWords);
  const single = words.length === 1;
  if (single && needle.length < 8) {
    const at = ocr.indexOf(words[0]);
    return at === -1 ? null : ocrWords[at] === needle ? needle : ocrWords[at];
  }

  let nearMiss: string | null = null;
  for (let i = 0; i + words.length <= ocr.length; i++) {
    const window = ocr.slice(i, i + words.length);
    const read = ocrWords.slice(i, i + words.length).join(' ');
    if (window.every((w, j) => w === words[j])) return read === needle ? needle : read;
    if (nearMiss) continue;
    const anchored = single || window.some((w, j) => w === words[j]);
    const close = window.every((w, j) => {
      const max = single ? 1 : allowedEdits(words[j]);
      return editDistance(w, words[j], max) <= max;
    });
    if (anchored && close) nearMiss = read;
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
    if (word.length <= 4 && /^[a-z0-9]+$/.test(word) && /[a-z]/.test(word)) run.push(word);
    else {
      flush();
      joined.push(word);
    }
  }
  flush();
  return joined;
}

// Every word of our beer list's names and breweries, and the style words, for
// splitting run-together OCR words. Built once per list.
const vocabularyCache = new WeakMap<Beer[], Set<string>>();
function vocabulary(beers: Beer[]): Set<string> {
  let words = vocabularyCache.get(beers);
  if (!words) {
    // Not the articles: two-letter pieces like "il" let "available" split into words.
    words = new Set([...STYLE_WORDS].filter((w) => !ARTICLES.includes(w)));
    for (const beer of beers) {
      for (const w of normalize(`${beer.name} ${beer.brewery}`).split(' ')) if (w.length >= 2) words.add(w);
    }
    vocabularyCache.set(beers, words);
  }
  return words;
}

/**
 * A run-together OCR word as words from our list, in the fewest pieces:
 * "nastroazzurro" → "nastro azzurro", "indiapaleale" → "india pale ale".
 * Some readers drop spaces (WATERec never outputs them). A slash read as an
 * "i" or "l" after a word is dropped: "PEACH/GRAPEFRUIT" reads as
 * "peachigrapefruit" or "peachi grapefruit". Null when the word is already
 * one of ours or can't be split entirely into ours.
 */
function splitIntoWords(word: string, words: Set<string>): string[] | null {
  if (word.length < 6 || words.has(word)) return null;
  const isSlash = (piece: string) => piece === 'i' || piece === 'l';
  // best[end]: the fewest pieces (slashes included, so they cost one) covering word[0, end).
  const best: (string[] | null)[] = [[]];
  for (let end = 1; end <= word.length; end++) {
    best[end] = null;
    for (let start = Math.max(0, end - 30); start <= end - 1; start++) {
      const before = best[start];
      const piece = word.slice(start, end);
      if (!before || !(piece.length >= 2 ? words.has(piece) : start > 0 && isSlash(piece) && !isSlash(before.at(-1)!))) continue;
      if (!best[end] || before.length + 1 < best[end]!.length) best[end] = [...before, piece];
    }
  }
  const pieces = best[word.length];
  return pieces && pieces.length >= 2 ? pieces.filter((piece) => piece.length >= 2) : null;
}

/**
 * The OCR words, plus a version with letter-spaced words rejoined, and one
 * with run-together words split into words from our list, when those differ.
 */
function readings(text: string, words?: Set<string>): string[][] {
  const ocrWords = normalize(text).split(' ').filter(Boolean);
  const result = [ocrWords];
  const joined = joinSpacedLetters(ocrWords);
  if (joined.length !== ocrWords.length) result.push(joined);
  if (words) {
    let changed = false;
    const split = ocrWords.flatMap((w) => {
      const pieces = splitIntoWords(w, words);
      if (pieces) changed = true;
      return pieces ?? [w];
    });
    if (changed) result.push(split);
  }
  return result;
}

function findInReadings(ocrReadings: string[][], needle: string): string | null {
  for (const words of ocrReadings) {
    const found = findWords(words, needle);
    if (found) return found;
  }
  // Rejoining can't tell where one spaced-out word ends and the next starts
  // ("D A U R A  D A M M" → "dauradamm"), so also try the name without spaces, exactly.
  const compact = needle.replace(/ /g, '');
  if (compact !== needle && ocrReadings.some((r) => skeletons(r).includes(skeleton(compact)))) return compact;
  // And the other way round: a one-word name read as two ("BREW DOG" for
  // "BrewDog", "ST0 NE" for "Stone").
  if (compact === needle && needle.length >= 5) {
    const words = ocrReadings[0];
    const target = skeleton(needle);
    for (let i = 0; i + 1 < words.length; i++) {
      if (skeleton(words[i] + words[i + 1]) === target) return `${words[i]} ${words[i + 1]}`;
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
  const ocrReadings = readings(text, vocabulary(beers));
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

  // A longer name from the same brewery that contains a name read, with its
  // extra words printed elsewhere on the label: "Kukko / PILS" with
  // "ALKOHOLITON" further down is Kukko Pils Alkoholiton, not Kukko Pils.
  for (const candidate of [...candidates]) {
    if (candidate.field !== 'name' || candidate.rejected) continue;
    const words = candidate.needle.split(' ');
    for (const beer of beers) {
      if (beer.brewery !== candidate.beer.brewery || beer.id === candidate.beer.id) continue;
      const longer = normalize(beer.name).split(' ');
      if (longer.length <= words.length || !words.every((w) => longer.includes(w))) continue;
      const extra = longer.filter((w) => !words.includes(w));
      const found = extra.map((w) => findInReadings(ocrReadings, w));
      if (!found.every(Boolean)) continue;
      candidates.push({ beer, field: 'name', needle: longer.join(' '), found: `${candidate.found} … ${found.join(' ')}` });
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

  // Every word of a name read, in any order: labels stack words, and some
  // readers list lines bottom to top ("GLUTENFREE / SinGluten / Galicia /
  // Estrella"). Only for names with two or more words that aren't style
  // words, which then stand in for the brewery, or with one once the beer's
  // own brewery was read ("LAITILAN / Kukko / nooce / PILS / ALKOHOLITON");
  // gluten-free words still have to be there. A fit whose words another fit contains gives way to it
  // ("Daura" to "Daura Damm"); fits left over that aren't the same beer are
  // ambiguous. Only a fallback: a name read in order wins ("Estrella Damm /
  // Daura IPA" is Daura IPA, though "Damm" and "Daura" are both there).
  const nameReadInOrder = candidates.some((c) => c.field === 'name' && !c.rejected);
  const anyOrder = beers.flatMap((beer) => {
    if (nameReadInOrder) return [];
    const words = normalize(beer.name).split(' ');
    const needed = breweriesSeen.has(beer.brewery) ? 1 : 2;
    if (words.length < 2 || words.filter((w) => !STYLE_WORDS.has(w)).length < needed) return [];
    const found = words.map((w) => findInReadings(ocrReadings, w));
    return found.every(Boolean) ? [{ beer, words, found: found.join(' ') }] : [];
  });
  const fullest = anyOrder.filter(
    (fit) => !anyOrder.some((other) => other !== fit && other.words.length > fit.words.length && fit.words.every((w) => other.words.includes(w))),
  );
  for (const fit of fullest) {
    candidates.push({
      beer: fit.beer,
      field: 'name',
      needle: fit.words.join(' '),
      found: fit.found,
      rejected: fullest.length > 1 ? 'several beers fit the words read' : undefined,
    });
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

  // A label naming a beer that contains gluten is that beer.
  const lookalike = GLUTEN_LOOKALIKES.find((name) => findInReadings(ocrReadings, name));
  for (const candidate of candidates) {
    if (lookalike && candidate.field === 'name' && !candidate.rejected) {
      candidate.rejected = `the label names "${lookalike}", which contains gluten`;
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
  const textReadings = texts.map((t) => readings(t));
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

/**
 * Every beer found in a menu's OCR text, including the ones the matcher
 * discards. A menu lists many beers, so unlike a label it can match several,
 * and other breweries on it don't count against a name. Three ways a beer
 * is found:
 *
 * - Its whole name, as whole words ("AVA" must not match inside
 *   "AVAILABLE"). A name of only style words ("IPA") needs its brewery
 *   within two lines.
 * - Its brewery and the rest of its name on one line, where menus print an
 *   entry: "Brewdog Vagabond" is Vagabond Pale Ale. Style words may be left
 *   out, but not gluten-free claims ("Brewdog Punk IPA" is not Gluten-Free
 *   Punk IPA), nor a style the line names ("BrewDog Vagabond Red" isn't
 *   Vagabond Pale Ale). Names read in full come first, the fullest winning
 *   ("Kukko Pils Alkoholiton" over "Kukko Pils"); otherwise the line must
 *   fit only one of the brewery's beers.
 * - A short name from MENU_SHORT_NAMES ("Peroni Gluten Free").
 *
 * A brewery with a gluten-free claim alone isn't enough: "Omnipollo Gluten
 * Free, Pilsner" doesn't name Stellaris, Omnipollo's gluten-free pilsner in
 * our list, and might be another beer.
 */
export function findMenuCandidates(text: string, beers: Beer[]): MatchCandidate[] {
  const words = vocabulary(beers);
  if (!normalize(text)) return [];
  // A name may run onto the next line within a block of text, where a menu
  // wraps it ("Peroni Nastro Azzurro / Gluten Free"), but not into the next
  // block, such as a "GLUTEN FREE" heading under a regular beer. Readers
  // separate blocks with a blank line.
  const blockReadings = text.split(/\n\s*\n/).map((block) => readings(block, words));
  const rawLines = text.split('\n').filter((line) => line.trim());
  const lines = rawLines.map(normalize);
  const lineReadings = rawLines.map((line) => readings(line, words));
  const has = (reading: string[][], word: string) => reading.some((r) => r.includes(word));

  const breweryTokens = [...new Set(beers.map((b) => breweryToken(b.brewery)).filter(Boolean))];
  const candidates: MatchCandidate[] = [];
  const found = new Set<number>();
  const add = (candidate: MatchCandidate) => {
    candidates.push(candidate);
    if (!candidate.rejected) found.add(candidate.beer.id);
  };

  for (const beer of beers) {
    const name = normalize(beer.name);
    if (!name) continue;
    const printed = [name, ...(MENU_SHORT_NAMES[beer.name] ?? [])].find((n) =>
      blockReadings.some((block) => block.some((r) => withoutLookalikes(r).includes(` ${n} `))),
    );
    if (!printed) continue;
    if (printed !== name) {
      add({ beer, field: 'name', needle: name, found: printed });
      continue;
    }
    let rejected: string | undefined;
    if (isGenericName(name)) {
      const token = breweryToken(beer.brewery);
      const otherBrewery = (line: string) => breweryTokens.some((t) => t !== token && ` ${line} `.includes(` ${t} `));
      if (!token || !occursNear(lines, name, token, 2, otherBrewery)) {
        rejected = `generic name without brewery "${token}" nearby`;
      }
    }
    add({ beer, field: 'name', needle: name, found: name, rejected });
  }

  const byBrewery = new Map<string, Beer[]>();
  for (const beer of beers) byBrewery.set(beer.brewery, [...(byBrewery.get(beer.brewery) ?? []), beer]);

  lineReadings.forEach((reading, i) => {
    for (const [brewery, breweryBeers] of byBrewery) {
      const key = breweryKeys(brewery).find((k) => k.split(' ').every((w) => has(reading, w)));
      if (!key) continue;
      const breweryWords = new Set(normalize(brewery).split(' '));
      // The words of each beer's name that aren't its brewery's.
      const own = (beer: Beer) => normalize(beer.name).split(' ').filter((w) => w && !breweryWords.has(w));
      // A style the line names that a beer's name doesn't rules it out: "BrewDog Vagabond Red" isn't Vagabond Pale Ale.
      const lineStyles = (reading[reading.length - 1] ?? []).filter(
        (w) => STYLE_WORDS.has(w) && !GLUTEN_CLAIM_WORDS.has(w) && !NEUTRAL_WORDS.has(w) && !breweryWords.has(w),
      );
      const styleFits = (beer: Beer) => lineStyles.every((w) => own(beer).includes(w));

      // Brewery + the rest of the name.
      const fits = breweryBeers.filter((beer) => {
        const rest = own(beer);
        const needed = distinctiveWords(rest.join(' '));
        return needed.some((w) => !STYLE_WORDS.has(w)) && needed.every((w) => has(reading, w)) && styleFits(beer);
      });
      // Beers with every word of their name on the line come first ("Daura
      // Damm" isn't Daura IPA with "IPA" left out), the fullest of them
      // ("Kukko Pils Alkoholiton" over "Kukko Pils"); otherwise a name with
      // style words left out must fit only one of the brewery's beers.
      const complete = fits.filter((beer) => own(beer).every((w) => has(reading, w)));
      const chosen = complete.length
        ? complete.filter((fit) => !complete.some((other) => other !== fit && own(fit).every((w) => own(other).includes(w))))
        : fits;
      for (const beer of chosen) {
        if (found.has(beer.id)) continue;
        add({
          beer,
          field: 'name',
          needle: `${key} … ${distinctiveWords(own(beer).join(' ')).join(' ')}`,
          found: lines[i],
          rejected: !complete.length && fits.length > 1 ? `several ${brewery} beers fit the line` : undefined,
        });
      }
    }
  });
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
