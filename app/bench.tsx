import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listBeers, type Beer } from '../lib/db';
import { matchBeersInMenuText } from '../lib/match';
import { recognizeText, extractFullText, scanPhoto } from '../lib/ocr';
import { listImages, modelDir, readAsync } from '../modules/ocr-models';
import { fonts, spacing, useStyles, type Palette } from '../lib/theme';

/**
 * Debug tool: scans every photo in the app's external files dir (images/)
 * the way a can scan does (PP-OCRv6 + WATERec) and logs the text, the
 * outcome and the time to logcat (ReactNativeJS), for comparing with the
 * desktop bench. Push photos with `adb push`, then open it with
 * `adb shell am start -a android.intent.action.VIEW -d glutenless://bench`.
 * With ?reader=platform, the photos are read with ML Kit instead.
 *
 * With ?set=menus, each photo in menus/ is read by every reader in
 * MENU_READERS and logged as `MENU file :: reader :: ms :: part/parts :: text`;
 * tools/ocr-bench/score_menus.mts scores those texts with the menu matcher.
 */

/**
 * Readers compared on menus: ML Kit, PP-OCRv6 finding text at several sizes
 * (no WATERec, which can invent text), and `app`, a menu scan as the camera
 * does it.
 */
const MENU_READERS: { label: string; read: (uri: string, beers: Beer[]) => Promise<string> }[] = [
  { label: 'mlkit', read: async (uri) => extractFullText(await recognizeText(uri)) },
  { label: 'app', read: async (uri, beers) => (await scanPhoto(uri, 'menu', beers)).text },
  ...[960, 1600].map((side) => ({
    label: `ppocr-${side}`,
    read: async (uri: string) => (await readAsync(uri, { maxWaterecLines: 0, detectMaxSide: side })).lines.map((l) => l.text).join('\n'),
  })),
];

/** A photo's outcome (`note`) or an error. */
type Row = { label: string; note?: string; error?: string };

export default function BenchScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles(makeStyles);
  const [rows, setRows] = useState<Row[]>([]);
  const [done, setDone] = useState(false);
  const { reader, set } = useLocalSearchParams<{ reader?: string; set?: string }>();
  const menus = set === 'menus';

  useEffect(() => {
    (async () => {
      const beers = await listBeers('all', '');
      if (menus) {
        for (const uri of listImages('menus')) {
          const name = decodeURIComponent(uri.split('/').pop() ?? uri);
          for (const { label, read } of MENU_READERS) {
            try {
              const started = Date.now();
              const text = await read(uri, beers);
              const ms = Date.now() - started;
              const matches = matchBeersInMenuText(text, beers).map((b) => b.name);
              // Logcat cuts lines at ~4 KB, so the text goes in numbered parts.
              const json = JSON.stringify(text);
              const parts = Math.max(1, Math.ceil(json.length / 3000));
              for (let i = 0; i < parts; i++) {
                console.log(`MENU ${name} :: ${label} :: ${ms} :: ${i + 1}/${parts} :: ${json.slice(i * 3000, (i + 1) * 3000)}`);
              }
              setRows((r) => [...r, { label: `${name} [${label}]`, note: `${matches.join(', ') || 'no match'} · ${ms} ms` }]);
            } catch (e) {
              const error = e instanceof Error ? e.message : String(e);
              console.log(`MENU ${name} :: ${label} :: ERROR ${error}`);
              setRows((r) => [...r, { label: `${name} [${label}]`, error }]);
            }
          }
        }
        console.log('MENU done');
        setDone(true);
        return;
      }
      for (const uri of listImages('images')) {
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
      <Text style={styles.title}>{menus ? 'Menu reading bench' : 'Label reading bench'}</Text>
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
