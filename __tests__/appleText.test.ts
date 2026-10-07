jest.mock('../modules/apple-text', () => ({
  isAppleTextAvailable: true,
  recognizeAsync: jest.fn(),
}));
jest.mock('@react-native-ml-kit/text-recognition', () => ({ __esModule: true, default: { recognize: jest.fn() } }));

import TextRecognition from '@react-native-ml-kit/text-recognition';
import beersSeed from '../data/beers.json';
import type { Beer } from '../lib/db';
import { recognizeText, scanPhoto } from '../lib/ocr';
import { recognizeAsync } from '../modules/apple-text';


/** A Vision line with its rotated rectangle, and the upright box around it. */
const tilted = (text: string, corners: [number, number][]) => {
  const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
  const left = Math.min(...xs), top = Math.min(...ys);
  return { text, confidence: 0.9, corners, frame: { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top } };
};

/** A Vision line on a straight photo. */
const line = (text: string, left: number, top: number, width: number, height: number) =>
  tilted(text, [[left, top], [left + width, top], [left + width, top + height], [left, top + height]]);

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

  it('groups the lines of a tilted menu photo by their rotated rectangles', async () => {
    // Vision's reading of "Poppelino Lager Glutenfri + Nils Oscar India Ale
    // Glutenfri - generated 21 pub.jpg" (tools/ocr-bench/images/menus/). The
    // upright boxes of its slanted lines overlap, which kept wrapped names apart.
    jest.mocked(recognizeAsync).mockResolvedValue([
      tilted("Fatöl", [[700, 461], [904, 484], [896, 553], [692, 530]]),
      tilted("40 cl", [[672, 671], [789, 671], [789, 733], [672, 733]]),
      tilted("Mariestads Export", [[691, 586], [1242, 665], [1231, 738], [681, 659]]),
      tilted("Pilsner Urquell", [[669, 782], [1123, 839], [1114, 916], [659, 859]]),
      tilted("40 cl", [[654, 872], [772, 872], [772, 929], [654, 929]]),
      tilted("Poppels Poppelino", [[648, 977], [1180, 1046], [1171, 1122], [638, 1053]]),
      tilted("Lager", [[641, 1068], [820, 1068], [820, 1151], [641, 1151]]),
      tilted("40 cl", [[628, 1151], [741, 1151], [741, 1208], [628, 1208]]),
      tilted("78 kr", [[1391, 689], [1548, 689], [1548, 763], [1391, 763]]),
      tilted("84 kr", [[1374, 880], [1535, 880], [1535, 955], [1374, 955]]),
      tilted("82 kr", [[1356, 1159], [1517, 1159], [1517, 1230], [1356, 1230]]),
      tilted("ÖL", [[1517, 327], [1701, 327], [1701, 467], [1517, 467]]),
      tilted("Flasköl", [[1629, 590], [1907, 630], [1897, 703], [1619, 663]]),
      tilted("Poppels Poppelino", [[1625, 713], [2126, 783], [2116, 857], [1615, 787]]),
      tilted("Lager Glutenfri", [[1614, 789], [2069, 849], [2058, 933], [1602, 873]]),
      tilted("33 cl", [[1609, 880], [1718, 880], [1718, 933], [1609, 933]]),
      tilted("Nils Oscar God Lager", [[1609, 974], [2210, 1063], [2199, 1138], [1598, 1049]]),
      tilted("33 cl", [[1600, 1072], [1709, 1072], [1709, 1129], [1600, 1129]]),
      tilted("Nils Oscar India Ale", [[1598, 1177], [2165, 1248], [2156, 1315], [1589, 1244]]),
      tilted("Glutenfri", [[1593, 1261], [1862, 1288], [1855, 1354], [1586, 1327]]),
      tilted("33 cl", [[1578, 1347], [1692, 1347], [1692, 1404], [1578, 1404]]),
      tilted("72 kr", [[2285, 893], [2437, 893], [2437, 964], [2285, 964]]),
      tilted("69 kr", [[2276, 1081], [2429, 1081], [2429, 1147], [2276, 1147]]),
      tilted("76 kr", [[2268, 1344], [2421, 1360], [2414, 1420], [2262, 1405]]),
    ]);
    const scan = await scanPhoto('file://menu.jpg', 'menu', beersSeed as Beer[]);
    expect(scan.text).toContain('Poppels Poppelino\nLager Glutenfri');
    expect(scan.text).toContain('Nils Oscar India Ale\nGlutenfri');
    expect(scan.matches.map((b) => b.name).sort()).toEqual(['India Ale Glutenfri', 'Poppelino Lager Glutenfri']);
  });
});
