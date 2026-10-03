jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}));

import { renderHook } from '@testing-library/react-native';
import { useStatusMeta } from '../lib/status';
import { spacing, useColors, useStyles, type Palette } from '../lib/theme';

const colorScheme = jest.requireMock<{ default: jest.Mock }>(
  'react-native/Libraries/Utilities/useColorScheme'
).default;

describe('useColors', () => {
  it('follows the device between the light and dark palettes', async () => {
    colorScheme.mockReturnValue('light');
    const { result, rerender } = await renderHook(() => useColors());
    const light = result.current;

    colorScheme.mockReturnValue('dark');
    await rerender({});
    const dark = result.current;

    expect(light.bg).not.toBe(dark.bg);
    expect(dark.white).toBe(light.white); // dark-on-purpose surfaces keep their colors
  });

  it('uses the light palette when the device reports no preference', async () => {
    colorScheme.mockReturnValue('light');
    const light = (await renderHook(() => useColors())).result.current;
    colorScheme.mockReturnValue('unspecified');
    expect((await renderHook(() => useColors())).result.current).toBe(light);
  });

  it('gives every palette the same set of colors', async () => {
    colorScheme.mockReturnValue('light');
    const light = (await renderHook(() => useColors())).result.current;
    colorScheme.mockReturnValue('dark');
    const dark = (await renderHook(() => useColors())).result.current;
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });
});

describe('useStyles', () => {
  it('builds styles once per palette, not on every render', async () => {
    const makeStyles = jest.fn((colors: Palette) => ({ box: { backgroundColor: colors.bg } }));

    colorScheme.mockReturnValue('light');
    const { result, rerender } = await renderHook(() => useStyles(makeStyles));
    const lightStyles = result.current;
    await rerender({});
    expect(result.current).toBe(lightStyles);
    expect(makeStyles).toHaveBeenCalledTimes(1);

    colorScheme.mockReturnValue('dark');
    await rerender({});
    expect(result.current).not.toBe(lightStyles);
    expect(makeStyles).toHaveBeenCalledTimes(2);

    colorScheme.mockReturnValue('light');
    await rerender({});
    expect(result.current).toBe(lightStyles);
    expect(makeStyles).toHaveBeenCalledTimes(2);
  });
});

describe('useStatusMeta', () => {
  it("combines a status's label with its colors for the current palette", async () => {
    colorScheme.mockReturnValue('dark');
    const colors = (await renderHook(() => useColors())).result.current;
    const meta = (await renderHook(() => useStatusMeta('low'))).result.current;
    expect(meta).toEqual({ label: 'Gluten-Removed', badge: 'GR', ...colors.status.low });
  });
});

describe('spacing', () => {
  it('works on a 4-point grid', () => {
    expect(spacing(0)).toBe(0);
    expect(spacing(2.5)).toBe(10);
  });
});
