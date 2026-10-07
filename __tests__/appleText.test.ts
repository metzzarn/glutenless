jest.mock('../modules/apple-text', () => ({
  isAppleTextAvailable: true,
  recognizeAsync: jest.fn(),
}));
jest.mock('@react-native-ml-kit/text-recognition', () => ({ __esModule: true, default: { recognize: jest.fn() } }));

import TextRecognition from '@react-native-ml-kit/text-recognition';
import type { Beer } from '../lib/db';
import { recognizeText, scanPhoto } from '../lib/ocr';
import { recognizeAsync } from '../modules/apple-text';

const line = (text: string, left: number, top: number, width: number, height: number) => ({
  text,
  confidence: 0.9,
  frame: { left, top, width, height },
});

describe('text recognition on iOS (Apple Vision)', () => {
  beforeEach(() => {
    jest.mocked(recognizeAsync).mockResolvedValue([line('STONE', 100, 200, 300, 80), line('Delicious IPA', 90, 300, 320, 90)]);
  });

  it('groups Vision lines into ML Kit-style blocks, with their boxes', async () => {
    const result = await recognizeText('file://can.jpg');
    expect(TextRecognition.recognize).not.toHaveBeenCalled();
    expect(result.text).toBe('STONE\nDelicious IPA');
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].frame).toEqual({ left: 90, top: 200, width: 320, height: 190 });
    expect(result.blocks[0].lines.map((l) => [l.text, l.frame])).toEqual([
      ['STONE', { left: 100, top: 200, width: 300, height: 80 }],
      ['Delicious IPA', { left: 90, top: 300, width: 320, height: 90 }],
    ]);
  });

  it('reads a menu name wrapped onto two lines, with the price column in between', async () => {
    // Vision lists the lines column by column, as on a real pub menu.
    jest.mocked(recognizeAsync).mockResolvedValue([
      line('Bottles', 100, 100, 200, 40),
      line('Greene King IPA', 100, 200, 400, 40),
      line('Gluten Free', 100, 250, 260, 40),
      line('Abbot Ale', 100, 350, 220, 40),
      line('5.00', 800, 200, 90, 40),
      line('5.20', 800, 350, 90, 40),
    ]);
    const gluten = { id: 1, name: 'Greene King IPA Gluten Free', brewery: 'Greene King' } as Beer;
    const scan = await scanPhoto('file://menu.jpg', 'menu', [gluten]);
    expect(scan.text).toBe('Bottles\n\nGreene King IPA\nGluten Free\n\n5.00\n\nAbbot Ale\n\n5.20');
    expect(scan.matches).toEqual([gluten]);
  });

  it('matches what Vision read', async () => {
    const delicious = { id: 1, name: 'Delicious IPA', brewery: 'Stone Brewing' } as Beer;
    const scan = await scanPhoto('file://can.jpg', 'can', [delicious]);
    expect(scan.matches).toEqual([delicious]);
  });
});
