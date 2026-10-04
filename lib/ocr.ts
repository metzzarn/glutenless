import TextRecognition, {
  type TextBlock,
  type TextRecognitionResult,
} from '@react-native-ml-kit/text-recognition';
import * as AppleText from '../modules/apple-text';
import { isOcrModelsAvailable, readAsync, type OcrLine } from '../modules/ocr-models';
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

/** What read the text: the on-device models for cans on Android, otherwise the platform's text recognition. */
export type Reader = 'PP-OCRv6 + WATERec' | 'ML Kit' | 'Apple Vision';

/** What a photo scan found, kept whole so the scan debug screen can show how it got there. */
export type PhotoScan = {
  reader: Reader;
  /** At most one beer for a can, any number for a menu. */
  matches: Beer[];
  /**
   * For a can: a beer that matched only once WATERec's readings were added.
   * WATERec can invent text, so it's for the person to confirm, never shown as certain.
   */
  confirm: Beer | null;
  /** The text's blocks, with their positions in the photo (one line each for the on-device reader). */
  blocks: TextBlock[];
  /** The full recognized text the matchers searched, WATERec's readings included. */
  text: string;
  /** Every name/brewery hit, including the ones the matcher discarded. */
  candidates: MatchCandidate[];
  /** For a can with no certain match: our beers from a brewery that was read, for the person to pick from. */
  suggestions: Beer[];
  /** The on-device reader's lines, with WATERec's readings, and its time per stage. */
  ocrLines?: OcrLine[];
  timings?: Record<string, number>;
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
 * Matches a can's text from the on-device reader. PP-OCRv6's lines alone
 * decide a match; a beer that only matches with WATERec's readings added is
 * returned as `confirm`, because WATERec, like a language model, can produce
 * words that aren't printed.
 */
export function matchCanLines(lines: Pick<OcrLine, 'text' | 'waterecText' | 'frame'>[], beers: Beer[]): Omit<PhotoScan, 'reader'> {
  const read = lines.map((l) => l.text);
  const text = [...read, ...lines.flatMap((l) => (l.waterecText ? [l.waterecText] : []))].join('\n');
  const match = matchBeerByText(read.join('\n'), beers);
  const confirm = match ? null : matchBeerByText(text, beers);
  const candidates = findCanCandidates(text, beers);
  return {
    matches: match ? [match] : [],
    confirm,
    blocks: lines.map((l) => ({
      text: l.text,
      frame: l.frame,
      lines: [{ text: l.text, frame: l.frame, elements: [], recognizedLanguages: [] }],
      recognizedLanguages: [],
    })),
    text,
    candidates,
    suggestions: match ? [] : suggestByBrewery(candidates, beers),
  };
}

/**
 * Recognizes the text in a photo and matches it against our beers: a can or
 * bottle by its label text, a menu by every beer named on it. Barcodes aren't
 * used: the dataset has no barcode numbers, and a guessed match could show a
 * gluten-containing beer as gluten-free.
 *
 * Cans are read with the on-device models where they're bundled (Android),
 * falling back to the platform's text recognition if they fail. Menus always
 * use the platform's: the models work on the photo shrunk to 960 px, too
 * small for a menu's print.
 */
export async function scanPhoto(
  photoUri: string,
  mode: ScanMode,
  beers: Beer[],
  { platformOnly = false } = {},
): Promise<PhotoScan> {
  if (mode === 'can' && isOcrModelsAvailable && !platformOnly) {
    try {
      const { lines, timings } = await readAsync(photoUri);
      return { reader: 'PP-OCRv6 + WATERec', ...matchCanLines(lines, beers), ocrLines: lines, timings };
    } catch {
      // Fall through to the platform's text recognition.
    }
  }
  const reader: Reader = AppleText.isAppleTextAvailable ? 'Apple Vision' : 'ML Kit';
  const result = await recognizeText(photoUri);
  const text = extractFullText(result);
  const blocks = result.blocks ?? [];
  if (mode === 'menu') {
    return {
      reader,
      matches: matchBeersInMenuText(text, beers),
      confirm: null,
      blocks,
      text,
      candidates: findMenuCandidates(text, beers),
      suggestions: [],
    };
  }
  const match = matchBeerByText(text, beers);
  const candidates = findCanCandidates(text, beers);
  return {
    reader,
    matches: match ? [match] : [],
    confirm: null,
    blocks,
    text,
    candidates,
    suggestions: match ? [] : suggestByBrewery(candidates, beers),
  };
}
