/*
 * Zoom is handled as magnification (1 = not zoomed, 2 = 2×), so a pinch can
 * scale it directly: spreading the fingers to twice their distance doubles
 * it, from any starting zoom. expo-camera's `zoom` prop (0–1) maps to the
 * camera differently per platform, so it's derived from the magnification.
 */

/** Highest magnification offered: past this a phone's zoom is mostly digital blur. */
export const MAX_MAGNIFICATION = 10;

// iOS: factor = maxFactor ^ zoom, and expo-camera doesn't report maxFactor.
// Assuming one keeps the pinch multiplicative; only the exact factor is off.
const IOS_ASSUMED_MAX_FACTOR = 16;

/** The highest magnification to allow, given the back camera's max zoom ratio (Android). */
export function magnificationLimit(platform: string, maxZoomRatio: number | null): number {
  if (platform !== 'android') return MAX_MAGNIFICATION;
  return maxZoomRatio && maxZoomRatio > 1 ? Math.min(MAX_MAGNIFICATION, maxZoomRatio) : 1;
}

/** expo-camera's `zoom` prop for a magnification. */
export function zoomForMagnification(magnification: number, platform: string, maxZoomRatio: number | null): number {
  if (magnification <= 1) return 0;
  if (platform === 'android') {
    // Android: ratio = zoom × maxZoomRatio (and never below 1×).
    return maxZoomRatio && maxZoomRatio > 1 ? Math.min(1, magnification / maxZoomRatio) : 0;
  }
  return Math.min(1, Math.log(magnification) / Math.log(IOS_ASSUMED_MAX_FACTOR));
}

/** The magnification after a pinch of `scale` that started at `start`. */
export function pinchMagnification(start: number, scale: number, limit: number): number {
  return Math.min(limit, Math.max(1, start * scale));
}
