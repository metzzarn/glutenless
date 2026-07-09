import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BeerRow } from '../components/BeerRow';
import { CameraSheet } from '../components/CameraSheet';
import { FilterChips } from '../components/FilterChips';
import { ListeningOverlay } from '../components/ListeningOverlay';
import { SearchBar } from '../components/SearchBar';
import { SyncPill } from '../components/SyncPill';
import { listBeers, toggleFavorite, type Beer } from '../lib/db';
import { useVoiceSearch } from '../lib/speech';
import type { FilterKey } from '../lib/status';
import { colors, fonts, spacing } from '../lib/theme';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [beers, setBeers] = useState<Beer[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [synced, setSynced] = useState(true);

  useEffect(() => {
    listBeers(filter, query).then(setBeers);
  }, [filter, query]);

  const { listening, start, stop } = useVoiceSearch((transcript) => {
    setQuery(transcript);
  });

  const openMic = useCallback(async () => {
    await start();
  }, [start]);

  const openBeer = useCallback(
    (id: number) => router.push({ pathname: '/beer/[id]', params: { id: String(id) } }),
    [router]
  );

  const handleToggleFavorite = useCallback(
    async (id: number) => {
      const favorite = await toggleFavorite(id);
      setBeers((prev) =>
        filter === 'favorite' && !favorite
          ? prev.filter((b) => b.id !== id)
          : prev.map((b) => (b.id === id ? { ...b, favorite } : b))
      );
    },
    [filter]
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
          <View style={styles.logoBadge}>
            <View style={styles.logoGlyph} />
          </View>
          <Text style={styles.title}>Glutenless</Text>
        </View>
        <SyncPill synced={synced} onPress={() => setSynced((s) => !s)} />
      </View>

      <SearchBar
        value={query}
        onChangeText={setQuery}
        onMicPress={openMic}
        onCameraPress={() => setSheetOpen(true)}
      />

      <FilterChips active={filter} onChange={setFilter} />

      <FlatList
        style={styles.list}
        data={beers}
        keyExtractor={(b) => String(b.id)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <BeerRow
            beer={item}
            onPress={() => openBeer(item.id)}
            onToggleFavorite={() => handleToggleFavorite(item.id)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing(2) }} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {filter === 'favorite' && !query.trim()
              ? "No favorites yet — open a beer's detail page and tap the heart to add one."
              : `No beers match "${query}". Try voice or photo search instead.`}
          </Text>
        }
      />

      <CameraSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onScanCan={() => startScan('can')}
        onScanMenu={() => startScan('menu')}
      />
      <ListeningOverlay visible={listening} onCancel={stop} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(4.5) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing(3.5),
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  logoBadge: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: colors.accentIconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlyph: { width: 9, height: 12, borderRadius: 3, backgroundColor: colors.cream2 },
  title: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink },
  list: { flex: 1 },
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
