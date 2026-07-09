import { StyleSheet, Text, View } from 'react-native';
import { STATUS_META, type GlutenStatus } from '../lib/status';
import { fonts, radii, spacing } from '../lib/theme';

export function StatusBadge({ status }: { status: GlutenStatus }) {
  const meta = STATUS_META[status];
  return (
    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
      <Text style={[styles.text, { color: meta.text }]}>{meta.badge}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing(2.25),
    paddingVertical: spacing(1),
    borderRadius: radii.pill,
  },
  text: { fontFamily: fonts.sansExtraBold, fontSize: 11 },
});
