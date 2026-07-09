import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, fonts, radii, spacing } from '../lib/theme';

function Bar({ delay }: { delay: number }) {
  const height = useSharedValue(8);

  useEffect(() => {
    height.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(26, { duration: 300, easing: Easing.inOut(Easing.ease) }),
          withTiming(8, { duration: 300, easing: Easing.inOut(Easing.ease) })
        ),
        -1
      )
    );
  }, [delay, height]);

  const style = useAnimatedStyle(() => ({ height: height.value }));
  return <Animated.View style={[styles.bar, style]} />;
}

export function ListeningOverlay({
  visible,
  onCancel,
}: {
  visible: boolean;
  onCancel: () => void;
}) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!visible) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.18, { duration: 650, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 650, easing: Easing.inOut(Easing.ease) })
      ),
      -1
    );
  }, [visible, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 1 - (pulse.value - 1) * 3,
  }));

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.container}>
        <View style={styles.micWrap}>
          <Animated.View style={[styles.pulse, pulseStyle]} />
          <View style={styles.micCircle}>
            <View style={styles.micGlyph} />
          </View>
        </View>
        <View style={styles.wave}>
          {[0, 0.15, 0.3, 0.1, 0.25].map((d, i) => (
            <Bar key={i} delay={d * 1000} />
          ))}
        </View>
        <Text style={styles.label}>Listening — say a beer name…</Text>
        <Pressable style={styles.cancel} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.listeningBg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(5.5),
    paddingHorizontal: spacing(7.5),
  },
  micWrap: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  pulse: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.accentIconBg,
  },
  micCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentIconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micGlyph: { width: 16, height: 26, borderRadius: 8, backgroundColor: colors.white },
  wave: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 26 },
  bar: { width: 4, borderRadius: 2, backgroundColor: colors.waveBar },
  label: { fontFamily: fonts.sansBold, fontSize: 14.5, color: colors.white },
  cancel: {
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(2),
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  cancelText: { fontFamily: fonts.sans, fontSize: 13, color: colors.white },
});
