import { act, renderHook } from '@testing-library/react-native';
import { Storage } from 'expo-sqlite/kv-store';
import { Appearance } from 'react-native';
import {
  loadThemePreference,
  setThemePreference,
  useThemePreference,
} from '../lib/themePreference';

describe('theme preference', () => {
  let setColorScheme: jest.SpyInstance;

  beforeEach(() => {
    // The preference lives in module scope: put it back to the default first.
    jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
    setThemePreference('system');
    jest.restoreAllMocks();
    Storage.clearSync();
    setColorScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('follows the device until the user picks something', async () => {
    loadThemePreference();
    expect((await renderHook(() => useThemePreference())).result.current).toBe('system');
    expect(setColorScheme).not.toHaveBeenCalled();
  });

  it('applies, remembers and announces a choice', async () => {
    const { result } = await renderHook(() => useThemePreference());

    await act(async () => setThemePreference('dark'));
    expect(result.current).toBe('dark');
    expect(setColorScheme).toHaveBeenLastCalledWith('dark');
    expect(Storage.getItemSync('themePreference')).toBe('dark');

    await act(async () => setThemePreference('system'));
    expect(result.current).toBe('system');
    expect(setColorScheme).toHaveBeenLastCalledWith('unspecified');
  });

  it('restores a saved choice at startup', async () => {
    Storage.setItemSync('themePreference', 'light');
    loadThemePreference();
    expect(setColorScheme).toHaveBeenCalledWith('light');
    expect((await renderHook(() => useThemePreference())).result.current).toBe('light');
  });

  it('ignores a saved value it does not recognise', async () => {
    Storage.setItemSync('themePreference', 'sepia');
    loadThemePreference();
    expect(setColorScheme).not.toHaveBeenCalled();
  });

  it('keeps working when storage is unavailable', async () => {
    jest.spyOn(Storage, 'getItemSync').mockImplementation(() => {
      throw new Error('no storage');
    });
    jest.spyOn(Storage, 'setItemSync').mockImplementation(() => {
      throw new Error('no storage');
    });

    expect(() => loadThemePreference()).not.toThrow();
    const { result } = await renderHook(() => useThemePreference());
    await act(async () => setThemePreference('dark'));
    expect(result.current).toBe('dark');
  });

  it('stops notifying a screen once it has closed', async () => {
    const { result, unmount } = await renderHook(() => useThemePreference());
    await unmount();
    await act(async () => setThemePreference('dark'));
    expect(result.current).toBe('system');
  });
});
