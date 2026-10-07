import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { Storage } from 'expo-sqlite/kv-store';
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

/*
 * Voice search runs on the phone only, like label reading: Android's or
 * iOS's on-device recognizer, never a server. It listens in a language the
 * person picks (English or Swedish so far, as names and numbers are said in
 * either), is given our beer and brewery names as words to expect, and
 * returns several candidate transcripts for lib/voiceQuery.ts to choose from.
 */

/** Languages voice search offers, with their names in their own language. */
export const VOICE_LANGUAGES: { locale: string; name: string }[] = [
  { locale: 'en-US', name: 'English' },
  { locale: 'sv-SE', name: 'Svenska' },
];

const STORAGE_KEY = 'voiceLanguage';
// Google's on-device recognizer on Android, whose installed languages work offline.
const ON_DEVICE_SERVICE = 'com.google.android.as';

/** The language last picked, or the phone's own if offered, else English. */
function initialLanguage(): string {
  try {
    const saved = Storage.getItemSync(STORAGE_KEY);
    if (saved && VOICE_LANGUAGES.some((l) => l.locale === saved)) return saved;
  } catch {
    // Unreadable storage just means the default.
  }
  const phone = Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0];
  return VOICE_LANGUAGES.find((l) => l.locale.startsWith(`${phone}-`))?.locale ?? 'en-US';
}

/** The installed locale for `locale`'s language, preferring the exact one ("sv-SE" over "sv-FI"). */
export function installedLocaleFor(locale: string, installed: string[]): string | null {
  const lower = installed.map((l) => l.toLowerCase());
  const exact = lower.indexOf(locale.toLowerCase());
  if (exact !== -1) return installed[exact];
  const language = locale.split('-')[0].toLowerCase();
  const same = lower.findIndex((l) => l.split(/[-_]/)[0] === language);
  return same === -1 ? null : installed[same];
}

/**
 * Why listening didn't start, or that it did. `downloading`: the language is
 * being fetched for later; `not-downloaded`: the person declined Android's
 * download (or it failed, or Android 13 showed its own dialog), which needs
 * no message from the app.
 */
export type VoiceStart = 'listening' | 'no-permission' | 'downloading' | 'not-downloaded' | 'unavailable';

export function useVoiceSearch(onFinalResult: (transcripts: string[]) => void) {
  const [listening, setListening] = useState(false);
  const [language, setLanguageState] = useState(initialLanguage);
  const onFinalResultRef = useRef(onFinalResult);
  onFinalResultRef.current = onFinalResult;

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('error', () => setListening(false));
  useSpeechRecognitionEvent('result', (event) => {
    const transcripts = event.results.map((r) => r.transcript.trim()).filter(Boolean);
    if (event.isFinal && transcripts.length) onFinalResultRef.current(transcripts);
  });

  const setLanguage = useCallback((locale: string) => {
    setLanguageState(locale);
    try {
      Storage.setItemSync(STORAGE_KEY, locale);
    } catch {
      // The choice still applies for this session.
    }
  }, []);

  /** Starts listening in `locale` (default: the picked language), expecting the words in `hints`. */
  const start = useCallback(
    async (hints: string[], locale: string = language): Promise<VoiceStart> => {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) return 'no-permission';
      let lang = locale;
      if (Platform.OS === 'android') {
        const { locales, installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({
          androidRecognitionServicePackage: ON_DEVICE_SERVICE,
        });
        const installed = installedLocaleFor(locale, installedLocales);
        if (!installed) {
          // Not on the phone yet: Android asks the person to download it.
          if (!installedLocaleFor(locale, locales)) return 'unavailable';
          const download = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale }).catch(() => null);
          if (download?.status === 'download_scheduled') return 'downloading';
          if (download?.status !== 'download_success') return 'not-downloaded';
        } else {
          lang = installed;
        }
      } else if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
        return 'unavailable';
      }
      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: false,
        continuous: false,
        maxAlternatives: 5,
        requiresOnDeviceRecognition: true,
        contextualStrings: hints,
      });
      return 'listening';
    },
    [language],
  );

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return { listening, language, setLanguage, start, stop };
}
