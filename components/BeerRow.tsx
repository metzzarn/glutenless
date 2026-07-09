import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Beer } from '../lib/db';
import { STATUS_META } from '../lib/status';
import { colors, fonts, radii, spacing } from '../lib/theme';
import { DiscontinuedBadge } from './DiscontinuedBadge';
import { StatusBadge } from './StatusBadge';

export function BeerRow({
  beer,
  onPress,
  onToggleFavorite,
}: {
  beer: Beer;
  onPress: () => void;
  onToggleFavorite: () => void;
}) {
  const meta = STATUS_META[beer.status];
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.dot, { backgroundColor: meta.dot }]} />
      <View style={styles.textCol}>
        <Text style={styles.name} numberOfLines={1}>
          {beer.name}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {beer.brewery} · {beer.style}
        </Text>
      </View>
      {beer.discontinued ? <DiscontinuedBadge /> : null}
      <StatusBadge status={beer.status} />
      <Pressable onPress={onToggleFavorite} hitSlop={8} style={styles.favButton}>
        <Text
          allowFontScaling={false}
          style={[styles.fav, { color: beer.favorite ? colors.favActive : colors.favInactive }]}
        >
          {'♥︎'}
        </Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2.75),
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg - 1,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(2.75),
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  textCol: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.sansBold, fontSize: 14.5, color: colors.ink },
  subtitle: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted2, marginTop: 2 },
  favButton: { paddingLeft: spacing(1) },
  fav: { fontSize: 17 },
});
