// The native speech module is replaced with one whose events the test can fire.
const mockHandlers: Record<string, (event?: unknown) => void> = {};
const mockSpeech = {
  requestPermissionsAsync: jest.fn(),
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
import { useVoiceSearch } from '../lib/speech';

const fire = (name: string, event?: unknown) => act(async () => mockHandlers[name](event));

describe('useVoiceSearch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts listening once the microphone is allowed', async () => {
    mockSpeech.requestPermissionsAsync.mockResolvedValue({ granted: true });
    const { result } = await renderHook(() => useVoiceSearch(jest.fn()));

    await act(async () => {
      expect(await result.current.start()).toBe(true);
    });
    expect(mockSpeech.start).toHaveBeenCalledWith({ lang: 'en-US', interimResults: false, continuous: false });
  });

  it('does not start without microphone permission', async () => {
    mockSpeech.requestPermissionsAsync.mockResolvedValue({ granted: false });
    const { result } = await renderHook(() => useVoiceSearch(jest.fn()));

    await act(async () => {
      expect(await result.current.start()).toBe(false);
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

  it('passes on only a final, non-empty transcript', async () => {
    const onResult = jest.fn();
    await renderHook(() => useVoiceSearch(onResult));

    await fire('result', { isFinal: false, results: [{ transcript: 'daura' }] });
    await fire('result', { isFinal: true, results: [{ transcript: '' }] });
    await fire('result', { isFinal: true, results: [] });
    expect(onResult).not.toHaveBeenCalled();

    await fire('result', { isFinal: true, results: [{ transcript: 'daura damm' }] });
    expect(onResult).toHaveBeenCalledWith('daura damm');
  });

  it('always calls the latest result handler', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = await renderHook(({ onResult }: { onResult: (t: string) => void }) => useVoiceSearch(onResult), {
      initialProps: { onResult: first },
    });
    await rerender({ onResult: second });

    await fire('result', { isFinal: true, results: [{ transcript: 'stout' }] });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('stout');
  });

  it('stops listening on request', async () => {
    const { result } = await renderHook(() => useVoiceSearch(jest.fn()));
    result.current.stop();
    expect(mockSpeech.stop).toHaveBeenCalled();
  });
});
