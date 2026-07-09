import { StyleSheet, Text, View } from 'react-native';
import { STATUS_META, type GlutenStatus } from '../lib/status';
import { colors, fonts, radii, spacing } from '../lib/theme';

export function GlutenStatusBox({
  status,
  ppm,
  note,
}: {
  status: GlutenStatus;
  ppm: string;
  note?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <View style={[styles.box, { backgroundColor: meta.bg }]}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: meta.text }]} />
        <Text style={[styles.label, { color: meta.text }]}>{meta.label}</Text>
      </View>
      <Text style={[styles.ppm, { color: meta.text }]}>{ppm}</Text>
      {note ? <Text style={[styles.note, { color: meta.text }]}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radii.lg, padding: spacing(4) },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5), marginBottom: spacing(2) },
  dot: { width: 14, height: 14, borderRadius: 7 },
  label: { fontFamily: fonts.sansExtraBold, fontSize: 16 },
  ppm: { fontFamily: fonts.sansExtraBold, fontSize: 22, marginBottom: spacing(1.5) },
  note: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, opacity: 0.9 },
});
