import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii, spacing } from '../lib/theme';

export function CameraSheet({
  visible,
  onClose,
  onScanCan,
  onScanMenu,
}: {
  visible: boolean;
  onClose: () => void;
  onScanCan: () => void;
  onScanMenu: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.heading}>Scan with camera</Text>

          <Pressable style={[styles.row, styles.rowDivider]} onPress={onScanCan}>
            <View style={styles.iconChip}>
              <View style={styles.canGlyph} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Scan a can or bottle</Text>
              <Text style={styles.rowSubtitle}>Point at a single beer</Text>
            </View>
          </Pressable>

          <Pressable style={styles.row} onPress={onScanMenu}>
            <View style={styles.iconChip}>
              <View style={styles.menuGlyph}>
                <View style={styles.menuLine} />
                <View style={styles.menuLine} />
                <View style={[styles.menuLine, { width: '60%' }]} />
              </View>
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Scan a menu</Text>
              <Text style={styles.rowSubtitle}>Detect every beer listed</Text>
            </View>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing(4.5),
    paddingTop: spacing(2.5),
    paddingBottom: spacing(7.5),
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.divider,
    alignSelf: 'center',
    marginBottom: spacing(4),
  },
  heading: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing(3),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3.5),
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(1.5),
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.sheetDivider },
  iconChip: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.chipIconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canGlyph: { width: 14, height: 20, borderRadius: 4, backgroundColor: colors.brand },
  menuGlyph: { width: 18, height: 20, justifyContent: 'center', gap: 3 },
  menuLine: { height: 2.5, borderRadius: 2, backgroundColor: colors.brand },
  rowText: { flex: 1 },
  rowTitle: { fontFamily: fonts.sansBold, fontSize: 14.5, color: colors.ink },
  rowSubtitle: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted2, marginTop: 2 },
});
