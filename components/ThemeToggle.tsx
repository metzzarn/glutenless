import { Pressable, StyleSheet, Text } from 'react-native';
import { fonts, radii, spacing, useStyles, type Palette } from '../lib/theme';
import {
  THEME_PREFERENCES,
  setThemePreference,
  useThemePreference,
  type ThemePreference,
} from '../lib/themePreference';

const META: Record<ThemePreference, { label: string; glyph: string }> = {
  system: { label: 'Auto', glyph: '◐' },
  light: { label: 'Light', glyph: '☀︎' },
  dark: { label: 'Dark', glyph: '☾' },
};

/** Cycles Auto (follow the device) → Light → Dark on each tap. */
export function ThemeToggle() {
  const preference = useThemePreference();
  const styles = useStyles(makeStyles);
  const meta = META[preference];
  const next = THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(preference) + 1) % THEME_PREFERENCES.length];

  return (
    <Pressable
      onPress={() => setThemePreference(next)}
      style={styles.pill}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Theme: ${meta.label}`}
      accessibilityHint={`Switches to ${META[next].label}`}
    >
      <Text allowFontScaling={false} style={styles.glyph}>
        {meta.glyph}
      </Text>
      <Text style={styles.label}>{meta.label}</Text>
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
    backgroundColor: colors.pillBg,
  },
  glyph: { fontSize: 11, color: colors.textMuted },
  label: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.textMuted },
});
