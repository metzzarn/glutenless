import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DiscontinuedBadge } from '../../components/DiscontinuedBadge';
import { GlutenStatusBox } from '../../components/GlutenStatusBox';
import { getBeerById, toggleFavorite, type Beer } from '../../lib/db';
import { isGlutenStatusConfirmed } from '../../lib/status';
import { colors, fonts, radii, spacing } from '../../lib/theme';

export default function BeerDetailScreen() {
  const { id, viaPhoto } = useLocalSearchParams<{ id: string; viaPhoto?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [beer, setBeer] = useState<Beer | null>(null);

  useEffect(() => {
    getBeerById(Number(id)).then(setBeer);
  }, [id]);

  if (!beer) return <View style={[styles.container, { paddingTop: insets.top }]} />;

  const onToggleFav = async () => {
    const favorite = await toggleFavorite(beer.id);
    setBeer((b) => (b ? { ...b, favorite } : b));
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + spacing(3), paddingHorizontal: spacing(4.5), paddingBottom: spacing(7) }}
    >
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backGlyph}>←</Text>
        </Pressable>
        <Pressable onPress={onToggleFav} hitSlop={8}>
          <Text
            allowFontScaling={false}
            style={[styles.fav, { color: beer.favorite ? colors.favActive : colors.favInactive }]}
          >
            {'♥︎'}
          </Text>
        </Pressable>
      </View>

      {viaPhoto === '1' || beer.discontinued ? (
        <View style={styles.badgeRow}>
          {viaPhoto === '1' ? (
            <View style={styles.photoBadge}>
              <Text style={styles.photoBadgeText}>Detected from photo</Text>
            </View>
          ) : null}
          {beer.discontinued ? <DiscontinuedBadge /> : null}
        </View>
      ) : null}

      <Text style={styles.name}>{beer.name}</Text>
      <Text style={styles.subtitle}>
        {beer.brewery} · {beer.style}
      </Text>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>ABV</Text>
          <Text style={styles.statValue}>{beer.abv}%</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>IBU</Text>
          <Text style={styles.statValue}>{beer.ibu ?? '—'}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Country</Text>
          <Text style={styles.statValue} numberOfLines={1}>
            {beer.country}
          </Text>
        </View>
      </View>

      <View style={styles.grainsRow}>
        {beer.grains.map((grain) => (
          <View key={grain} style={styles.grainChip}>
            <Text style={styles.grainChipText}>{grain[0].toUpperCase() + grain.slice(1)}</Text>
          </View>
        ))}
      </View>

      <GlutenStatusBox
        status={beer.status}
        ppm={beer.ppm}
        note={beer.note}
        confirmed={isGlutenStatusConfirmed(beer)}
      />

      {beer.breweryUrl ? (
        <Pressable
          style={styles.linkButton}
          onPress={() => Linking.openURL(beer.breweryUrl)}
        >
          <Text style={styles.linkButtonText}>Visit website ↗</Text>
        </Pressable>
      ) : null}

      <Text style={styles.source}>
        Source: producer-reported data. If you have celiac disease, confirm with the brewery before
        drinking.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(4.5) },
  backButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.circleBtnBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: { color: colors.brand, fontSize: 15 },
  fav: { fontSize: 20 },
  badgeRow: { flexDirection: 'row', gap: spacing(1.75), marginBottom: spacing(2.5) },
  photoBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.chipIconBg,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
    borderRadius: radii.pill,
  },
  photoBadgeText: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.brand },
  name: { fontFamily: fonts.serif, fontSize: 25, color: colors.ink, marginBottom: 2 },
  subtitle: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted2, marginBottom: spacing(4) },
  statsRow: { flexDirection: 'row', gap: spacing(2.5), marginBottom: spacing(4) },
  statBox: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing(2.75),
  },
  statLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    color: colors.textMuted3,
    textTransform: 'uppercase',
  },
  statValue: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.ink, marginTop: 2 },
  grainsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing(1.75),
    marginBottom: spacing(4),
  },
  grainChip: {
    backgroundColor: colors.chipIconBg,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1.25),
    borderRadius: radii.pill,
  },
  grainChipText: { fontFamily: fonts.sansBold, fontSize: 11.5, color: colors.brand },
  linkButton: {
    alignSelf: 'flex-start',
    marginTop: spacing(3.5),
    paddingVertical: spacing(1.5),
  },
  linkButtonText: { fontFamily: fonts.sansBold, fontSize: 13.5, color: colors.brand },
  source: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.textMuted3,
    lineHeight: 17,
    marginTop: spacing(3.5),
  },
});
