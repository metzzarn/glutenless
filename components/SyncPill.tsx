import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii, spacing } from '../lib/theme';

/**
 * Purely cosmetic (no backend in this build, per plan): taps just flip a local
 * "synced/offline" label, matching the prototype's sync affordance.
 */
export function SyncPill({ synced, onPress }: { synced: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, { backgroundColor: synced ? colors.statusFree.bg : colors.pillBg }]}
    >
      <View
        style={[styles.dot, { backgroundColor: synced ? colors.statusFree.dot : colors.textMuted3 }]}
      />
      <Text style={[styles.label, { color: synced ? colors.statusFree.text : colors.textMuted }]}>
        {synced ? 'Synced' : 'Offline'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1.25),
    borderRadius: radii.pill,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontFamily: fonts.sansBold, fontSize: 11 },
});
