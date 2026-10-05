import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBadge } from '../components/StatusBadge';
import { ZoomableCamera } from '../components/ZoomableCamera';
import { identifyWithAi } from '../lib/aiLabel';
import { listBeers, type Beer } from '../lib/db';
import { isGlutenClaimWord, unseenNameWords } from '../lib/match';
import { scanPhoto } from '../lib/ocr';
import { setLastScan, setScanDebugEnabled, useScanDebugEnabled } from '../lib/scanDebug';
import { fonts, spacing, useColors, useStyles, type Palette } from '../lib/theme';

/** What the camera shows after a scan that didn't go straight to a beer. */
type Notice = {
  title: string;
  body: string;
  /** Beers to pick from, each with the words of its name the label readings didn't contain. */
  suggestions?: { beer: Beer; unseen: string[] }[];
  /** A beer only the on-device model read, for the person to check against the label. */
  confirm?: Beer;
  /** Shown instead when the person says it isn't `confirm`. */
  otherwise?: Notice;
};

const NOT_IN_LIST: Notice = {
  title: 'Not in our gluten-free list',
  body: "We couldn't match this to a gluten-free or gluten-removed beer. Assume it contains gluten unless you can confirm otherwise. You can also try searching by name.",
};

function pickNotice(suggestions: Beer[], texts: string[]): Notice {
  const breweries = [...new Set(suggestions.map((b) => b.brewery.replace(/\s*\(.*?\)/g, '')))];
  const one = breweries.length === 1 ? breweries[0] : null;
  return {
    title: one ? `We read “${one}” but not which beer` : 'We read the brewery but not which beer',
    body: `If your beer is one of these, tap it. Other beers from ${one ?? 'these breweries'} aren't in our gluten-free list, so assume they contain gluten.`,
    suggestions: suggestions.map((beer) => ({ beer, unseen: unseenNameWords(beer, texts) })),
  };
}

