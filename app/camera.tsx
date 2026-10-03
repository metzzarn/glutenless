import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listBeers } from '../lib/db';
import { scanPhoto } from '../lib/ocr';
import { setLastScan, setScanDebugEnabled, useScanDebugEnabled } from '../lib/scanDebug';
import { fonts, spacing, useColors, useStyles, type Palette } from '../lib/theme';

export default function CameraScreen() {
  const { mode } = useLocalSearchParams<{ mode: 'can' | 'menu' }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useStyles(makeStyles);
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  const debug = useScanDebugEnabled();

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const close = useCallback(() => router.back(), [router]);

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || !ready) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.6 });
    if (!photo?.uri) return;

    setDetecting(true);
    setNotice(null);
    const beers = await listBeers('all', '');
    const scanMode = mode === 'menu' ? 'menu' : 'can';
    const started = Date.now();
    const scan = await scanPhoto(photo.uri, scanMode, beers);
    setDetecting(false);

    if (debug) {
      setLastScan({
        ...scan,
        mode: scanMode,
        photo: { uri: photo.uri, width: photo.width, height: photo.height },
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
      router.replace({
        pathname: '/results',
        params: { ids: matches.map((b) => b.id).join(',') },
      });
    } else {
      const match = matches[0];
      if (!match) {
        setNotice({
          title: 'Not in our gluten-free list',
          body: "We couldn't match this to a gluten-free or gluten-removed beer. Assume it contains gluten unless you can confirm otherwise. You can also try searching by name.",
        });
        return;
      }
      router.replace({ pathname: '/beer/[id]', params: { id: String(match.id), viaPhoto: '1' } });
    }
  }, [debug, mode, ready, router]);

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

      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        onCameraReady={() => setReady(true)}
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
        </View>
      ) : null}

      <View style={styles.shutterWrap}>
        <Pressable
          style={[styles.shutter, detecting && styles.shutterDisabled]}
          onPress={takePhoto}
          onLongPress={() => setScanDebugEnabled(!debug)}
          disabled={detecting || !ready}
          accessibilityRole="button"
          accessibilityLabel="Take photo"
        />
        {detecting ? <Text style={styles.detectingText}>Analyzing photo…</Text> : null}
      </View>
    </View>
  );
}

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
  detectingText: { color: colors.white, fontFamily: fonts.sansBold, fontSize: 13 },
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
