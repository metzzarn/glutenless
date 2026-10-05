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
import { inBlocks, scanPhoto } from '../lib/ocr';
import { readAsync, type OcrLine } from '../modules/ocr-models';

const beer = (id: number, name: string, brewery: string) => ({ id, name, brewery }) as Beer;
const beers = [beer(1, 'Vagabond Pale Ale', 'BrewDog'), beer(2, 'Gluten-Free Punk IPA', 'BrewDog'), beer(3, 'Daura Damm', 'Damm')];
const frame = { left: 0, top: 0, width: 10, height: 10 };
const line = (text: string, waterecText: string | null = null): OcrLine => ({
  text,
  score: waterecText ? 0.5 : 0.99,
  frame,
  corners: [[0, 0], [10, 0], [10, 10], [0, 10]],
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

  it('reads menus at a higher resolution, without WATERec', async () => {
    reads(line('Brewdog Vagabond'), line('Daura Damm', 'DAURA'));
    const scan = await scanPhoto('file://menu.jpg', 'menu', beers);
    expect(scan.reader).toBe('PP-OCRv6');
    expect(scan.matches).toEqual(expect.arrayContaining([beers[0], beers[2]]));
    expect(scan.matches).toHaveLength(2);
    expect(readAsync).toHaveBeenCalledWith('file://menu.jpg', { maxWaterecLines: 0, detectMaxSide: 1600 });
    expect(TextRecognition.recognize).not.toHaveBeenCalled();
  });

  it('falls back to ML Kit for a menu when the reader fails', async () => {
    jest.mocked(readAsync).mockRejectedValue(new Error('decode failed'));
    jest.mocked(TextRecognition.recognize).mockResolvedValue({ text: 'Daura Damm', blocks: [] });
    const scan = await scanPhoto('file://menu.jpg', 'menu', beers);
    expect(scan.reader).toBe('ML Kit');
    expect(scan.matches).toEqual([beers[2]]);
  });
});

describe('menu lines in block order', () => {
  const at = (text: string, left: number, top: number, width = 300, height = 30) => ({ text, frame: { left, top, width, height } });

  it('keeps a wrapped name together, apart from the prices and the other column', () => {
    // A two-column pub menu, read top to bottom across both columns.
    const lines = [
      at('Guinness', 100, 100), at('5.90', 520, 100, 60), at('Peroni Nastro Azzurro', 700, 100), at('5.20', 1150, 112, 60),
      at('Irish stout 4.2%', 100, 135, 200, 24), at('Gluten Free', 700, 135), at('330ml 5.1%', 700, 170, 200, 24),
    ];
    expect(inBlocks(lines).map((block) => block.map((l) => l.text))).toEqual([
      ['Guinness', 'Irish stout 4.2%'], ['5.90'], ['Peroni Nastro Azzurro', 'Gluten Free', '330ml 5.1%'], ['5.20'],
    ]);
  });

  it('compares lines with a tilted photo turned upright', () => {
    // A menu photographed 6° off: each line's upright box is over twice its
    // text's height, and consecutive boxes overlap.
    const tilt = (6 * Math.PI) / 180;
    const slanted = (text: string, x: number, y: number, width = 600, height = 40) => {
      const pts = [[0, 0], [width, 0], [width, height], [0, height]].map(([u, v]) => [x + u * Math.cos(tilt) - v * Math.sin(tilt), y + u * Math.sin(tilt) + v * Math.cos(tilt)] as [number, number]);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const frame = { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
      return { text, frame, corners: pts };
    };
    const lines = [slanted('Nils Oscar India Ale', 100, 100), slanted('Glutenfri', 95, 150, 250), slanted('33 cl', 90, 200, 120, 30)];
    expect(inBlocks(lines).map((block) => block.map((l) => l.text))).toEqual([['Nils Oscar India Ale', 'Glutenfri', '33 cl']]);
    // Without the corners, the overlapping upright boxes don't group.
    expect(inBlocks(lines.map(({ corners, ...rest }) => rest))).not.toHaveLength(1);
  });

  it('starts a new block after a gap, such as before a heading', () => {
    const lines = [at('Peroni Nastro Azzurro', 100, 100), at('GLUTEN FREE', 100, 200, 300, 40), at('Brewdog Vagabond', 100, 260)];
    expect(inBlocks(lines).map((block) => block.map((l) => l.text))).toEqual([['Peroni Nastro Azzurro'], ['GLUTEN FREE', 'Brewdog Vagabond']]);
  });
});
