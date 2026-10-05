jest.mock('../modules/apple-text', () => ({
  isAppleTextAvailable: true,
  recognizeAsync: jest.fn(async () => [
    { text: 'STONE', confidence: 0.9, frame: { left: 100, top: 200, width: 300, height: 80 } },
    { text: 'Delicious IPA', confidence: 0.6, frame: { left: 90, top: 300, width: 320, height: 90 } },
  ]),
}));
jest.mock('@react-native-ml-kit/text-recognition', () => ({ __esModule: true, default: { recognize: jest.fn() } }));

import TextRecognition from '@react-native-ml-kit/text-recognition';
import type { Beer } from '../lib/db';
import { recognizeText, scanPhoto } from '../lib/ocr';

describe('text recognition on iOS (Apple Vision)', () => {
  it('returns Vision lines as ML Kit-style blocks, with their boxes', async () => {
    const result = await recognizeText('file://can.jpg');
    expect(TextRecognition.recognize).not.toHaveBeenCalled();
    expect(result.text).toBe('STONE\nDelicious IPA');
    expect(result.blocks[0].frame).toEqual({ left: 100, top: 200, width: 300, height: 80 });
    expect(result.blocks[1].lines[0].text).toBe('Delicious IPA');
  });

  it('matches what Vision read', async () => {
    const delicious = { id: 1, name: 'Delicious IPA', brewery: 'Stone Brewing' } as Beer;
    const scan = await scanPhoto('file://can.jpg', 'can', [delicious]);
    expect(scan.matches).toEqual([delicious]);
  });
});
