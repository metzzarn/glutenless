import { StyleSheet, Text, View } from 'react-native';
import { STATUS_META, type GlutenStatus } from '../lib/status';
import { colors, fonts, radii, spacing } from '../lib/theme';

export function GlutenStatusBox({
  status,
  ppm,
  note,
  confirmed,
}: {
  status: GlutenStatus;
  ppm: string;
  note?: string;
  /** Whether this beer's gluten-free/gluten-removed claim has been checked against a primary source. */
  confirmed?: boolean;
}) {
  const meta = STATUS_META[status];
  return (
    <View style={[styles.box, { backgroundColor: meta.bg }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.dot, { backgroundColor: meta.text }]} />
          <Text style={[styles.label, { color: meta.text }]}>{meta.label}</Text>
        </View>
        {confirmed ? (
          <View style={[styles.confirmedBadge, { borderColor: meta.text }]}>
            <Text style={[styles.confirmedText, { color: meta.text }]}>{'✓ Confirmed'}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.ppm, { color: meta.text }]}>{ppm}</Text>
      {note ? <Text style={[styles.note, { color: meta.text }]}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radii.lg, padding: spacing(4) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing(2),
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) },
  dot: { width: 14, height: 14, borderRadius: 7 },
  label: { fontFamily: fonts.sansExtraBold, fontSize: 16 },
  confirmedBadge: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing(2.25),
    paddingVertical: spacing(0.75),
  },
  confirmedText: { fontFamily: fonts.sansExtraBold, fontSize: 10.5 },
  ppm: { fontFamily: fonts.sansExtraBold, fontSize: 22, marginBottom: spacing(1.5) },
  note: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, opacity: 0.9 },
});
