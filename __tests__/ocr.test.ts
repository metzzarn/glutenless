jest.mock('@react-native-ml-kit/text-recognition', () => ({
  __esModule: true,
  default: { recognize: jest.fn() },
}));

import TextRecognition from '@react-native-ml-kit/text-recognition';
import type { Beer } from '../lib/db';
import { extractFullText, scanPhoto } from '../lib/ocr';
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
    const scan = await scanPhoto('file://can.jpg', 'can', beers);
    expect(scan.matches).toEqual([beers[0]]);
    expect(scan.text).toBe('DAURA DAMM\nPale lager 5.4%');
    expect(TextRecognition.recognize).toHaveBeenCalledWith('file://can.jpg');
  });

  it('returns no beer for a label it does not know, so the app can warn', async () => {
    recognizes('Some Barley Lager');
    expect((await scanPhoto('file://can.jpg', 'can', beers)).matches).toEqual([]);
  });

  it('keeps every candidate, including rejected ones, for the debug screen', async () => {
    const stout = beer(3, 'Stout', 'Glutenberg');
    recognizes('Guinness', 'Draught Stout');
    const scan = await scanPhoto('file://can.jpg', 'can', [stout]);
    expect(scan.matches).toEqual([]);
    expect(scan.candidates).toEqual([
      { beer: stout, field: 'name', needle: 'stout', found: 'stout', rejected: 'generic name without brewery "glutenberg"' },
    ]);
  });

  it('finds every known beer on a menu', async () => {
    recognizes('Grapefruit IPA', 'Ghostfish', 'House Pils', 'Daura Damm');
    expect((await scanPhoto('file://menu.jpg', 'menu', beers)).matches).toEqual(beers);
  });
});
