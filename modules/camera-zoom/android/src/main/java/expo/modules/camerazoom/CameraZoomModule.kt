package expo.modules.camerazoom

import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The back camera's maximum zoom ratio. expo-camera's Android `zoom` prop is
 * a fraction of this ratio but doesn't expose it, so a pinch can't otherwise
 * scale the actual magnification.
 */
class CameraZoomModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CameraZoom")

    Function("getBackCameraMaxZoomRatio") {
      val manager = appContext.reactContext?.getSystemService(CameraManager::class.java) ?: return@Function null
      // CameraX, under expo-camera, uses the first back-facing camera.
      val id = manager.cameraIdList.firstOrNull {
        manager.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
      } ?: return@Function null
      val characteristics = manager.getCameraCharacteristics(id)
      val ratioRange = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        characteristics.get(CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE)
      } else {
        null
      }
      ratioRange?.upper ?: characteristics.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM)
    }
  }
}
