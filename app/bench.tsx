import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listBeers } from '../lib/db';
import { scanPhoto } from '../lib/ocr';
import { listImages, modelDir } from '../modules/ocr-models';
import { fonts, spacing, useStyles, type Palette } from '../lib/theme';

/**
 * Debug tool: scans every photo in the app's external files dir (images/)
 * the way a can scan does (PP-OCRv6 + WATERec) and logs the text, the
 * outcome and the time to logcat (ReactNativeJS), for comparing with the
 * desktop bench. Push photos with `adb push`, then open it with
 * `adb shell am start -a android.intent.action.VIEW -d glutenless://bench`.
 * With ?reader=platform, the photos are read with ML Kit instead.
 */

/** A photo's outcome (`note`) or an error. */
type Row = { label: string; note?: string; error?: string };

export default function BenchScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles(makeStyles);
  const [rows, setRows] = useState<Row[]>([]);
  const [done, setDone] = useState(false);
  const { reader } = useLocalSearchParams<{ reader?: string }>();

  useEffect(() => {
    (async () => {
      const beers = await listBeers('all', '');
      for (const uri of listImages()) {
        const name = decodeURIComponent(uri.split('/').pop() ?? uri);
        try {
          const started = Date.now();
          const scan = await scanPhoto(uri, 'can', beers, { platformOnly: reader === 'platform' });
          const ms = Date.now() - started;
          const verdict = scan.matches.length
            ? `matched ${scan.matches[0].name}`
            : scan.confirm
              ? `asks "Is this ${scan.confirm.name}?"`
              : scan.suggestions.length
                ? `suggested ${scan.suggestions.map((b) => b.name).join(', ')}`
                : 'no match';
          const lines = (scan.ocrLines ?? []).map((l) => `${l.text} (${l.score.toFixed(2)})${l.waterecText !== null ? ` | W: ${l.waterecText} (${(l.waterecScore ?? 0).toFixed(2)})` : ''}`);
          console.log(`READ ${name} :: ${verdict} :: ${ms} ms ${scan.reader} ${JSON.stringify(scan.timings ?? {})} :: ${JSON.stringify(lines)}`);
          setRows((r) => [...r, { label: name, note: `${verdict} · ${ms} ms · ${scan.reader}` }]);
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          console.log(`READ ${name} :: ERROR ${error}`);
          setRows((r) => [...r, { label: name, error }]);
        }
      }
      console.log('READ done');
      setDone(true);
    })();
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(4) }}>
      <Text style={styles.title}>Label reading bench</Text>
      <Text style={styles.meta}>{modelDir() ?? 'not available on this platform'}</Text>
      {rows.map((row, i) => (
        <Text key={i} style={styles.row}>
          {row.label}
          {'\n'}
          {row.note ?? `error: ${row.error}`}
        </Text>
      ))}
      <Text style={styles.meta}>{done ? 'Done.' : 'Running…'}</Text>
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink, marginBottom: spacing(2) },
  meta: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted2, marginVertical: spacing(2) },
  row: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink, marginBottom: spacing(3) },
});
