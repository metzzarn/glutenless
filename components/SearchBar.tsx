import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radii, spacing } from '../lib/theme';

export function SearchBar({
  value,
  onChangeText,
  onMicPress,
  onCameraPress,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onMicPress: () => void;
  onCameraPress: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.searchGlyph} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Search beers or breweries"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={8} style={styles.clearButton}>
          <Text style={styles.clearGlyph}>×</Text>
        </Pressable>
      ) : null}
      <Pressable style={styles.iconButton} onPress={onMicPress} hitSlop={8}>
        <View style={styles.micGlyph} />
      </Pressable>
      <Pressable style={styles.iconButton} onPress={onCameraPress} hitSlop={8}>
        <View style={styles.cameraGlyph}>
          <View style={styles.cameraLens} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radii.lg - 2,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3),
  },
  searchGlyph: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.textMuted,
  },
  input: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink, padding: 0 },
  clearButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.pillBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearGlyph: { fontSize: 15, lineHeight: 15, color: colors.textMuted },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.circleBtnBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micGlyph: { width: 8, height: 13, borderRadius: 4, backgroundColor: colors.brand },
  cameraGlyph: {
    width: 16,
    height: 12,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraLens: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    borderWidth: 1.5,
    borderColor: colors.brand,
  },
});
