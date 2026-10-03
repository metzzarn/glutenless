import { requireOptionalNativeModule } from 'expo';

type NativeCameraZoom = { getBackCameraMaxZoomRatio(): number | null };

// Android only; iOS maps expo-camera's zoom differently and doesn't need it.
const native = requireOptionalNativeModule<NativeCameraZoom>('CameraZoom');

/** The back camera's maximum zoom ratio (e.g. 30 for 30×), or null when unknown. */
export function getBackCameraMaxZoomRatio(): number | null {
  try {
    return native?.getBackCameraMaxZoomRatio() ?? null;
  } catch {
    return null;
  }
}
