jest.mock('@react-native-ml-kit/text-recognition', () => ({
  __esModule: true,
  default: { recognize: jest.fn() },
}));
jest.mock('../modules/ocr-models', () => ({
  isOcrModelsAvailable: true,
  readAsync: jest.fn(),
}));

import TextRecognition from '@react-native-ml-kit/text-recognition';
import type { Beer } from '../lib/db';
import { scanPhoto } from '../lib/ocr';
import { readAsync, type OcrLine } from '../modules/ocr-models';

const beer = (id: number, name: string, brewery: string) => ({ id, name, brewery }) as Beer;
const beers = [beer(1, 'Vagabond Pale Ale', 'BrewDog'), beer(2, 'Gluten-Free Punk IPA', 'BrewDog'), beer(3, 'Daura Damm', 'Damm')];
const frame = { left: 0, top: 0, width: 10, height: 10 };
const line = (text: string, waterecText: string | null = null): OcrLine => ({
  text,
  score: waterecText ? 0.5 : 0.99,
  frame,
  waterecText,
  waterecScore: waterecText ? 0.9 : null,
});
const reads = (...lines: OcrLine[]) => jest.mocked(readAsync).mockResolvedValue({ lines, timings: { detect: 1 } });

beforeEach(() => jest.clearAllMocks());

describe('scanning a can with the on-device reader', () => {
  it('matches on PP-OCRv6 text alone, without ML Kit', async () => {
    reads(line('DAURA'), line('DAMM'));
    const scan = await scanPhoto('file://can.jpg', 'can', beers);
    expect(scan.reader).toBe('PP-OCRv6 + WATERec');
    expect(scan.matches).toEqual([beers[2]]);
    expect(scan.confirm).toBeNull();
    expect(scan.blocks).toHaveLength(2);
    expect(TextRecognition.recognize).not.toHaveBeenCalled();
  });

  it('only asks to confirm a beer that needed WATERec, since it can invent text', async () => {
    reads(line('ONONVOVA', 'VAGABOND'), line('BREWDOG'));
    const scan = await scanPhoto('file://can.jpg', 'can', beers);
    expect(scan.matches).toEqual([]);
    expect(scan.confirm).toEqual(beers[0]);
    expect(scan.text).toBe('ONONVOVA\nBREWDOG\nVAGABOND');
  });

  it('suggests the brewery’s beers when WATERec read only the brewery', async () => {
    reads(line('ONONVOVA'), line('BREMDOG', 'BREWDOG'));
    const scan = await scanPhoto('file://can.jpg', 'can', beers);
    expect(scan.matches).toEqual([]);
    expect(scan.confirm).toBeNull();
    expect(scan.suggestions).toEqual(expect.arrayContaining([beers[0], beers[1]]));
  });

  it('falls back to ML Kit when the reader fails', async () => {
    jest.mocked(readAsync).mockRejectedValue(new Error('decode failed'));
    jest.mocked(TextRecognition.recognize).mockResolvedValue({ text: 'DAURA DAMM', blocks: [] });
    const scan = await scanPhoto('file://can.jpg', 'can', beers);
    expect(scan.reader).toBe('ML Kit');
    expect(scan.matches).toEqual([beers[2]]);
  });

  it('reads menus with ML Kit, whose full resolution suits small print', async () => {
    jest.mocked(TextRecognition.recognize).mockResolvedValue({ text: 'Daura Damm', blocks: [] });
    const scan = await scanPhoto('file://menu.jpg', 'menu', beers);
    expect(scan.reader).toBe('ML Kit');
    expect(readAsync).not.toHaveBeenCalled();
  });
});
