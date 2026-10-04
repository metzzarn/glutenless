import { readAsync, type OcrResult } from '../modules/ocr-models';
import { matchAiText, type AiLabelReading } from './aiLabel';
import type { Beer } from './db';

export { isOcrModelsAvailable } from '../modules/ocr-models';

export type OnDeviceReading = { result: OcrResult; reading: AiLabelReading };

/**
 * Reads a can or bottle with PP-OCRv6 and, for lines it was unsure of,
 * WATERec, then matches the text the same way as ML Kit's. WATERec's
 * readings are added as extra lines rather than replacing PP-OCRv6's.
 */
export async function readLabelOnDevice(photoUri: string, beers: Beer[]): Promise<OnDeviceReading> {
  const started = Date.now();
  const result = await readAsync(photoUri);
  const text = [...result.lines.map((l) => l.text), ...result.lines.flatMap((l) => (l.waterecText ? [l.waterecText] : []))].join('\n');
  return { result, reading: matchAiText(text, beers, Date.now() - started) };
}
