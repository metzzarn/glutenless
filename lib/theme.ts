import { useColorScheme } from 'react-native';

// Colors ported from the design prototype's oklch() tokens (converted to hex —
// React Native doesn't support the oklch() CSS function).
const light = {
  bg: '#F5EDE4',
  surface: '#FFFFFF',
  brand: '#903A03',
  onBrand: '#FFFFFF',
  ink: '#251A15',
  textMuted: '#675B54',
  textMuted2: '#73665F',
  textMuted3: '#7C6E67',
  accentIconBg: '#CF6F19',
  border: '#E2DDD7',
  borderLight: '#DCD6D1',
  pillBg: '#E7E0D9',
  circleBtnBg: '#EFE2D8',
  divider: '#D2CDC7',
  sheetDivider: '#ECE7E1',
  chipIconBg: '#F8E4D4',
  logoBg: 'transparent',
  listeningBg: '#1E130E',
  waveBar: '#D7B79E',
  cameraBg: '#15100E',
  white: '#FFFFFF',
  overlay: 'rgba(20,15,10,0.4)',
  status: {
    free: { text: '#00531B', bg: '#D1F2D7', dot: '#1B9247' },
    low: { text: '#6C4400', bg: '#FEE5B3', dot: '#C99500' },
  },
  favActive: '#C8393A',
  favInactive: '#B9ABA3',
};

export type Palette = typeof light;

// A warm dark brown rather than black, keeping the light theme's character.
// `white`, the listening overlay and the camera screen are dark-on-purpose in
// both themes, so they don't change.
const dark: Palette = {
  ...light,
  bg: '#1F1814',
  surface: '#2B221D',
  brand: '#E59A5B',
  onBrand: '#2A1608',
  ink: '#F3E9E0',
  textMuted: '#C2B4AA',
  textMuted2: '#B3A59B',
  textMuted3: '#A3958B',
  border: '#3D322C',
  borderLight: '#43372F',
  pillBg: '#3A2F29',
  circleBtnBg: '#3A2C23',
  divider: '#4A3F38',
  sheetDivider: '#382E28',
  chipIconBg: '#43301F',
  // The logo's dark brown outline disappears on the dark background without a light disc behind it.
  logoBg: '#F5EDE4',
  overlay: 'rgba(0,0,0,0.55)',
  status: {
    free: { text: '#8FE0A4', bg: '#1D3A26', dot: '#3FBF6A' },
    low: { text: '#F2CC7A', bg: '#44340F', dot: '#E0AE2A' },
  },
  favActive: '#E5595A',
  favInactive: '#6E5F57',
};

/** The palette for the device's current light/dark setting. */
export function useColors(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

const styleCache = new WeakMap<object, Map<Palette, unknown>>();

/** Builds a component's stylesheet for the current palette, once per palette rather than per render. */
export function useStyles<T>(makeStyles: (colors: Palette) => T): T {
  const colors = useColors();
  let byPalette = styleCache.get(makeStyles);
  if (!byPalette) styleCache.set(makeStyles, (byPalette = new Map()));
  if (!byPalette.has(colors)) byPalette.set(colors, makeStyles(colors));
  return byPalette.get(colors) as T;
}

export const radii = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

export const spacing = (n: number) => n * 4;

export const fonts = {
  serif: 'Lora_600SemiBold',
  serifBold: 'Lora_700Bold',
  sans: 'NunitoSans_400Regular',
  sansMedium: 'NunitoSans_600SemiBold',
  sansBold: 'NunitoSans_700Bold',
  sansExtraBold: 'NunitoSans_800ExtraBold',
} as const;
