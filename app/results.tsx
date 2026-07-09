import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BeerCard } from '../components/BeerCard';
import { getBeerById, type Beer } from '../lib/db';
import { colors, fonts, spacing } from '../lib/theme';

export default function ResultsScreen() {
  const { ids } = useLocalSearchParams<{ ids: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [beers, setBeers] = useState<Beer[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const idList = (ids ?? '')
      .split(',')
      .map((s) => Number(s))
      .filter((n) => !Number.isNaN(n));
    Promise.all(idList.map(getBeerById)).then((results) =>
      setBeers(results.filter((b): b is Beer => !!b))
    );
  }, [ids]);

  const current = beers[index];

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing(3) }]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backGlyph}>←</Text>
        </Pressable>
        <Text style={styles.title}>Found {beers.length} beers on menu</Text>
      </View>

      <View style={styles.cardWrap}>
        {current ? (
          <BeerCard
            beer={current}
            onPress={() =>
              router.push({ pathname: '/beer/[id]', params: { id: String(current.id) } })
            }
            onSwipeLeft={index < beers.length - 1 ? () => setIndex((i) => i + 1) : undefined}
            onSwipeRight={index > 0 ? () => setIndex((i) => i - 1) : undefined}
          />
        ) : null}
      </View>

      <View style={styles.dots}>
        {beers.map((b, i) => (
          <View
            key={b.id}
            style={[styles.dot, { backgroundColor: i === index ? colors.brand : colors.divider }]}
          />
        ))}
      </View>
      <Text style={styles.caption}>Swipe or drag the card left/right to browse</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(4.5) },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5), marginBottom: spacing(5) },
  backButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.circleBtnBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: { color: colors.brand, fontSize: 15 },
  title: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.ink },
  cardWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing(1.75), marginTop: spacing(4) },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  caption: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted3,
    marginTop: spacing(2),
    marginBottom: spacing(4),
    fontFamily: fonts.sans,
  },
});
