import TextRecognition, {
  type TextBlock,
  type TextRecognitionResult,
} from '@react-native-ml-kit/text-recognition';
import * as AppleText from '../modules/apple-text';
import type { Beer } from './db';
import {
  findCanCandidates,
  findMenuCandidates,
  matchBeerByText,
  matchBeersInMenuText,
  suggestByBrewery,
  type MatchCandidate,
} from './match';

export type ScanMode = 'can' | 'menu';

/** What a photo scan found, kept whole so the scan debug screen can show how it got there. */
export type PhotoScan = {
  /** At most one beer for a can, any number for a menu. */
  matches: Beer[];
  /** ML Kit's blocks, with their positions in the photo. */
  blocks: TextBlock[];
  /** The full recognized text the matchers searched. */
  text: string;
  /** Every name/brewery hit, including the ones the matcher discarded. */
  candidates: MatchCandidate[];
  /** For a can with no match: our beers from a brewery that was read, for the person to pick from. */
  suggestions: Beer[];
};

/**
 * Build the full recognized text ourselves from `result.blocks` rather than
 * trusting the native module's own top-level `result.text` aggregation —
 * on some devices/photos that field hasn't reliably included every detected
 * block, which silently drops beers further down a photographed menu.
 */
export function extractFullText(result: TextRecognitionResult): string {
  if (result.blocks?.length) {
    return result.blocks.map((block) => block.text).join('\n');
  }
  return result.text;
}

/**
 * Reads the text in an image: with Apple's Vision framework on iOS, which is
 * stronger there than ML Kit, otherwise with ML Kit. Vision's lines are
 * returned as ML Kit blocks (one line each), so everything after this
 * handles both alike.
 */
export async function recognizeText(uri: string): Promise<TextRecognitionResult> {
  if (AppleText.isAppleTextAvailable) {
    const lines = await AppleText.recognizeAsync(uri);
    return {
      text: lines.map((l) => l.text).join('\n'),
      blocks: lines.map((l) => ({
        text: l.text,
        frame: l.frame,
        lines: [{ text: l.text, frame: l.frame, elements: [], recognizedLanguages: [] }],
        recognizedLanguages: [],
      })),
    };
  }
  return TextRecognition.recognize(uri);
}

/**
 * Recognizes the text in a photo and matches it against our beers: a can or
 * bottle by its label text, a menu by every beer named on it. Barcodes aren't
 * used: the dataset has no barcode numbers, and a guessed match could show a
 * gluten-containing beer as gluten-free.
 */
export async function scanPhoto(photoUri: string, mode: ScanMode, beers: Beer[]): Promise<PhotoScan> {
  const result = await recognizeText(photoUri);
  const text = extractFullText(result);
  const blocks = result.blocks ?? [];
  if (mode === 'menu') {
    return {
      matches: matchBeersInMenuText(text, beers),
      blocks,
      text,
      candidates: findMenuCandidates(text, beers),
      suggestions: [],
    };
  }
  const match = matchBeerByText(text, beers);
  const candidates = findCanCandidates(text, beers);
  return {
    matches: match ? [match] : [],
    blocks,
    text,
    candidates,
    suggestions: match ? [] : suggestByBrewery(candidates, beers),
  };
}
