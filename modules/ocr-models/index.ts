import { requireOptionalNativeModule } from 'expo';

export type OcrLine = {
  /** PP-OCRv6's reading, and its mean character confidence (0–1). */
  text: string;
  score: number;
  /** In the photo's pixels. */
  frame: { left: number; top: number; width: number; height: number };
  /** WATERec's reading of the same crop, for lines PP-OCRv6 was unsure of. */
  waterecText: string | null;
  waterecScore: number | null;
};

export type OcrResult = {
  lines: OcrLine[];
  /** Milliseconds per stage: decode, detect, read, waterec. */
  timings: Record<string, number>;
};

type NativeOcrModels = {
  isReady(): boolean;
  modelDir(): string | null;
  listImages(): string[];
  readAsync(uri: string, waterecBelow: number, maxWaterecLines: number): Promise<OcrResult>;
};

// Android only for now.
const native = requireOptionalNativeModule<NativeOcrModels>('OcrModels');

export function modelDir(): string | null {
  return native?.modelDir() ?? null;
}

/** Whether the on-device reader can run: Android, with its models bundled in the app. */
export const isOcrModelsAvailable = native !== null && native.isReady();

/** Debug: the photos in the app's external files dir (images/), as file:// URIs. */
export function listImages(): string[] {
  return native?.listImages() ?? [];
}

/**
 * Reads a label photo (a file:// URI) with PP-OCRv6; lines it read with a
 * confidence below `waterecBelow` are read again by WATERec (at most
 * `maxWaterecLines`, largest first).
 */
export function readAsync(uri: string, { waterecBelow = 0.9, maxWaterecLines = 4 } = {}): Promise<OcrResult> {
  if (!native) return Promise.reject(new Error('OCR models are only available on Android'));
  return native.readAsync(uri, waterecBelow, maxWaterecLines);
}
