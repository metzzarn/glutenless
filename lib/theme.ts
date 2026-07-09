// Colors ported from the design prototype's oklch() tokens (converted to hex —
// React Native doesn't support the oklch() CSS function).
export const colors = {
  bg: '#F5EDE4',
  deviceBg: '#F9F0E7',
  brand: '#903A03',
  brandDark: '#762100',
  ink: '#251A15',
  textMuted: '#675B54',
  textMuted2: '#73665F',
  textMuted3: '#7C6E67',
  accentIconBg: '#CF6F19',
  cream: '#FAF4EE',
  cream2: '#FDF7F1',
  border: '#E2DDD7',
  borderLight: '#DCD6D1',
  pillBg: '#E7E0D9',
  circleBtnBg: '#EFE2D8',
  divider: '#D2CDC7',
  sheetDivider: '#ECE7E1',
  chipIconBg: '#F8E4D4',
  listeningBg: '#1E130E',
  waveBar: '#D7B79E',
  cameraBg: '#15100E',
  spinnerHead: '#DD8736',
  white: '#FFFFFF',
  overlay: 'rgba(20,15,10,0.4)',
  statusFree: { text: '#00531B', bg: '#D1F2D7', dot: '#1B9247' },
  statusLow: { text: '#6C4400', bg: '#FEE5B3', dot: '#C99500' },
  favActive: '#C8393A',
  favInactive: '#B9ABA3',
} as const;

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
