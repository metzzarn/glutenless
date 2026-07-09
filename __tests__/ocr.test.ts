import { extractFullText } from '../lib/ocr';
import type { TextRecognitionResult } from '@react-native-ml-kit/text-recognition';

function block(text: string) {
  return { text, lines: [], recognizedLanguages: [] } as unknown as TextRecognitionResult['blocks'][number];
}

describe('extractFullText', () => {
  it('joins every block, not just the first', () => {
    const result = {
      text: 'Shrouded Summit IPA', // simulates a native `.text` that dropped later blocks
      blocks: [block('Shrouded Summit IPA'), block('Glutenberg Blonde'), block('New Planet Pale Ale')],
    } as TextRecognitionResult;

    expect(extractFullText(result)).toBe(
      'Shrouded Summit IPA\nGlutenberg Blonde\nNew Planet Pale Ale'
    );
  });

  it('falls back to result.text when there are no blocks', () => {
    const result = { text: 'Just some text', blocks: [] } as TextRecognitionResult;
    expect(extractFullText(result)).toBe('Just some text');
  });
});
