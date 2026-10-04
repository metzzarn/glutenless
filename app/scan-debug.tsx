import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AI_VARIANTS,
  combineAiReadings,
  downloadAiModel,
  getAiStatus,
  readLabelWithAi,
  type AiIdentification,
  type AiLabelReading,
  type AiVariant,
  type LabelReaderStatus,
} from '../lib/aiLabel';
import { listBeers, type Beer } from '../lib/db';
import { isGlutenClaimWord, normalizeOcrText, unseenNameWords, type MatchCandidate } from '../lib/match';
import { scanPhoto, type PhotoScan } from '../lib/ocr';
import type { OcrLine } from '../modules/ocr-models';
import { getLastScan, type DebugScan } from '../lib/scanDebug';
import { fonts, radii, spacing, useColors, useStyles, type Palette } from '../lib/theme';

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** Whether Gemini Nano can run for this scan at all. */
type AiStatus = LabelReaderStatus | 'checking' | 'downloading' | 'cansOnly';

/** The platform's text recognition on the same photo, when the scan itself used the on-device reader. */
type Comparison = { state: 'running' } | { state: 'done'; scan: PhotoScan } | { state: 'error'; message: string } | null;

function comparisonLines(comparison: Comparison): string[] {
  if (!comparison) return ['Not run'];
  if (comparison.state === 'running') return ['Not finished'];
  if (comparison.state === 'error') return [`Error: ${comparison.message}`];
  return readingLines(comparison.scan);
}

/** The on-device reader's lines, each with WATERec's reading when it had one. */
function ocrLineTexts(lines: OcrLine[]): string[] {
  return lines.map(
    (l) => `${l.text} (${l.score.toFixed(2)})` + (l.waterecText !== null ? ` | W: ${l.waterecText} (${(l.waterecScore ?? 0).toFixed(2)})` : ''),
  );
}

const timingText = (timings: Record<string, number>) => Object.entries(timings).map(([k, v]) => `${k} ${v}`).join(' · ');

/** One setup's reading of the photo. */
type VariantResult =
  | { state: 'waiting' | 'running' | 'downloading' }
  | { state: 'done'; reading: AiLabelReading }
  | { state: 'error'; message: string };

/** What the camera would do with these results, in one line. */
function verdict({ matches, suggestions, confirm }: { matches: Beer[]; suggestions: Beer[]; confirm?: Beer | null }): string {
  if (matches.length) return `Matched ${matches.length === 1 ? matches[0].name : `${matches.length} beers`}`;
  if (confirm) return `Matched ${confirm.name} only with WATERec's readings: the app would ask to confirm`;
  if (suggestions.length) {
    return `No match: the app would suggest ${suggestions.length} ${suggestions[0].brewery} beer${suggestions.length === 1 ? '' : 's'}`;
  }
  return 'No match: the app would show the warning';
}

function candidateLines(candidates: MatchCandidate[]): string[] {
  const lines = candidates.map(
    (c) =>
      `- ${c.field === 'brewery' ? `Brewery ${c.beer.brewery}` : `${c.beer.name} | ${c.beer.brewery}`}` +
      ` (${c.field} "${c.needle}"${c.found !== c.needle ? ` read as "${c.found}"` : ''})` +
      (c.rejected ? ` REJECTED: ${c.rejected}` : ''),
  );
  return lines.length ? lines : ['(none)'];
}

const beerList = (beers: Beer[]) => beers.map((b) => `${b.name} | ${b.brewery}`).join(', ');

function readingLines(reading: Pick<AiLabelReading, 'matches' | 'suggestions' | 'candidates' | 'text'>): string[] {
  return [
    `Matched: ${beerList(reading.matches) || 'nothing'}`,
    ...(reading.suggestions.length ? [`Suggested: ${beerList(reading.suggestions)}`] : []),
    'Candidates:',
    ...candidateLines(reading.candidates),
    'Text:',
    reading.text,
  ];
}

/**
 * What the camera does with this photo outside debug mode, as lines: the
 * reader's match if it has one, otherwise one that needed WATERec's readings
 * (to confirm), otherwise Gemini Nano's (to confirm), otherwise suggestions or
 * the warning. Mirrors app/camera.tsx.
 */
function normalScanOutcome(scan: DebugScan, ai: AiIdentification | null): string[] {
  if (scan.mode === 'menu') return [verdict(scan)];
  if (scan.matches.length) return [`Opens ${scan.matches[0].name} (${scan.reader} match; Nano isn't run)`];
  if (scan.confirm) return [`Asks “Is this ${scan.confirm.name}?” (matched only with WATERec's readings; Nano isn't run)`];
  if (ai?.match) return [`Asks “Is this ${ai.match.name}?” (both Nano readings matched it)`];
  const suggestions = scan.suggestions.length ? scan.suggestions : (ai?.suggestions ?? []);
  if (!suggestions.length) return ['Shows the “not in our gluten-free list” warning'];
  const texts = [scan.text, ...(ai?.texts ?? [])];
  return [
    'Suggests:',
    ...suggestions.map((beer) => {
      const unseen = unseenNameWords(beer, texts);
      const claim = unseen.filter(isGlutenClaimWord);
      const other = unseen.filter((w) => !isGlutenClaimWord(w));
      return (
        `- ${beer.name}` +
        (claim.length ? ` · only if the label says “${claim.join(' ')}”` : '') +
        (other.length ? ` · not seen: ${other.join(' ')}` : '')
      );
    }),
  ];
}

