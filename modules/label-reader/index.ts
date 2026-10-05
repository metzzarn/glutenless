import { requireOptionalNativeModule } from 'expo';

/** Whether Gemini Nano can run here; 'unavailable' on iOS and on phones without Android AICore. */
export type LabelReaderStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable';

/** Which model and request setup to use. Defaults: the system's stable model, 1536 px, no thinking. */
export type ReadOptions = {
  /** Longest side, in pixels, of the photo sent to the model. */
  maxSide?: number;
  /** 'full' favors accuracy over speed. */
  preference?: 'fast' | 'full';
  /** The newest model in preview instead of the stable one. */
  preview?: boolean;
  thinking?: boolean;
  systemInstruction?: string;
};

type NativeLabelReader = {
  getStatusAsync(options?: ReadOptions): Promise<LabelReaderStatus>;
  downloadAsync(options?: ReadOptions): Promise<LabelReaderStatus>;
  readLabelAsync(uri: string, prompt: string, options: ReadOptions): Promise<string>;
};

// Android only for now; null on iOS, where Apple's on-device model will need its own module.
const native = requireOptionalNativeModule<NativeLabelReader>('LabelReader');

export function getStatusAsync(options?: ReadOptions): Promise<LabelReaderStatus> {
  return native ? native.getStatusAsync(options) : Promise.resolve('unavailable');
}

/** Downloads the model for `options` if the phone supports it but doesn't have it yet. Resolves once done. */
export function downloadAsync(options?: ReadOptions): Promise<LabelReaderStatus> {
  return native ? native.downloadAsync(options) : Promise.resolve('unavailable');
}

/** Asks the on-device model to answer `prompt` about the photo at `uri` (a file:// URI). */
export function readLabelAsync(uri: string, prompt: string, options: ReadOptions = {}): Promise<string> {
  if (!native) return Promise.reject(new Error('On-device label reading is not available on this device'));
  return native.readLabelAsync(uri, prompt, options);
}
