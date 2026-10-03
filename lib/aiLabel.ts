import * as LabelReader from '../modules/label-reader';
import type { Beer } from './db';
import { findCanCandidates, matchBeerByText, normalizeOcrText, suggestByBrewery, type MatchCandidate } from './match';

export { getStatusAsync as getAiStatus, downloadAsync as downloadAiModel, type LabelReaderStatus } from '../modules/label-reader';

/*
 * Every prompt asks for a transcription, not an identification: the model
 * only reports the text it sees, and our matcher decides which beer that is,
 * with the same safety rules as OCR text. Asked "which beer is this?", a model
 * will confidently name a beer from its general knowledge, even a look-alike
 * that contains gluten.
 */

// Small print is where Nano invented text (an address and year that aren't on
// the can), so this asks only for the large lettering that identifies a beer.
const PROMPT_MAIN =
  'Read the large text on the beer can, bottle or label in this photo: the brewery name, the beer name ' +
  'and the beer style. Copy each exactly as printed, one per line, including stylized or script lettering. ' +
  'Skip small print. If you cannot read a word clearly, leave it out. ' +
  'Do not use what you know about beers or breweries to fill in or correct anything.';

const SYSTEM =
  'You are a text recognition engine. You only transcribe text that is visible in the image. ' +
  'You never add, infer, complete or correct text.';

export type AiVariant = {
  id: string;
  label: string;
  prompt: string;
  options: LabelReader.ReadOptions;
};

/**
 * Setups the scan debug screen compares. Six test photos settled the first
 * round: the "all text" prompt invented small print in 2 of 6 (an address, a
 * wrong ABV), while the large-text prompt invented nothing in 24 readings and
 * was twice as fast. The full model and thinking mode gave word-for-word the
 * same output as the default, so they were dropped. Two photo sizes remain:
 * a scan only accepts a beer both readings match on their own.
 */
export const AI_VARIANTS: AiVariant[] = [
  { id: 'main', label: 'Large text, 1536 px photo', prompt: PROMPT_MAIN, options: { systemInstruction: SYSTEM } },
  { id: 'main-1024', label: 'Large text, 1024 px photo', prompt: PROMPT_MAIN, options: { systemInstruction: SYSTEM, maxSide: 1024 } },
];

export type AiLabelReading = {
  text: string;
  durationMs: number;
  matches: Beer[];
  candidates: MatchCandidate[];
  suggestions: Beer[];
};

/** Runs the matcher on text the model read, the same way as on OCR text. */
export function matchAiText(text: string, beers: Beer[], durationMs = 0): AiLabelReading {
  const match = matchBeerByText(text, beers);
  const candidates = findCanCandidates(text, beers);
  return {
    text,
    durationMs,
    matches: match ? [match] : [],
    candidates,
    suggestions: match ? [] : suggestByBrewery(candidates, beers),
  };
}

/** Reads a can or bottle photo with the on-device model and matches the text it read. */
export async function readLabelWithAi(photoUri: string, beers: Beer[], variant: AiVariant): Promise<AiLabelReading> {
  const started = Date.now();
  const text = await LabelReader.readLabelAsync(photoUri, variant.prompt, variant.options);
  return matchAiText(text, beers, Date.now() - started);
}

/**
 * The words most of several readings agree on, in the first reading's order.
 * Text the model invents tends to change between differently-set-up readings
 * of the same photo, while text that's really printed stays the same, so
 * agreement filters out much of the invention. Needs at least two readings.
 */
export function agreedText(texts: string[]): string {
  if (texts.length < 2) return '';
  const need = Math.max(2, Math.ceil(texts.length / 2));
  const wordSets = texts.map((t) => new Set(normalizeOcrText(t).split(' ').filter(Boolean)));
  const agreed = (word: string) => wordSets.filter((words) => words.has(word)).length >= need;
  return texts[0]
    .split('\n')
    .map((line) => normalizeOcrText(line).split(' ').filter((w) => w && agreed(w)).join(' '))
    .filter(Boolean)
    .join('\n');
}

/** What the on-device model concluded about a can or bottle, from all its readings. */
export type AiIdentification = {
  /** A beer every reading matched on its own. For the person to confirm, never shown as certain. */
  match: Beer | null;
  /** Otherwise, beers from a brewery the readings agree on. */
  suggestions: Beer[];
  /** Every reading's text, so the camera can show which words of a suggestion went unseen. */
  texts: string[];
};

/**
 * Combines readings of the same photo. A beer counts only when every reading
 * matched it independently: one setup's invented or misread text then can't
 * produce a match alone.
 */
export function combineAiReadings(aiReadings: AiLabelReading[], beers: Beer[]): AiIdentification {
  const texts = aiReadings.map((r) => r.text);
  const first = aiReadings[0]?.matches[0];
  if (first && aiReadings.length >= 2 && aiReadings.every((r) => r.matches[0]?.id === first.id)) {
    return { match: first, suggestions: [], texts };
  }
  return { match: null, suggestions: matchAiText(agreedText(texts), beers).suggestions, texts };
}

/**
 * Reads a can or bottle with every large-text setup and combines them. Null
 * when the phone has no on-device model ready or reading fails, so the camera
 * falls back to the OCR result.
 */
export async function identifyWithAi(photoUri: string, beers: Beer[]): Promise<AiIdentification | null> {
  try {
    if ((await LabelReader.getStatusAsync()) !== 'available') return null;
    const aiReadings: AiLabelReading[] = [];
    for (const variant of AI_VARIANTS) aiReadings.push(await readLabelWithAi(photoUri, beers, variant));
    return combineAiReadings(aiReadings, beers);
  } catch {
    return null;
  }
}