export default function CameraScreen() {
  const { mode } = useLocalSearchParams<{ mode: 'can' | 'menu' }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useStyles(makeStyles);
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const isFocused = useIsFocused();
  // While a photo is being taken or read: the photo (once taken) and what's happening, for the loading screen.
  const [scanning, setScanning] = useState<{ uri: string | null; step: string } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const debug = useScanDebugEnabled();

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // The camera stays underneath a scan result, so going back returns to it.
  // It's only switched on while this screen is showing.
  useEffect(() => {
    if (!isFocused) setReady(false);
  }, [isFocused]);

  const close = useCallback(() => router.back(), [router]);

  const openBeer = useCallback(
    (id: number, viaPhoto: boolean) => {
      setNotice(null);
      router.push({ pathname: '/beer/[id]', params: viaPhoto ? { id: String(id), viaPhoto: '1' } : { id: String(id) } });
    },
    [router],
  );


  const scanImage = useCallback(async (photo: { uri: string; width: number; height: number; fileName?: string }) => {
    try {
      setScanning({ uri: photo.uri, step: mode === 'menu' ? 'Reading the menu…' : 'Reading the label…' });
      setNotice(null);
      const beers = await listBeers('all', '');
      const scanMode = mode === 'menu' ? 'menu' : 'can';
      const started = Date.now();
      const scan = await scanPhoto(photo.uri, scanMode, beers);

      if (debug) {
        setLastScan({
          ...scan,
          mode: scanMode,
          photo: { uri: photo.uri, width: photo.width, height: photo.height, fileName: photo.fileName },
          durationMs: Date.now() - started,
        });
        router.push('/scan-debug');
        return;
      }

      const matches = scan.matches;
      if (scanMode === 'menu') {
        if (matches.length === 0) {
          setNotice({
            title: 'No gluten-free beers found',
            body: "None of the beers we could read on this menu are in our gluten-free list. Assume they contain gluten, or ask the staff.",
          });
          return;
        }
        router.push({
          pathname: '/results',
          params: { ids: matches.map((b) => b.id).join(',') },
        });
      } else {
        const match = matches[0];
        if (match) {
          openBeer(match.id, true);
          return;
        }

        const otherwiseFromScan = scan.suggestions.length ? pickNotice(scan.suggestions, [scan.text]) : NOT_IN_LIST;
        if (scan.confirm) {
          setNotice({
            title: `Is this ${scan.confirm.name}?`,
            body: `Read from the label's lettering, which can be misread. Check that your label says “${scan.confirm.name}” before trusting it.`,
            confirm: scan.confirm,
            otherwise: otherwiseFromScan,
          });
          return;
        }

        // OCR found no beer: on phones with an on-device model, read the label
        // again with it (it reads script lettering OCR can't).
        setScanning({ uri: photo.uri, step: 'Looking closer at the label…' });
        const ai = await identifyWithAi(photo.uri, beers);

        const texts = [scan.text, ...(ai?.texts ?? [])];
        const suggestions = scan.suggestions.length ? scan.suggestions : (ai?.suggestions ?? []);
        const otherwise = suggestions.length ? pickNotice(suggestions, texts) : NOT_IN_LIST;
        if (ai?.match) {
          setNotice({
            title: `Is this ${ai.match.name}?`,
            body: `Read from the label by on-device AI. Check that your label says “${ai.match.name}” before trusting it.`,
            confirm: ai.match,
            otherwise,
          });
          return;
        }
        setNotice(otherwise);
      }
    } finally {
      // Every way out of a scan, including an error, ends the loading screen.
      setScanning(null);
    }
  }, [debug, mode, openBeer, router]);

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || !ready) return;
    setScanning({ uri: null, step: 'Taking photo…' });
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6 });
      if (photo?.uri) await scanImage(photo);
    } finally {
      setScanning(null);
    }
  }, [ready, scanImage]);

  // Scan debug only: run the scan on a saved photo, to compare readers on the same images.
  const pickPhoto = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) await scanImage({ uri: asset.uri, width: asset.width, height: asset.height, fileName: asset.fileName ?? undefined });
  }, [scanImage]);

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.bg }]}>
        <Text style={styles.permissionText}>
          Camera access is needed to scan a beer or menu.
        </Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission} accessibilityRole="button">
          <Text style={styles.permissionButtonText}>Grant camera access</Text>
        </Pressable>
        <Pressable onPress={close} style={{ marginTop: spacing(4) }}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing(2) }]}>
        <Pressable
          style={styles.closeButton}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close camera"
        >
          <Text style={styles.closeGlyph}>×</Text>
        </Pressable>
        {debug ? (
          <View style={styles.debugPill}>
            <Text style={styles.debugPillText}>Scan debug on · hold shutter to turn off</Text>
          </View>
        ) : null}
      </View>

      <ZoomableCamera
        cameraRef={cameraRef}
        active={isFocused}
        onCameraReady={() => setReady(true)}
        style={styles.camera}
      />

      <View style={styles.hintWrap} pointerEvents="none">
        <Text style={styles.hint}>
          {mode === 'menu' ? 'Point camera at the menu' : 'Point camera at the can or bottle'}
        </Text>
      </View>

      {notice ? (
        <View style={styles.noticeWrap} accessibilityRole="alert">
          <Text style={styles.noticeTitle}>{notice.title}</Text>
          <Text style={styles.noticeText}>{notice.body}</Text>
          {notice.confirm ? (
            <>
              <View style={styles.suggestion}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestionName} numberOfLines={1}>{notice.confirm.name}</Text>
                  <Text style={styles.suggestionMeta} numberOfLines={1}>
                    {notice.confirm.brewery} · {notice.confirm.style}
                  </Text>
                </View>
                <StatusBadge status={notice.confirm.status} />
              </View>
              <View style={styles.confirmButtons}>
                <Pressable
                  style={[styles.confirmButton, styles.confirmYes]}
                  onPress={() => openBeer(notice.confirm!.id, true)}
                  accessibilityRole="button"
                >
                  <Text style={styles.confirmYesText}>Yes, that's it</Text>
                </Pressable>
                <Pressable
                  style={styles.confirmButton}
                  onPress={() => setNotice(notice.otherwise ?? NOT_IN_LIST)}
                  accessibilityRole="button"
                >
                  <Text style={styles.confirmNoText}>No</Text>
                </Pressable>
              </View>
            </>
          ) : null}
          {notice.suggestions ? (
            <ScrollView style={styles.suggestions} contentContainerStyle={{ gap: spacing(1.5) }}>
              {notice.suggestions.map(({ beer, unseen }) => {
                const claim = unseen.filter(isGlutenClaimWord);
                const other = unseen.filter((w) => !isGlutenClaimWord(w));
                return (
                  <Pressable
                    key={beer.id}
                    style={styles.suggestion}
                    onPress={() => openBeer(beer.id, false)}
                    accessibilityRole="button"
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.suggestionName} numberOfLines={1}>{beer.name}</Text>
                      <Text style={styles.suggestionMeta} numberOfLines={1}>
                        {beer.style}
                        {beer.discontinued ? ' · discontinued' : ''}
                      </Text>
                      {/* The gluten-free version of a beer can share its whole name with the regular one. */}
                      {claim.length ? (
                        <Text style={styles.suggestionClaim}>Only if your label says “{claim.join(' ')}”</Text>
                      ) : null}
                      {other.length ? (
                        <Text style={styles.suggestionMeta}>Not seen on the label: {other.join(' ')}</Text>
                      ) : null}
                    </View>
                    <StatusBadge status={beer.status} />
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </View>
      ) : null}

      <View style={styles.shutterWrap}>
        {debug ? (
          <Pressable
            style={styles.pickButton}
            onPress={pickPhoto}
            disabled={!!scanning}
            accessibilityRole="button"
            accessibilityLabel="Scan a photo from the library"
          >
            <Text style={styles.pickButtonText}>Photos</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.shutter, !!scanning && styles.shutterDisabled]}
          onPress={takePhoto}
          onLongPress={() => setScanDebugEnabled(!debug)}
          disabled={!!scanning || !ready}
          accessibilityRole="button"
          accessibilityLabel="Take photo"
        />
      </View>

      {scanning ? (
        <View style={styles.scanning} accessibilityLiveRegion="polite">
          {scanning.uri ? <Image source={{ uri: scanning.uri }} style={styles.scanningPhoto} resizeMode="contain" /> : null}
          <View style={styles.scanningShade} />
          <ActivityIndicator size="large" color={colors.white} />
          <Text style={styles.scanningText}>{scanning.step}</Text>
        </View>
      ) : null}
    </View>
  );
}

const fill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cameraBg },
  centered: { alignItems: 'center', justifyContent: 'center', padding: spacing(7) },
  topBar: { paddingHorizontal: spacing(4), flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  debugPill: {
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  debugPillText: { color: colors.white, fontFamily: fonts.sansBold, fontSize: 11.5 },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeGlyph: { color: colors.white, fontSize: 18, lineHeight: 20 },
  camera: {
    flex: 1,
    marginHorizontal: spacing(5),
    marginVertical: spacing(1.5),
    borderRadius: 18,
    overflow: 'hidden',
  },
  hintWrap: { position: 'absolute', top: '42%', left: 0, right: 0, alignItems: 'center' },
  hint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: spacing(5),
  },
  // A warning, not a neutral "no result": an unrecognised beer must not read as safe.
  noticeWrap: {
    marginHorizontal: spacing(5),
    marginBottom: spacing(2),
    padding: spacing(3.5),
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E0AE2A',
    backgroundColor: 'rgba(224,174,42,0.14)',
    gap: spacing(1),
  },
  noticeTitle: { color: '#F2CC7A', fontSize: 14.5, fontFamily: fonts.sansExtraBold },
  noticeText: { color: 'rgba(255,255,255,0.88)', fontSize: 13, lineHeight: 18, fontFamily: fonts.sans },
  suggestions: { maxHeight: 200, marginTop: spacing(1.5) },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2.5),
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3),
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  suggestionName: { color: colors.white, fontFamily: fonts.sansBold, fontSize: 14 },
  suggestionMeta: { color: 'rgba(255,255,255,0.7)', fontFamily: fonts.sans, fontSize: 12, marginTop: 1 },
  suggestionClaim: { color: '#F2CC7A', fontFamily: fonts.sansBold, fontSize: 12, marginTop: 2 },
  confirmButtons: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(1.5) },
  confirmButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing(2.5),
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  confirmYes: { backgroundColor: colors.white },
  confirmYesText: { color: colors.cameraBg, fontFamily: fonts.sansBold, fontSize: 14 },
  confirmNoText: { color: colors.white, fontFamily: fonts.sansBold, fontSize: 14 },
  shutterWrap: { alignItems: 'center', paddingVertical: spacing(5.5), gap: spacing(2.5) },
  shutter: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: colors.white,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  shutterDisabled: { opacity: 0.5 },
  // Level with the shutter (66 tall, below the wrap's top padding).
  pickButton: {
    position: 'absolute',
    left: spacing(8),
    top: spacing(5.5) + 13,
    height: 40,
    paddingHorizontal: spacing(3.5),
    borderRadius: 20,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  pickButtonText: { color: colors.white, fontFamily: fonts.sansBold, fontSize: 13 },
  scanning: {
    ...fill,
    backgroundColor: colors.cameraBg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(4),
  },
  scanningPhoto: fill,
  scanningShade: { ...fill, backgroundColor: 'rgba(0,0,0,0.55)' },
  scanningText: { color: colors.white, fontFamily: fonts.sansBold, fontSize: 15 },
  permissionText: {
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing(4),
  },
  permissionButton: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing(6),
    paddingVertical: spacing(3),
    borderRadius: 12,
  },
  permissionButtonText: { color: colors.onBrand, fontFamily: fonts.sansBold, fontSize: 14 },
  cancelText: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 13 },
});
