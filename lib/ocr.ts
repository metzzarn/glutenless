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
 * grouped into ML Kit blocks (`inBlocks`), so everything after this handles
 * both alike, and a menu name wrapped onto two lines reads as one.
 */
export async function recognizeText(uri: string): Promise<TextRecognitionResult> {
  if (AppleText.isAppleTextAvailable) {
    const lines = await AppleText.recognizeAsync(uri);
    return {
      text: lines.map((l) => l.text).join('\n'),
      blocks: inBlocks(lines).map((block) => {
        const left = Math.min(...block.map((l) => l.frame.left));
        const top = Math.min(...block.map((l) => l.frame.top));
        return {
          text: block.map((l) => l.text).join('\n'),
          frame: {
            left,
            top,
            width: Math.max(...block.map((l) => l.frame.left + l.frame.width)) - left,
            height: Math.max(...block.map((l) => l.frame.top + l.frame.height)) - top,
          },
          lines: block.map((l) => ({ text: l.text, frame: l.frame, elements: [], recognizedLanguages: [] })),
          recognizedLanguages: [],
        };
      }),
    };
  }
  return TextRecognition.recognize(uri);
}

/**
 * The reader's lines grouped into blocks, as ML Kit gives them: a line
 * directly below another, about as tall and left-aligned with it, continues
 * its block. The reader lists lines top to bottom across a whole menu, so a
 * name wrapped onto two lines ("Peroni Nastro Azzurro / Gluten Free") had
 * the next column's price between its halves.
 *
 * Positions are compared with the photo turned upright: on a tilted photo
 * the upright box around a slanted line is two or three times as tall as
 * its text, and boxes of consecutive lines overlap. A line's `corners` (its
 * rotated rectangle) give its true slant and height; without them, `frame`.
 */
export function inBlocks<T extends Pick<OcrLine, 'frame'> & { corners?: [number, number][] }>(lines: T[]): T[][] {
  const quad = (l: T): [number, number][] => {
    const { left, top, width, height } = l.frame;
    return l.corners ?? [[left, top], [left + width, top], [left + width, top + height], [left, top + height]];
  };
  // The page's slant: the median angle of the lines' long sides.
  const angles = lines.map((l) => {
    const [a, b, c] = quad(l);
    const [p, q] = Math.hypot(b[0] - a[0], b[1] - a[1]) >= Math.hypot(c[0] - b[0], c[1] - b[1]) ? [a, b] : [b, c];
    let angle = Math.atan2(q[1] - p[1], q[0] - p[0]);
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle <= -Math.PI / 2) angle += Math.PI;
    return angle;
  });
  const slant = [...angles].sort((x, y) => x - y)[Math.floor(angles.length / 2)] ?? 0;
  const cos = Math.cos(-slant), sin = Math.sin(-slant);
  const upright = lines.map((line) => {
    const pts = quad(line).map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
    const left = Math.min(...pts.map((p) => p[0]));
    const top = Math.min(...pts.map((p) => p[1]));
    return { line, left, top, height: Math.max(...pts.map((p) => p[1])) - top };
  });

  const blocks: (typeof upright)[] = [];
  for (const box of upright.sort((a, b) => a.top - b.top)) {
    const block = blocks.find((b) => {
      const last = b[b.length - 1];
      const gap = box.top - (last.top + last.height);
      const tall = Math.max(box.height, last.height);
      return (
        gap > -0.3 * tall &&
        gap < 0.8 * tall &&
        Math.abs(box.left - last.left) < 1.5 * tall &&
        tall < 1.6 * Math.min(box.height, last.height)
      );
    });
    if (block) block.push(box);
    else blocks.push([box]);
  }
  return blocks.map((block) => block.map((box) => box.line));
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
