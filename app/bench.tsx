import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { benchmarkAsync, modelDir, type BenchInput, type BenchResult } from '../modules/ocr-models';
import { fonts, spacing, useStyles, type Palette } from '../lib/theme';

/**
 * Debug tool: times candidate OCR models (ONNX) on this phone. Open with
 * `adb shell am start -a android.intent.action.VIEW -d glutenless://bench`
 * after pushing the models to the app's external files dir (onnx/). Results
 * also go to logcat under GlutenlessBench and ReactNativeJS.
 */
const CASES: { label: string; file: string; inputs: BenchInput[] }[] = [
  { label: 'PP-OCRv6 small, detect, 960×736', file: 'PP-OCRv6_small_det.onnx', inputs: [{ name: 'x', shape: [1, 3, 960, 736] }] },
  { label: 'PP-OCRv6 small, detect, 640×480', file: 'PP-OCRv6_small_det.onnx', inputs: [{ name: 'x', shape: [1, 3, 640, 480] }] },
  { label: 'PP-OCRv6 small, read one line', file: 'PP-OCRv6_small_rec.onnx', inputs: [{ name: 'x', shape: [1, 3, 48, 320] }] },
  { label: 'PP-OCRv6 medium, detect, 960×736', file: 'PP-OCRv6_medium_det.onnx', inputs: [{ name: 'x', shape: [1, 3, 960, 736] }] },
  { label: 'PP-OCRv6 medium, detect, 640×480', file: 'PP-OCRv6_medium_det.onnx', inputs: [{ name: 'x', shape: [1, 3, 640, 480] }] },
  { label: 'PP-OCRv6 medium, read one line', file: 'PP-OCRv6_medium_rec.onnx', inputs: [{ name: 'x', shape: [1, 3, 48, 320] }] },
  { label: 'WATERec, encode one word', file: 'WATERec-RS-encoder.onnx', inputs: [{ name: 'image', shape: [1, 3, 32, 128] }] },
  {
    label: 'WATERec, one decoder step (12 tokens)',
    file: 'WATERec-RS-decoder.onnx',
    inputs: [
      { name: 'memory', shape: [1, 256, 384] },
      { name: 'tokens', shape: [1, 12], type: 'int64' },
    ],
  },
];

type Row = { label: string; result?: BenchResult; error?: string };

export default function BenchScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles(makeStyles);
  const [rows, setRows] = useState<Row[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      console.log(`BENCH start, models in ${modelDir()}`);
      for (const provider of ['cpu', 'xnnpack'] as const) {
        for (const c of CASES) {
          const label = `${c.label} [${provider}]`;
          try {
            const result = await benchmarkAsync(c.file, c.inputs, 5, provider);
            console.log(`BENCH ${label}: load ${result.loadMs} ms, first ${result.firstMs} ms, median ${result.medianMs} ms`);
            setRows((r) => [...r, { label, result }]);
          } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            console.log(`BENCH ${label}: ERROR ${error}`);
            setRows((r) => [...r, { label, error }]);
          }
        }
      }
      console.log('BENCH done');
      setDone(true);
    })();
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(4) }}>
      <Text style={styles.title}>Model timing</Text>
      <Text style={styles.meta}>{modelDir() ?? 'not available on this platform'}</Text>
      {rows.map((row, i) => (
        <Text key={i} style={styles.row}>
          {row.label}
          {'\n'}
          {row.result
            ? `load ${row.result.loadMs} ms · first ${row.result.firstMs} ms · median ${row.result.medianMs} ms`
            : `error: ${row.error}`}
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
