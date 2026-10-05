// The native speech module is replaced with one whose events the test can fire.
const mockHandlers: Record<string, (event?: unknown) => void> = {};
const mockSpeech = {
  requestPermissionsAsync: jest.fn(),
  getSupportedLocales: jest.fn(),
  androidTriggerOfflineModelDownload: jest.fn(),
  supportsOnDeviceRecognition: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
};
jest.mock('expo-speech-recognition', () => ({
  // A getter: jest.mock is hoisted above mockSpeech's definition.
  get ExpoSpeechRecognitionModule() {
    return mockSpeech;
  },
  useSpeechRecognitionEvent: (name: string, handler: (event?: unknown) => void) => {
    mockHandlers[name] = handler;
  },
}));

import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { installedLocaleFor, useVoiceSearch } from '../lib/speech';

const fire = (name: string, event?: unknown) => act(async () => mockHandlers[name](event));
const hints = ['Daura Damm', 'Rådanäs Bryggeri'];

describe('useVoiceSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
    mockSpeech.requestPermissionsAsync.mockResolvedValue({ granted: true });
    mockSpeech.getSupportedLocales.mockResolvedValue({ locales: ['en-US', 'sv-SE'], installedLocales: ['en-US', 'sv-SE'] });
    mockSpeech.androidTriggerOfflineModelDownload.mockResolvedValue({ status: 'download_scheduled' });
  });

  it('listens on the phone, in the chosen language, expecting our names and asking for several candidates', async () => {
    const { result } = await renderHook(() => useVoiceSearch(jest.fn()));
    await act(async () => {
      expect(await result.current.start(hints, 'sv-SE')).toBe('listening');
    });
    expect(mockSpeech.start).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'sv-SE', requiresOnDeviceRecognition: true, contextualStrings: hints, maxAlternatives: 5 }),
    );
  });

  it("downloads a language the phone doesn't have yet instead of listening", async () => {
    mockSpeech.getSupportedLocales.mockResolvedValue({ locales: ['en-US', 'sv-SE'], installedLocales: ['en-US'] });
    const { result } = await renderHook(() => useVoiceSearch(jest.fn()));
    await act(async () => {
      expect(await result.current.start(hints, 'sv-SE')).toBe('downloading');
    });
    expect(mockSpeech.androidTriggerOfflineModelDownload).toHaveBeenCalledWith({ locale: 'sv-SE' });
    expect(mockSpeech.start).not.toHaveBeenCalled();
  });

  it("reports a language the phone can't recognize offline", async () => {
    mockSpeech.getSupportedLocales.mockResolvedValue({ locales: ['en-US'], installedLocales: ['en-US'] });
    const { result } = await renderHook(() => useVoiceSearch(jest.fn()));
    await act(async () => {
      expect(await result.current.start(hints, 'sv-SE')).toBe('unavailable');
    });
    expect(mockSpeech.start).not.toHaveBeenCalled();
  });

  it('does not start without microphone permission', async () => {
    mockSpeech.requestPermissionsAsync.mockResolvedValue({ granted: false });
    const { result } = await renderHook(() => useVoiceSearch(jest.fn()));
    await act(async () => {
      expect(await result.current.start(hints)).toBe('no-permission');
    });
    expect(mockSpeech.start).not.toHaveBeenCalled();
  });

  it('shows listening from start until it ends or fails', async () => {
    const { result } = await renderHook(() => useVoiceSearch(jest.fn()));
    expect(result.current.listening).toBe(false);
    await fire('start');
    expect(result.current.listening).toBe(true);
    await fire('end');
    expect(result.current.listening).toBe(false);
    await fire('start');
    await fire('error');
    expect(result.current.listening).toBe(false);
  });

  it("passes on every final candidate, the recognizer's best first", async () => {
    const onResult = jest.fn();
    await renderHook(() => useVoiceSearch(onResult));
    await fire('result', { isFinal: false, results: [{ transcript: 'daura' }] });
    await fire('result', { isFinal: true, results: [{ transcript: ' ' }] });
    expect(onResult).not.toHaveBeenCalled();
    await fire('result', { isFinal: true, results: [{ transcript: 'dora damm' }, { transcript: 'daura damm' }] });
    expect(onResult).toHaveBeenCalledWith(['dora damm', 'daura damm']);
  });

  it('remembers the chosen language', async () => {
    const first = await renderHook(() => useVoiceSearch(jest.fn()));
    await act(async () => first.result.current.setLanguage('sv-SE'));
    const second = await renderHook(() => useVoiceSearch(jest.fn()));
    expect(second.result.current.language).toBe('sv-SE');
  });

  it('stops listening on request', async () => {
    const { result } = await renderHook(() => useVoiceSearch(jest.fn()));
    result.current.stop();
    expect(mockSpeech.stop).toHaveBeenCalled();
  });
});

describe('installedLocaleFor', () => {
  it('finds the exact locale, or another of the same language', () => {
    expect(installedLocaleFor('sv-SE', ['en-US', 'sv-SE'])).toBe('sv-SE');
    expect(installedLocaleFor('sv-SE', ['en-US', 'sv-FI'])).toBe('sv-FI');
    expect(installedLocaleFor('en-US', ['en-GB'])).toBe('en-GB');
    expect(installedLocaleFor('sv-SE', ['en-US'])).toBeNull();
  });
});