/** A plain-text report of a scan, for pasting into a test fixture or an issue. */
function scanReport(
  scan: DebugScan,
  aiStatus: AiStatus,
  results: Record<string, VariantResult>,
  outcome: string[],
  comparison: Comparison,
): string {
  const aiLines =
    aiStatus !== 'available'
      ? [`Not run: ${aiStatus}`]
      : [
          ...AI_VARIANTS.flatMap((variant) => {
            const result = results[variant.id];
            const head = `## ${variant.label}`;
            if (result?.state === 'done') return [head, `Time: ${result.reading.durationMs} ms`, ...readingLines(result.reading), ''];
            if (result?.state === 'error') return [head, `Error: ${result.message}`, ''];
            return [head, `Not finished: ${result?.state ?? 'waiting'}`, ''];
          }),
        ];
  return [
    ...(scan.photo.fileName ? [`File: ${scan.photo.fileName}`] : []),
    `Mode: ${scan.mode}`,
    'Normal scan:',
    ...outcome,
    `Reader: ${scan.reader}`,
    `Photo: ${scan.photo.width}x${scan.photo.height} px, ${scan.blocks.length} blocks, ${scan.durationMs} ms` +
      (scan.timings ? ` (${timingText(scan.timings)})` : ''),
    `Matched: ${beerList(scan.matches) || 'nothing'}`,
    ...(scan.confirm ? [`To confirm (WATERec): ${beerList([scan.confirm])}`] : []),
    ...(scan.suggestions.length ? [`Suggested: ${beerList(scan.suggestions)}`] : []),
    'Expected: ',
    '',
    'Candidates:',
    ...candidateLines(scan.candidates),
    '',
    'OCR text:',
    scan.text,
    '',
    ...(scan.ocrLines ? ['Lines (PP-OCRv6 | WATERec):', ...ocrLineTexts(scan.ocrLines).map((l) => `- ${l}`), ''] : []),
    ...(comparison ? ['--- ML Kit (comparison) ---', ...comparisonLines(comparison), ''] : []),
    '--- Gemini Nano ---',
    ...aiLines,
  ].join('\n');
}

