import TextRecognition, {
  type TextRecognitionResult,
} from '@react-native-ml-kit/text-recognition';
import BarcodeScanning from '@react-native-ml-kit/barcode-scanning';
import type { Beer } from './db';
import { matchBeerByBarcode, matchBeerByText, matchBeersInMenuText } from './match';

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

/** Photo of a single can/bottle: try a barcode first, fall back to label text. */
export async function analyzeCanPhoto(photoUri: string, beers: Beer[]): Promise<Beer | null> {
  const barcodes = await BarcodeScanning.scan(photoUri);
  const rawValue = barcodes.find((b) => !!b.value)?.value;
  if (rawValue) {
    const byBarcode = matchBeerByBarcode(rawValue, beers);
    if (byBarcode) return byBarcode;
  }

  const result = await TextRecognition.recognize(photoUri);
  return matchBeerByText(extractFullText(result), beers);
}

/** Photo of a menu: recognize all text and return every local beer mentioned. */
export async function analyzeMenuPhoto(photoUri: string, beers: Beer[]): Promise<Beer[]> {
  const result = await TextRecognition.recognize(photoUri);
  return matchBeersInMenuText(extractFullText(result), beers);
}
