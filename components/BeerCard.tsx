import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {runOnJS, useAnimatedStyle, useSharedValue, withSpring,} from 'react-native-reanimated';
import type {Beer} from '../lib/db';
import {STATUS_META} from '../lib/status';
import {colors, fonts, radii, spacing} from '../lib/theme';
import {DiscontinuedBadge} from './DiscontinuedBadge';

const SWIPE_THRESHOLD = 60;

export function BeerCard({
  beer,
  onPress,
  onSwipeLeft,
  onSwipeRight,
}: {
  beer: Beer;
  onPress: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}) {
  const dragX = useSharedValue(0);
  const meta = STATUS_META[beer.status];

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      dragX.value = e.translationX;
    })
    .onEnd((e) => {
      if (e.translationX < -SWIPE_THRESHOLD && onSwipeLeft) runOnJS(onSwipeLeft)();
      else if (e.translationX > SWIPE_THRESHOLD && onSwipeRight) runOnJS(onSwipeRight)();
      dragX.value = withSpring(0);
    });

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value },
      { rotate: `${dragX.value / 22}deg` },
    ],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, style]}>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.badgeText, { color: meta.text }]}>{meta.badge}</Text>
          </View>
          {beer.discontinued ? <DiscontinuedBadge /> : null}
        </View>
        <Text style={styles.name}>{beer.name}</Text>
        <Text style={styles.subtitle}>
          {beer.brewery} · {beer.style}
        </Text>
        <View style={[styles.statusBox, { backgroundColor: meta.bg }]}>
          <Text style={[styles.statusText, { color: meta.text }]}>
            {meta.label} · {beer.ppm}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable style={styles.cta} onPress={onPress}>
          <Text style={styles.ctaText}>View details</Text>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 300,
    height: 380,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing(5.5),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 30,
    elevation: 8,
  },
  badgeRow: { flexDirection: 'row', gap: spacing(1.75) },
  badge: { alignSelf: 'flex-start', paddingHorizontal: spacing(2.25), paddingVertical: spacing(1), borderRadius: radii.pill },
  badgeText: { fontFamily: fonts.sansExtraBold, fontSize: 11 },
  name: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink, marginTop: spacing(3.5) },
  subtitle: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.textMuted2, marginBottom: spacing(4) },
  statusBox: { borderRadius: radii.md, padding: spacing(3) },
  statusText: { fontFamily: fonts.sansBold, fontSize: 13 },
  cta: {
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingVertical: spacing(3),
    alignItems: 'center',
  },
  ctaText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.white },
});