export default function ScanDebugScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useStyles(makeStyles);
  const [scan] = useState(getLastScan);
  const [photoWidth, setPhotoWidth] = useState(0);
  const [aiStatus, setAiStatus] = useState<AiStatus>('checking');
  const [results, setResults] = useState<Record<string, VariantResult>>({});
  const [beers, setBeers] = useState<Beer[]>([]);
  const [comparison, setComparison] = useState<Comparison>(null);
  const setResult = (id: string, result: VariantResult) => setResults((r) => ({ ...r, [id]: result }));

  const runVariant = async (variant: AiVariant, beers: Beer[], download = false) => {
    if (!scan) return;
    try {
      if (download) {
        setResult(variant.id, { state: 'downloading' });
        await downloadAiModel(variant.options);
      }
      setResult(variant.id, { state: 'running' });
      setResult(variant.id, { state: 'done', reading: await readLabelWithAi(scan.photo.uri, beers, variant) });
    } catch (e) {
      setResult(variant.id, { state: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  // Gemini Nano reads the same photo with each setup in turn, so they can be
  // compared with ML Kit and with each other. One at a time: the model runs
  // one request at a time anyway.
  const runAi = async (download: boolean) => {
    if (!scan) return;
    try {
      if (download) {
        setAiStatus('downloading');
        await downloadAiModel();
      }
      const status = await getAiStatus();
      setAiStatus(status);
      if (status !== 'available') return;
      const beers = await listBeers('all', '');
      setBeers(beers);
      setResults(Object.fromEntries(AI_VARIANTS.map((v) => [v.id, { state: 'waiting' }])));
      for (const variant of AI_VARIANTS) await runVariant(variant, beers);
    } catch {
      setAiStatus('unavailable');
    }
  };

  // ML Kit on the same photo, when the scan used the on-device reader. Before
  // Nano, so the two don't share the CPU while being timed.
  const runComparison = async () => {
    if (!scan || scan.reader !== 'PP-OCRv6 + WATERec') return;
    setComparison({ state: 'running' });
    try {
      setComparison({ state: 'done', scan: await scanPhoto(scan.photo.uri, scan.mode, await listBeers('all', ''), { platformOnly: true }) });
    } catch (e) {
      setComparison({ state: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  useEffect(() => {
    // The prompts are written for a single label; menus aren't compared yet.
    if (scan?.mode === 'can') runComparison().then(() => runAi(false));
    else setAiStatus('cansOnly');
  }, []);

  if (!scan) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.body}>No scan to show.</Text>
      </View>
    );
  }

  // Text frames are in the photo's pixel coordinates; the photo is drawn scaled to the screen width.
  const scale = photoWidth / scan.photo.width;
  const lines = scan.blocks.flatMap((block) => block.lines);
  const matchedIds = new Set([...scan.matches, ...(scan.confirm ? [scan.confirm] : [])].map((b) => b.id));

  const largeTextReadings = AI_VARIANTS.map((v) => results[v.id])
    .flatMap((r) => (r?.state === 'done' ? [r.reading] : []));
  const aiDone = aiStatus !== 'available' || largeTextReadings.length === AI_VARIANTS.length;
  const outcome = aiDone
    ? normalScanOutcome(scan, largeTextReadings.length >= 2 ? combineAiReadings(largeTextReadings, beers) : null)
    : ['Waiting for Gemini Nano…'];

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
          onPress={() => Share.share({ message: scanReport(scan, aiStatus, results, outcome, comparison) })}
          accessibilityRole="button"
        >
          <Text style={styles.shareText}>Share report</Text>
        </Pressable>
      </View>

      <View style={[styles.verdict, { marginBottom: spacing(2.5) }]}>
        <Text style={styles.meta}>What a normal scan would do</Text>
        <Text style={styles.verdictTitle}>{outcome[0]}</Text>
        {outcome.slice(1).map((line, i) => (
          <Text key={i} style={styles.body}>{line}</Text>
        ))}
      </View>

      <View style={styles.verdict}>
        <Text style={styles.meta}>{scan.reader}</Text>
        <Text style={styles.verdictTitle}>{verdict(scan)}</Text>
        <Text style={styles.meta}>
          {scan.mode === 'menu' ? 'Menu' : 'Can or bottle'} · {scan.photo.width}×{scan.photo.height} px ·{' '}
          {scan.blocks.length} blocks · {lines.length} lines ·{' '}
          {scan.text.length} chars · {scan.durationMs} ms
          {scan.timings ? ` (${timingText(scan.timings)})` : ''}
        </Text>
        {scan.matches.length ? (
          <Pressable onPress={openResult} accessibilityRole="button">
            <Text style={styles.link}>Open result →</Text>
          </Pressable>
        ) : null}
        {scan.ocrLines ? (
          <Text selectable style={[styles.code, { marginTop: spacing(2) }]}>
            {ocrLineTexts(scan.ocrLines).join('\n') || '(no text found)'}
          </Text>
        ) : null}
      </View>

      {comparison ? (
        <>
          <Text style={styles.sectionTitle}>ML Kit (comparison)</Text>
          <View style={styles.verdict}>
            {comparison.state === 'running' ? <Text style={styles.verdictTitle}>Reading…</Text> : null}
            {comparison.state === 'error' ? (
              <>
                <Text style={styles.verdictTitle}>Failed</Text>
                <Text selectable style={styles.meta}>{comparison.message}</Text>
              </>
            ) : null}
            {comparison.state === 'done' ? (
              <>
                <Text style={styles.verdictTitle}>{verdict(comparison.scan)}</Text>
                <Text selectable style={[styles.code, { marginTop: spacing(2) }]}>{comparison.scan.text || '(none)'}</Text>
              </>
            ) : null}
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Gemini Nano (on-device AI)</Text>
      {aiStatus !== 'available' ? (
        <View style={styles.verdict}>
          <Text style={styles.verdictTitle}>
            {aiStatus === 'checking'
              ? 'Checking…'
              : aiStatus === 'downloading'
                ? 'Downloading the model…'
                : aiStatus === 'cansOnly'
                  ? 'Only compared for cans and bottles'
                  : aiStatus === 'downloadable'
                    ? 'Supported, but not downloaded yet'
                    : aiStatus === 'unavailable'
                      ? 'Not available on this phone'
                      : 'The phone is downloading the model'}
          </Text>
          {aiStatus === 'downloadable' || aiStatus === 'downloading' ? (
            <Pressable onPress={() => runAi(aiStatus === 'downloadable')} accessibilityRole="button">
              <Text style={styles.link}>{aiStatus === 'downloadable' ? 'Download and read →' : 'Check again →'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: spacing(2.5) }}>
          {AI_VARIANTS.map((variant) => {
            const result = results[variant.id];
            return (
              <View key={variant.id} style={styles.verdict}>
                <Text style={styles.meta}>{variant.label}</Text>
                {result?.state === 'done' ? (
                  <>
                    <Text style={styles.verdictTitle}>{verdict(result.reading)}</Text>
                    <Text style={styles.meta}>{result.reading.durationMs} ms</Text>
                    <Text selectable style={[styles.code, { marginTop: spacing(2) }]}>{result.reading.text || '(none)'}</Text>
                  </>
                ) : result?.state === 'error' ? (
                  <>
                    <Text style={styles.verdictTitle}>Failed</Text>
                    <Text selectable style={styles.meta}>{result.message}</Text>
                    {result.message.includes('downloadable') ? (
                      <Pressable
                        onPress={() => runVariant(variant, beers, true)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.link}>Download this model and read →</Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.verdictTitle}>
                    {result?.state === 'running' ? 'Reading…' : result?.state === 'downloading' ? 'Downloading…' : 'Waiting…'}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}

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
