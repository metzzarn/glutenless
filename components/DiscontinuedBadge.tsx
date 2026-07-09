import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii, spacing } from '../lib/theme';

export function DiscontinuedBadge() {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>Discontinued</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing(2.25),
    paddingVertical: spacing(1),
    borderRadius: radii.pill,
    backgroundColor: colors.pillBg,
  },
  text: { fontFamily: fonts.sansExtraBold, fontSize: 10.5, color: colors.textMuted },
});
