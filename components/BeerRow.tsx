import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Beer } from '../lib/db';
import { fonts, radii, spacing, useColors, useStyles, type Palette } from '../lib/theme';
import { DiscontinuedBadge } from './DiscontinuedBadge';
import { StatusBadge } from './StatusBadge';

// Memoized, with id-taking callbacks so the parent can pass stable handlers:
// rows whose beer is unchanged skip re-rendering when the list is filtered.
export const BeerRow = memo(function BeerRow({
  beer,
  onPress,
  onToggleFavorite,
}: {
  beer: Beer;
  onPress: (id: number) => void;
  onToggleFavorite: (id: number) => void;
}) {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  return (
    <Pressable style={styles.row} onPress={() => onPress(beer.id)} accessibilityRole="button">
      <View style={styles.textCol}>
        <Text style={styles.name} numberOfLines={1}>
          {beer.name}
        </Text>
        <View style={styles.subtitleRow}>
          <Text style={[styles.subtitle, styles.subtitleText]} numberOfLines={1}>
            {beer.brewery} · {beer.style}
          </Text>
          <Text style={[styles.subtitle, styles.abv]}>{' · '}{beer.abv}%</Text>
        </View>
      </View>
      {beer.discontinued ? <DiscontinuedBadge /> : null}
      <StatusBadge status={beer.status} />
      <Pressable
        onPress={() => onToggleFavorite(beer.id)}
        hitSlop={8}
        style={styles.favButton}
        accessibilityRole="button"
        accessibilityLabel={beer.favorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <Text
          allowFontScaling={false}
          style={[styles.fav, { color: beer.favorite ? colors.favActive : colors.favInactive }]}
        >
          {'♥︎'}
        </Text>
      </Pressable>
    </Pressable>
  );
});

const makeStyles = (colors: Palette) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2.75),
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg - 1,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(2.75),
  },
  textCol: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.sansBold, fontSize: 14.5, color: colors.ink },
  subtitleRow: { flexDirection: 'row', marginTop: 2 },
  subtitle: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted2 },
  subtitleText: { flexShrink: 1 },
  abv: { flexShrink: 0, fontVariant: ['tabular-nums'] },
  favButton: { paddingLeft: spacing(1) },
  fav: { fontSize: 17 },
});
