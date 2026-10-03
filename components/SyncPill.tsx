import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, radii, spacing, useColors, useStyles, type Palette } from '../lib/theme';

export type SyncStatus = 'offline' | 'synced' | 'syncing' | 'failed';

const statusMeta = (
  colors: Palette
): Record<SyncStatus, { label: string; bg: string; fg: string; dot: string }> => ({
  offline: { label: 'Offline', bg: colors.pillBg, fg: colors.textMuted, dot: colors.textMuted3 },
  synced: { label: 'Synced', bg: colors.status.free.bg, fg: colors.status.free.text, dot: colors.status.free.dot },
  syncing: { label: 'Syncing…', bg: colors.pillBg, fg: colors.textMuted, dot: colors.textMuted3 },
  failed: { label: 'Sync failed', bg: colors.status.low.bg, fg: colors.status.low.text, dot: colors.status.low.dot },
});

/**
 * Reflects the real result of the last sync attempt against the server
 * (lib/sync.ts). Tapping retries the sync — a no-op while one is already in
 * flight (see app/index.tsx). `failed` is transient: app/index.tsx flips it
 * back to `offline` a couple seconds after a failed attempt.
 */
export function SyncPill({ status, onPress }: { status: SyncStatus; onPress: () => void }) {
  const meta = statusMeta(useColors())[status];
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, { backgroundColor: meta.bg }]}
      accessibilityRole="button"
      accessibilityHint="Syncs the beer list"
    >
      <View style={styles.dotWrap}>
        {status === 'syncing' ? (
          <ActivityIndicator size="small" color={meta.fg} />
        ) : (
          <View style={[styles.dot, { backgroundColor: meta.dot }]} />
        )}
      </View>
      <Text style={[styles.label, { color: meta.fg }]}>{meta.label}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1.25),
    borderRadius: radii.pill,
  },
  dotWrap: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontFamily: fonts.sansBold, fontSize: 11 },
});
