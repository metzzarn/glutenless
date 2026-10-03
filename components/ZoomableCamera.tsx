import { CameraView } from 'expo-camera';
import { useMemo, useRef, useState, type RefObject } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { getBackCameraMaxZoomRatio } from '../modules/camera-zoom';
import { magnificationLimit, pinchMagnification, zoomForMagnification } from '../lib/cameraZoom';
import { fonts, spacing } from '../lib/theme';

/**
 * The back camera with pinch to zoom. Zoom state lives here, not in the
 * camera screen, so a pinch only re-renders the camera view.
 */
export function ZoomableCamera({
  cameraRef,
  active,
  onCameraReady,
  style,
}: {
  cameraRef: RefObject<CameraView | null>;
  /** Off while another screen is on top. */
  active: boolean;
  onCameraReady: () => void;
  style: StyleProp<ViewStyle>;
}) {
  const [magnification, setMagnification] = useState(1);
  const magnificationRef = useRef(1);

  const maxZoomRatio = useMemo(() => (Platform.OS === 'android' ? getBackCameraMaxZoomRatio() : null), []);
  const limit = magnificationLimit(Platform.OS, maxZoomRatio);

  const pinchStartRef = useRef(1);

  // The worklets Babel plugin turns gesture callbacks into worklets, which get
  // their own copies of captured plain variables: a `let` set in onStart reads
  // as its initial value in onUpdate, so every pinch restarted from 1×. Refs
  // are objects, which the copies share.
  const pinch = useMemo(() => {
    const update = (next: number) => {
      magnificationRef.current = next;
      setMagnification(next);
    };
    return Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => {
        pinchStartRef.current = magnificationRef.current;
      })
      .onUpdate((e) => update(pinchMagnification(pinchStartRef.current, e.scale, limit)));
  }, [limit]);

  const reset = () => {
    magnificationRef.current = 1;
    setMagnification(1);
  };

  return (
    <GestureDetector gesture={pinch}>
      <View style={style}>
        {active ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            zoom={zoomForMagnification(magnification, Platform.OS, maxZoomRatio)}
            onCameraReady={onCameraReady}
          />
        ) : null}
        {magnification > 1.05 ? (
          <Pressable style={styles.zoomPill} onPress={reset} hitSlop={8} accessibilityRole="button">
            <Text style={styles.zoomPillText}>
              {/* The iOS factor is approximate (see lib/cameraZoom.ts), so no number there. */}
              {Platform.OS === 'android' ? `${magnification.toFixed(1)}×` : 'Zoomed'} · tap to reset
            </Text>
          </Pressable>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  zoomPill: {
    position: 'absolute',
    bottom: spacing(3),
    alignSelf: 'center',
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  zoomPillText: { color: '#FFFFFF', fontFamily: fonts.sansBold, fontSize: 12 },
});
