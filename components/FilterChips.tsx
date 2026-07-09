import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { FILTERS, type FilterKey } from '../lib/status';
import { colors, fonts, radii, spacing } from '../lib/theme';

export function FilterChips({
  active,
  onChange,
}: {
  active: FilterKey;
  onChange: (key: FilterKey) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {FILTERS.map((f) => {
        const isActive = f.key === active;
        return (
          <TouchableOpacity
            key={f.key}
            onPress={() => onChange(f.key)}
            style={[styles.chip, isActive && styles.chipActive]}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>{f.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { flexDirection: 'row', gap: spacing(1.75), paddingBottom: spacing(2), paddingTop: spacing(2) },
  chip: {
    paddingHorizontal: spacing(3.25),
    paddingVertical: spacing(1.5),
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  label: { fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.textMuted },
  labelActive: { color: colors.white },
});
