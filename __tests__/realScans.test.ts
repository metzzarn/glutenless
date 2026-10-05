import beersSeed from '../data/beers.json';
import type { Beer } from '../lib/db';
import { matchBeerByText } from '../lib/match';

const beers = beersSeed as unknown as Beer[];

/**
 * Text from real scans (scan debug reports), by ML Kit or Gemini Nano, with
 * the beer each must match, or null for beers that contain gluten and must
 * never match. Add new reports here, especially ones that went wrong.
 */
const scans: [label: string, text: string, expected: string | null][] = [
  // Beers that contain gluten, some looking like a gluten-free beer from the same brewery.
  ['Stone IPA bottle, ML Kit', 'STONE\nPA', null],
  ['Stone IPA bottle, Nano', 'STONE\nIPA', null],
  ['Stone IPA can, ML Kit', 'THE ICONIC\nS TO NE\nIP.\nBERLIN GERMANY\nA', null],
  ['Stone Hazy IPA, ML Kit', 'NE\nHAZY\nIPA\nAN AMAZiNGLY HAZY IPA\n6.7% alelvol - 12 fl ox', null],
  ['Stone Hazy IPA, ML Kit (2)', 'ST0 NE\nARZY\nIPA\nAN AMAZINGLY HAZY IPA\n6.7% ale/vol - 12 fi ox', null],
  ['Stone Hazy IPA, Nano', 'STONE\nSTONER\nHAZY\nIPA', null],
  ['BrewDog Punk IPA, ML Kit', 'BREWDOS\nUNITED WE STAND OR eE\nBREWED\nBET ER BEER\nIN ELLON\nCLASSIC\nFIERCELY D', null],
  ['BrewDog Punk IPA, Nano', 'BREWDOG\nPUNK IPA', null],
  ['BrewDog Punk IPA, Nano (2)', 'BREWDOG\nPUNK\nIPA', null],
  [
    'Estrella Damm bottle, ML Kit',
    '2 PREMIAD\nAUGUS\nVEZA MEDITERA ÂN\nDE MALTAY YARR02\nESTRELLA\nDAMM\no01NGrkoIENTER NArURALES\nBARCELONA\n876',
    null,
  ],
  ['Estrella Damm can, Nano', 'ESTRELLA DAMM\nCERVEZA MEDITERRANEA\nDE MALTA Y ARROZ\nBARCELONA\n1876', null],
  ['Peroni Nastro Azzurro, ML Kit', 'AP\nTAL\n8IRA\nPOM\nDAL18 46\nSUPERIORE\nPERONI\nNASTRO\nAZZURRO\nTALIP ANA', null],
  ['Peroni Nastro Azzurro, Nano', 'PERONI\nNASTRO AZZURRO', null],

  [
    // The back of a Glutenberg IPA can, read by Florence-2: the US government warning's
    // "ALCOHOLIC BEVERAGES" must not name Glutenberg's "Non-Alcoholic Blonde".
    'Glutenberg IPA can (back), Florence-2',
    'gluten fice\nGluten\n6% ALC/Vol\nindia pal\nINGREDIENTS: WATER, MILLET, BUCKWHEET\nHOPS, RICE, CANDI SYRUP, CORN MALTOO\n' +
      'GOVERNMENT WARNING: (11) ACCORDING TO\nSURGEON GENERAL, WOMEN SHOP, NO. 1\nAL COHOLIC BEVERATH DEFECTS 12% OF THE RISK BEVERAGES IMPAIRS, AND\n' +
      'Brewed and canned by Brassesseurs Sans Glue\nMontréal, Quebec, Canada\nglutenberg.ca',
    null,
  ],

  // Gluten-free beers.
  ['Stone Delicious IPA, Nano', 'STONE\nDelicious\nIPA', 'Delicious IPA'],
  ['Peroni Gluten Free, Nano', 'PERONI\nNASTRO AZZURRO\nGLUTEN FREE', 'Peroni Nastro Azzurro Gluten Free'],
  ['Daura Damm, Nano', 'DAURA\nDAMM\n1676\nGLUTEN-FREE', 'Daura Damm'],
  ['BrewDog Vagabond, Nano', 'BREW DOG\nVAGABOND\nDRAWN\nGLUTEN\nFREE', 'Vagabond Pale Ale'],
  // WATERec lists lines bottom to top, without spaces; "Sin Gluten" is in script.
  [
    'Estrella Galicia Gluten Free bottle, WATERec',
    'GLUTENFREE\nSinGluten\nGalicia\nEstrella\nCERVEJA\nMAESTROSCERVECEROSDE1906',
    'Estrella Galicia Gluten Free',
  ],
  ['Daura Damm can, WATERec', "CUK-9-054\nES-110-001\nGLUTEN\n<3PPM\nGLUTEN-FREE\n1876\nDAMM\nDAURA\nGLUTEN-FREEBEER", 'Daura Damm'],
  // A regular Estrella Galicia label: no gluten-free words, so never the gluten-free one.
  ['Estrella Galicia (regular), made up', 'Estrella\nGalicia\nCERVEZA ESPECIAL\nMAESTROS CERVECEROS DESDE 1906', null],
  // "ALKOHOLITON" is printed away from "Kukko / PILS"; it's the alcohol-free one.
  [
    'Kukko Pils Alkoholiton can, PaddleOCR',
    'AOHOLFRI\nALKOHOLITON\nALKOHOL\nLAITILAN\nKukko\nPILS\nRONC\n33 cl',
    'Kukko Pils Alkoholiton',
  ],
  // The same can on the phone: a misread "nooce" splits "Kukko" from "PILS",
  // and the brewery only prints "LAITILAN" of Laitilan Wirvoitusjuomatehdas.
  [
    'Kukko Pils Alkoholiton can, PP-OCRv6 + WATERec on the phone',
    'KOHOLFRI\nALKOHOU\nALKOHOLITON\nLAITILAN\nKukko\nnooce\nPILS\nALKOHOLITON OLUT\n33 cl\n000000',
    'Kukko Pils Alkoholiton',
  ],
  ['Kukko Pils, made up', 'LAITILAN\nKukko\n~~\nPILS\n33 cl', 'Kukko Pils'],
  // "BREWOOG" reads as BrewDog, since OCR commonly takes a D for an O.
  ['BrewDog Vagabond, ML Kit', 'BREWOOG\nVAGABOND\nGLUTENFREE', 'Vagabond Pale Ale'],
];

describe('real scans', () => {
  it.each(scans)('%s', (_label, text, expected) => {
    expect(matchBeerByText(text, beers)?.name ?? null).toBe(expected);
  });
});
