import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listBeers } from '../lib/db';
import { analyzeCanPhoto, analyzeMenuPhoto } from '../lib/ocr';
import { colors, fonts, spacing } from '../lib/theme';

export default function CameraScreen() {
  const { mode } = useLocalSearchParams<{ mode: 'can' | 'menu' }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
    const beers = await listBeers('all', '');

    if (mode === 'menu') {
      const matches = await analyzeMenuPhoto(photo.uri, beers);
      setDetecting(false);
      if (matches.length === 0) {
        setNotice('No beers from the local list were recognized on that menu.');
        return;
      }
      router.replace({
        pathname: '/results',
        params: { ids: matches.map((b) => b.id).join(',') },
      });
    } else {
      const match = await analyzeCanPhoto(photo.uri, beers);
      setDetecting(false);
      if (!match) {
        setNotice("Couldn't match that can/bottle to a beer in the local list.");
        return;
      }
      router.replace({ pathname: '/beer/[id]', params: { id: String(match.id), viaPhoto: '1' } });
    }
  }, [mode, ready, router]);

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.bg }]}>
        <Text style={styles.permissionText}>
          Camera access is needed to scan a beer or menu.
        </Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
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
        <Pressable style={styles.closeButton} onPress={close}>
          <Text style={styles.closeGlyph}>×</Text>
        </Pressable>
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
        <View style={styles.noticeWrap}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      <View style={styles.shutterWrap}>
        <Pressable
          style={[styles.shutter, detecting && styles.shutterDisabled]}
          onPress={takePhoto}
          disabled={detecting || !ready}
        />
        {detecting ? <Text style={styles.detectingText}>Analyzing photo…</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cameraBg },
  centered: { alignItems: 'center', justifyContent: 'center', padding: spacing(7) },
  topBar: { paddingHorizontal: spacing(4) },
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
  noticeWrap: { paddingHorizontal: spacing(6), paddingBottom: spacing(2) },
  noticeText: { color: colors.white, fontSize: 13, textAlign: 'center', fontFamily: fonts.sans },
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
  permissionButtonText: { color: colors.white, fontFamily: fonts.sansBold, fontSize: 14 },
  cancelText: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 13 },
});
