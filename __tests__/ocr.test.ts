jest.mock('@react-native-ml-kit/text-recognition', () => ({
  __esModule: true,
  default: { recognize: jest.fn() },
}));

import TextRecognition from '@react-native-ml-kit/text-recognition';
import type { Beer } from '../lib/db';
import { analyzeCanPhoto, analyzeMenuPhoto, extractFullText } from '../lib/ocr';
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

describe('analyzing photos', () => {
  const beer = (id: number, name: string, brewery: string) => ({ id, name, brewery }) as Beer;
  const beers = [beer(1, 'Daura Damm', 'Damm'), beer(2, 'Grapefruit IPA', 'Ghostfish Brewing')];
  const recognizes = (...lines: string[]) =>
    jest.mocked(TextRecognition.recognize).mockResolvedValue({
      text: lines.join('\n'),
      blocks: lines.map(block),
    } as TextRecognitionResult);

  it('matches a can or bottle by the text on its label', async () => {
    recognizes('DAURA DAMM', 'Pale lager 5.4%');
    expect(await analyzeCanPhoto('file://can.jpg', beers)).toBe(beers[0]);
    expect(TextRecognition.recognize).toHaveBeenCalledWith('file://can.jpg');
  });

  it('returns no beer for a label it does not know, so the app can warn', async () => {
    recognizes('Some Barley Lager');
    expect(await analyzeCanPhoto('file://can.jpg', beers)).toBeNull();
  });

  it('finds every known beer on a menu', async () => {
    recognizes('Grapefruit IPA', 'Ghostfish', 'House Pils', 'Daura Damm');
    expect(await analyzeMenuPhoto('file://menu.jpg', beers)).toEqual(beers);
  });
});
