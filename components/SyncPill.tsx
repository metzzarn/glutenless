import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii, spacing } from '../lib/theme';

/**
 * Reflects the real result of the last sync attempt against the server
 * (lib/sync.ts). Tapping retries the sync — a no-op while one is already in
 * flight (see app/index.tsx).
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
