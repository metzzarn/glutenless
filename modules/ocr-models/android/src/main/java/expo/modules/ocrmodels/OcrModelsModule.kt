package expo.modules.ocrmodels

import ai.onnxruntime.OrtEnvironment
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * On-device OCR models for label reading: PP-OCRv6 and WATERec (see
 * LabelOcr), run by a minimal ONNX Runtime built for them
 * (tools/ocr-bench/build_ort.sh), which only loads ORT-format models.
 *
 * Models ship in the APK's assets (ocr-models/, put there by
 * tools/ocr-bench/install_models.sh). A file of the same name in the app's
 * external files dir (onnx/) takes precedence, for trying other model
 * variants over adb.
 */
class OcrModelsModule : Module() {
  private val env by lazy { OrtEnvironment.getEnvironment() }
  private val context get() = appContext.reactContext ?: throw IllegalStateException("No React context")
  private val overrides get() = context.getExternalFilesDir("onnx")

  private fun open(name: String): ByteArray {
    val override = overrides?.let { File(it, name) }
    if (override != null && override.isFile) return override.readBytes()
    return context.assets.open("$ASSET_DIR/$name").use { it.readBytes() }
  }

  private fun has(name: String) =
    overrides?.let { File(it, name).isFile } == true || runCatching { context.assets.open("$ASSET_DIR/$name").close() }.isSuccess

  private val ocr by lazy { LabelOcr(env, ::open) }

  companion object {
    const val ASSET_DIR = "ocr-models"
    val REQUIRED = listOf(
      "PP-OCRv6_small_det.ort", "PP-OCRv6_small_rec.ort", "PP-OCRv6.chars.txt",
      "WATERec-RS-encoder.ort", "WATERec-RS-decoder.ort", "WATERec-RS.chars.txt",
    )
  }

  override fun definition() = ModuleDefinition {
    Name("OcrModels")

    /** Whether every model the reader needs is bundled (or pushed over adb). */
    Function("isReady") { REQUIRED.all { has(it) } }

    /** Where model overrides are read from: the app's external files dir, writable over adb. */
    Function("modelDir") {
      appContext.reactContext?.getExternalFilesDir("onnx")?.absolutePath
    }

    /** Debug: file:// URIs of the photos in the app's external files dir (images/), for reading them all. */
    Function("listImages") {
      appContext.reactContext?.getExternalFilesDir("images")?.listFiles()
        ?.filter { it.isFile }?.sortedBy { it.name }?.map { Uri.fromFile(it).toString() } ?: emptyList<String>()
    }

    /**
     * Reads a label photo (a file:// URI). Lines PP-OCRv6 read with a mean
     * confidence below `waterecBelow` are read again by WATERec, the largest
     * `maxWaterecLines` of them.
     */
    AsyncFunction("readAsync") { uri: String, waterecBelow: Double, maxWaterecLines: Int ->
      synchronized(ocr) {
        val path = Uri.parse(uri).path ?: throw IllegalArgumentException("Not a file URI: $uri")
        val lines = ocr.read(path, waterecBelow.toFloat(), maxWaterecLines)
        mapOf(
          "lines" to lines.map {
            mapOf(
              "text" to it.text,
              "score" to it.score.toDouble(),
              "frame" to mapOf("left" to it.left, "top" to it.top, "width" to it.width, "height" to it.height),
              "waterecText" to it.waterecText,
              "waterecScore" to it.waterecScore?.toDouble(),
            )
          },
          "timings" to ocr.timings.toMap(),
        )
      }
    }
  }
}
