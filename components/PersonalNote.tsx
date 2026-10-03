import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { setPersonalNote } from '../lib/db';
import { fonts, radii, spacing, useColors, useStyles, type Palette } from '../lib/theme';

const SAVE_DELAY_MS = 500;

/** The user's own free-text note on a beer. Saves by itself shortly after typing stops, on blur, and on leaving. */
export function PersonalNote({
  beerId,
  initialNote,
  onFocus,
}: {
  beerId: number;
  initialNote: string;
  onFocus?: () => void;
}) {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  const [draft, setDraft] = useState(initialNote);
  const unsaved = useRef<string | null>(null);

  const flush = useCallback(() => {
    if (unsaved.current === null) return;
    setPersonalNote(beerId, unsaved.current);
    unsaved.current = null;
  }, [beerId]);

  useEffect(() => {
    if (unsaved.current === null) return;
    const timer = setTimeout(flush, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, flush]);

  // Don't lose the last few keystrokes when the screen closes mid-typing.
  useEffect(() => flush, [flush]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Your note</Text>
      <TextInput
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          unsaved.current = text;
        }}
        onBlur={flush}
        onFocus={onFocus}
        placeholder="Where you found it, what you thought…"
        placeholderTextColor={colors.textMuted3}
        multiline
        maxLength={500}
        style={styles.input}
        accessibilityLabel="Your note"
      />
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { marginTop: spacing(4) },
  label: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    color: colors.textMuted3,
    textTransform: 'uppercase',
    marginBottom: spacing(1.5),
  },
  input: {
    minHeight: 64,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing(3),
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.ink,
    textAlignVertical: 'top',
  },
});
