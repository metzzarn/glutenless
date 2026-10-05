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

/** What read the text: the on-device models on Android, otherwise the platform's text recognition. */
export type Reader = 'PP-OCRv6 + WATERec' | 'PP-OCRv6' | 'ML Kit' | 'Apple Vision';

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
 * block, which silently drops beers further down a photographed menu. Blocks
 * are separated by a blank line, so the menu matcher doesn't run a name from
 * one block into the next.
 */
export function extractFullText(result: TextRecognitionResult): string {
  if (result.blocks?.length) {
    return result.blocks.map((block) => block.text).join('\n\n');
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
 * The reader's lines in block order, as ML Kit gives them: a line directly
 * below another, about as tall and left-aligned with it, continues its
 * block. The reader lists lines top to bottom across a whole menu, so a name
 * wrapped onto two lines ("Peroni Nastro Azzurro / Gluten Free") had the
 * next column's price between its halves.
 */
export function inBlocks<T extends Pick<OcrLine, 'frame'>>(lines: T[]): T[][] {
  const blocks: T[][] = [];
  const byTop = [...lines].sort((a, b) => a.frame.top - b.frame.top);
  for (const line of byTop) {
    const { left, top, height } = line.frame;
    const block = blocks.find((b) => {
      const last = b[b.length - 1].frame;
      const gap = top - (last.top + last.height);
      return (
        gap > -0.3 * height &&
        gap < 0.8 * Math.max(height, last.height) &&
        Math.abs(left - last.left) < 1.5 * Math.max(height, last.height) &&
        Math.max(height, last.height) < 1.6 * Math.min(height, last.height)
      );
    });
    if (block) block.push(line);
    else blocks.push([line]);
  }
  return blocks;
}

/** An on-device reader's line as an ML Kit block, so the rest of the app handles both alike. */
function lineBlock(l: Pick<OcrLine, 'text' | 'frame'>): TextBlock {
  return {
    text: l.text,
    frame: l.frame,
    lines: [{ text: l.text, frame: l.frame, elements: [], recognizedLanguages: [] }],
    recognizedLanguages: [],
  };
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
    blocks: lines.map(lineBlock),
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
 * Photos are read with the on-device models where they're bundled
 * (Android), falling back to the platform's text recognition if they fail.
 * A menu's text is found at 1600 px rather than a label's 960, for its small
 * print, and without WATERec, whose guesses would be matched as menu entries.
 * On 9 real menus it found 10 of 10 listed beers, against ML Kit's 9.
 */
export async function scanPhoto(
  photoUri: string,
  mode: ScanMode,
  beers: Beer[],
  { platformOnly = false } = {},
): Promise<PhotoScan> {
  if (isOcrModelsAvailable && !platformOnly) {
    try {
      if (mode === 'can') {
        const { lines, timings } = await readAsync(photoUri);
        return { reader: 'PP-OCRv6 + WATERec', ...matchCanLines(lines, beers), ocrLines: lines, timings };
      }
      const { lines: read, timings } = await readAsync(photoUri, { maxWaterecLines: 0, detectMaxSide: 1600 });
      const blocks = inBlocks(read);
      const lines = blocks.flat();
      const text = blocks.map((block) => block.map((l) => l.text).join('\n')).join('\n\n');
      return {
        reader: 'PP-OCRv6',
        matches: matchBeersInMenuText(text, beers),
        confirm: null,
        blocks: lines.map(lineBlock),
        text,
        candidates: findMenuCandidates(text, beers),
        suggestions: [],
        ocrLines: lines,
        timings,
      };
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
