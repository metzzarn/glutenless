import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BeerRow } from '../components/BeerRow';
import { CameraSheet } from '../components/CameraSheet';
import { FilterChips } from '../components/FilterChips';
import { ListeningOverlay } from '../components/ListeningOverlay';
import { SearchBar } from '../components/SearchBar';
import { SyncPill, type SyncStatus } from '../components/SyncPill';
import { ThemeToggle } from '../components/ThemeToggle';
import { filterBeers, listBeers, toggleFavorite, type Beer } from '../lib/db';
import { useVoiceSearch, VOICE_LANGUAGES } from '../lib/speech';
import { queryFromSpeech } from '../lib/voiceQuery';
import { countLabel, freshnessLabel } from '../lib/labels';
import { getLastSync, syncFromServer, type LastSync } from '../lib/sync';
import type { FilterKey } from '../lib/status';
import { fonts, spacing, useStyles, type Palette } from '../lib/theme';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles(makeStyles);

  const [query, setQuery] = useState('');
  // A search opened from elsewhere, such as a brewery tapped on a beer's page.
  const { q } = useLocalSearchParams<{ q?: string }>();
  useEffect(() => {
    if (q) setQuery(q);
  }, [q]);
  const [filter, setFilter] = useState<FilterKey>('all');
  // null until the first load finishes, so the empty-list message can't flash on launch.
  const [allBeers, setAllBeers] = useState<Beer[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline');
  const [lastSync, setLastSync] = useState<LastSync | null>(getLastSync);
  const syncingRef = useRef(false);
  const failedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The whole list is loaded once and filtered in memory, so switching tabs
  // or typing a search never waits on the database.
  const beers = useMemo(() => filterBeers(allBeers ?? [], filter, query), [allBeers, filter, query]);

  const loadBeers = useCallback(async () => {
    setAllBeers(await listBeers());
  }, []);

  // On focus rather than on mount, to pick up favorites toggled on the detail screen.
  useFocusEffect(
    useCallback(() => {
      loadBeers();
    }, [loadBeers])
  );

  const runSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (failedTimerRef.current) clearTimeout(failedTimerRef.current);
    setSyncStatus('syncing');

    const ok = await syncFromServer();
    syncingRef.current = false;
    if (ok) {
      setSyncStatus('synced');
      setLastSync(getLastSync());
      loadBeers();
    } else {
      setSyncStatus('failed');
      failedTimerRef.current = setTimeout(() => setSyncStatus('offline'), 2500);
    }
  }, [loadBeers]);

  useEffect(() => {
    runSync();
  }, [runSync]);

  useEffect(() => () => {
    if (failedTimerRef.current) clearTimeout(failedTimerRef.current);
  }, []);

  const { listening, language, setLanguage, start, stop } = useVoiceSearch((transcripts) => {
    setQuery(queryFromSpeech(transcripts, allBeers ?? []));
  });

  // Our beer and brewery names, for the recognizer to expect.
  const voiceHints = useMemo(
    () => [...new Set((allBeers ?? []).flatMap((b) => [b.name, b.brewery.replace(/\s*\(.*?\)/g, '')]))],
    [allBeers],
  );
  const languageName = (locale: string) => VOICE_LANGUAGES.find((l) => l.locale === locale)?.name ?? locale;
  const otherLanguage = VOICE_LANGUAGES.find((l) => l.locale !== language) ?? VOICE_LANGUAGES[0];

  const listen = useCallback(
    async (locale?: string) => {
      const status = await start(voiceHints, locale);
      const name = languageName(locale ?? language);
      if (status === 'downloading') {
        Alert.alert('Getting voice search ready', `Your phone is downloading ${name} speech recognition, which works offline. Try again in a minute.`);
      } else if (status === 'unavailable') {
        Alert.alert('Voice search unavailable', `This phone can't recognize ${name} speech offline. You can type the name instead.`);
      }
    },
    [start, voiceHints, language],
  );

  const openMic = useCallback(() => listen(), [listen]);

  // Switching language restarts listening in the other one.
  const switchLanguage = useCallback(() => {
    const next = otherLanguage.locale;
    setLanguage(next);
    stop();
    setTimeout(() => listen(next), 300);
  }, [otherLanguage, setLanguage, stop, listen]);

  const openBeer = useCallback(
    (id: number) => router.push({ pathname: '/beer/[id]', params: { id: String(id) } }),
    [router]
  );

  const handleToggleFavorite = useCallback(
    async (id: number) => {
      const favorite = await toggleFavorite(id);
      setAllBeers((prev) => prev && prev.map((b) => (b.id === id ? { ...b, favorite } : b)));
    },
    []
  );

  const renderBeer = useCallback(
    ({ item }: { item: Beer }) => (
      <BeerRow beer={item} onPress={openBeer} onToggleFavorite={handleToggleFavorite} />
    ),
    [openBeer, handleToggleFavorite]
  );

  const startScan = useCallback(
    (mode: 'can' | 'menu') => {
      setSheetOpen(false);
      router.push({ pathname: '/camera', params: { mode } });
    },
    [router]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing(3) }]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoDisc}>
            <Image source={require('../assets/header_icon.png')} style={styles.logo} />
          </View>
          <Text style={styles.title}>Glutenless</Text>
        </View>
        <View style={styles.headerActions}>
          <ThemeToggle />
          <SyncPill status={syncStatus} onPress={runSync} />
        </View>
      </View>

      <SearchBar
        value={query}
        onChangeText={setQuery}
        onMicPress={openMic}
        onCameraPress={() => setSheetOpen(true)}
      />

      <FilterChips active={filter} onChange={setFilter} />

      {allBeers && (
        <View style={styles.infoRow}>
          <Text style={styles.count} numberOfLines={1}>
            {beers.length > 0 ? countLabel(beers.length, filter, query) : ''}
          </Text>
          <Text style={styles.freshness}>{freshnessLabel(lastSync)}</Text>
        </View>
      )}

      {/* Keyed by tab: a tab change starts a fresh list at the top that mounts only
          the first screenful, instead of re-rendering the whole off-screen window. */}
      <FlatList
        key={filter}
        initialNumToRender={12}
        style={styles.list}
        data={beers}
        keyExtractor={(b) => String(b.id)}
        contentContainerStyle={styles.listContent}
        renderItem={renderBeer}
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={
          allBeers ? (
            <Text style={styles.empty}>
              {filter === 'favorite' && !query.trim()
                ? "No favorites yet — open a beer's detail page and tap the heart to add one."
                : `No beers match "${query}". Try voice or photo search instead.`}
            </Text>
          ) : null
        }
      />

      <CameraSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onScanCan={() => startScan('can')}
        onScanMenu={() => startScan('menu')}
      />
      <ListeningOverlay
        visible={listening}
        onCancel={stop}
        language={languageName(language)}
        otherLanguage={otherLanguage.name}
        onSwitchLanguage={switchLanguage}
      />
    </View>
  );
}

// Defined at module level: an inline component would be a new type on every
// render and remount every separator in the list.
function Separator() {
  const styles = useStyles(makeStyles);
  return <View style={styles.separator} />;
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(4.5) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing(3.5),
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  logoDisc: { borderRadius: 16, backgroundColor: colors.logoBg },
  // The symbol only fills about half of the image; negative margin trims the empty border.
  logo: { width: 56, height: 56, margin: -12 },
  title: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink },
  infoRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing(2), marginBottom: spacing(2) },
  count: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted3 },
  freshness: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.textMuted3 },
  list: { flex: 1 },
  separator: { height: spacing(2) },
  listContent: { paddingBottom: spacing(6) },
  empty: {
    textAlign: 'center',
    paddingVertical: spacing(7.5),
    paddingHorizontal: spacing(2.5),
    color: colors.textMuted3,
    fontFamily: fonts.sans,
    fontSize: 13.5,
  },
});
