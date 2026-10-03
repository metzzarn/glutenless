import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { normalizeOcrText } from '../lib/match';
import { getLastScan, type DebugScan } from '../lib/scanDebug';
import { fonts, radii, spacing, useColors, useStyles, type Palette } from '../lib/theme';

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** A plain-text report of a scan, for pasting into a test fixture or an issue. */
function scanReport(scan: DebugScan): string {
  const candidates = scan.candidates.map(
    (c) =>
      `- ${c.field === 'brewery' ? `Brewery ${c.beer.brewery}` : `${c.beer.name} | ${c.beer.brewery}`}` +
      ` (${c.field} "${c.needle}"${c.found !== c.needle ? ` read as "${c.found}"` : ''})` +
      (c.rejected ? ` REJECTED: ${c.rejected}` : ''),
  );
  return [
    `Mode: ${scan.mode}`,
    `Photo: ${scan.photo.width}x${scan.photo.height} px, ${scan.blocks.length} blocks, ${scan.durationMs} ms`,
    `Matched: ${scan.matches.map((b) => `${b.name} | ${b.brewery}`).join(', ') || 'nothing'}`,
    'Expected: ',
    '',
    'Candidates:',
    ...(candidates.length ? candidates : ['(none)']),
    '',
    'OCR text:',
    scan.text,
  ].join('\n');
}

export default function ScanDebugScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useStyles(makeStyles);
  const [scan] = useState(getLastScan);
  const [photoWidth, setPhotoWidth] = useState(0);

  if (!scan) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.body}>No scan to show.</Text>
      </View>
    );
  }

  // ML Kit frames are in the photo's pixel coordinates; the photo is drawn scaled to the screen width.
  const scale = photoWidth / scan.photo.width;
  const lines = scan.blocks.flatMap((block) => block.lines);
  const matchedIds = new Set(scan.matches.map((b) => b.id));

  const openResult = () => {
    if (scan.mode === 'menu') {
      router.push({ pathname: '/results', params: { ids: scan.matches.map((b) => b.id).join(',') } });
    } else {
      router.push({ pathname: '/beer/[id]', params: { id: String(scan.matches[0].id), viaPhoto: '1' } });
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + spacing(3), paddingHorizontal: spacing(4.5), paddingBottom: insets.bottom + spacing(7) }}
    >
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to camera"
        >
          <Text style={styles.backGlyph}>←</Text>
        </Pressable>
        <Text style={styles.title}>Scan debug</Text>
        <Pressable
          style={styles.shareButton}
          onPress={() => Share.share({ message: scanReport(scan) })}
          accessibilityRole="button"
        >
          <Text style={styles.shareText}>Share report</Text>
        </Pressable>
      </View>

      <View style={styles.verdict}>
        <Text style={styles.verdictTitle}>
          {scan.matches.length
            ? `Matched ${scan.matches.length === 1 ? scan.matches[0].name : `${scan.matches.length} beers`}`
            : 'No match: the app would show the warning'}
        </Text>
        <Text style={styles.meta}>
          {scan.mode === 'menu' ? 'Menu' : 'Can or bottle'} · {scan.photo.width}×{scan.photo.height} px ·{' '}
          {scan.blocks.length} blocks · {lines.length} lines ·{' '}
          {scan.text.length} chars · {scan.durationMs} ms
        </Text>
        {scan.matches.length ? (
          <Pressable onPress={openResult} accessibilityRole="button">
            <Text style={styles.link}>Open result →</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>What the camera read</Text>
      <View
        style={[styles.photo, { aspectRatio: scan.photo.width / scan.photo.height }]}
        onLayout={(e) => setPhotoWidth(e.nativeEvent.layout.width)}
      >
        <Image source={{ uri: scan.photo.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        {photoWidth
          ? lines.map((line, i) =>
              line.frame ? (
                <View
                  key={i}
                  pointerEvents="none"
                  style={[
                    styles.box,
                    {
                      left: line.frame.left * scale,
                      top: line.frame.top * scale,
                      width: line.frame.width * scale,
                      height: line.frame.height * scale,
                    },
                  ]}
                />
              ) : null,
            )
          : null}
      </View>

      <Text style={styles.sectionTitle}>Candidates ({scan.candidates.length})</Text>
      {scan.candidates.length ? (
        scan.candidates.map((c, i) => {
          const won = !c.rejected && matchedIds.has(c.beer.id);
          return (
            <View key={i} style={styles.candidate}>
              <Text style={[styles.candidateMark, { color: c.rejected ? colors.favActive : won ? colors.status.free.dot : colors.textMuted3 }]}>
                {c.rejected ? '✗' : won ? '✓' : '–'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.body}>
                  {c.field === 'brewery' ? (
                    <>
                      <Text style={styles.meta}>Brewery </Text>
                      {c.beer.brewery}
                    </>
                  ) : (
                    <>
                      {c.beer.name} <Text style={styles.meta}>· {c.beer.brewery}</Text>
                    </>
                  )}
                </Text>
                <Text style={styles.meta}>
                  found {c.field} "{c.needle}"
                  {c.found !== c.needle ? ` (read as "${c.found}")` : ''}
                  {c.rejected ? ` · rejected: ${c.rejected}` : won ? '' : ' · outranked by a better match'}
                </Text>
              </View>
            </View>
          );
        })
      ) : (
        <Text style={styles.meta}>No beer name or brewery from our list appears in the text below.</Text>
      )}

      <Text style={styles.sectionTitle}>Recognized text</Text>
      <Text selectable style={styles.code}>{scan.text || '(none)'}</Text>

      <Text style={styles.sectionTitle}>Text the matcher searches</Text>
      <Text selectable style={styles.code}>{normalizeOcrText(scan.text) || '(none)'}</Text>
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(4) },
  backButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.circleBtnBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: { color: colors.brand, fontSize: 15 },
  title: { flex: 1, fontFamily: fonts.serif, fontSize: 20, color: colors.ink },
  shareButton: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    borderRadius: radii.pill,
  },
  shareText: { color: colors.onBrand, fontFamily: fonts.sansBold, fontSize: 12 },
  verdict: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing(3.5),
    gap: spacing(1),
  },
  verdictTitle: { fontFamily: fonts.sansExtraBold, fontSize: 15, color: colors.ink },
  link: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.brand, marginTop: spacing(1) },
  sectionTitle: {
    fontFamily: fonts.sansExtraBold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginTop: spacing(5),
    marginBottom: spacing(2),
  },
  photo: { width: '100%', borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.cameraBg },
  box: { position: 'absolute', borderWidth: 1.5, borderColor: '#3FBF6A', backgroundColor: 'rgba(63,191,106,0.12)' },
  candidate: { flexDirection: 'row', gap: spacing(2.5), paddingVertical: spacing(1.5) },
  candidateMark: { fontFamily: fonts.sansExtraBold, fontSize: 15, width: 14 },
  body: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink },
  meta: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted2 },
  code: {
    fontFamily: mono,
    fontSize: 12,
    lineHeight: 17,
    color: colors.ink,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing(3),
  },
});
