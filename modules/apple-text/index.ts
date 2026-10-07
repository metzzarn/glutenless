import { requireOptionalNativeModule } from 'expo';

export type AppleTextLine = {
  text: string;
  confidence: number;
  /** In the photo's pixels, top-left origin. */
  frame: { left: number; top: number; width: number; height: number };
  /** The line's rotated rectangle, its corners clockwise from the top left: its true slant and height. */
  corners: [number, number][];
};

type NativeAppleText = {
  recognizeAsync(uri: string): Promise<AppleTextLine[]>;
  listImages(dir: string): string[];
};

// iOS only; null on Android, which uses ML Kit.
const native = requireOptionalNativeModule<NativeAppleText>('AppleText');

export const isAppleTextAvailable = native !== null;

/** Recognizes the text in the photo at `uri` (a file:// URI), one entry per line. */
export function recognizeAsync(uri: string): Promise<AppleTextLine[]> {
  if (!native) return Promise.reject(new Error('Apple text recognition is only available on iOS'));
  return native.recognizeAsync(uri);
}

/** Debug: the photos in a folder of the app's Documents dir, as file:// URIs (iOS; empty elsewhere). */
export function listImages(dir: 'images' | 'menus' = 'images'): string[] {
  return native?.listImages(dir) ?? [];
}
