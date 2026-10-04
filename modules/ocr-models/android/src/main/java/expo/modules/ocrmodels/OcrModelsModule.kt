package expo.modules.ocrmodels

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.net.Uri
import android.os.SystemClock
import android.util.Log
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.nio.FloatBuffer
import java.nio.LongBuffer
import kotlin.random.Random

data class BenchInput(
  @Field val name: String = "",
  @Field val shape: List<Long> = emptyList(),
  /** "float" (random values) or "int64" (small token ids). */
  @Field val type: String = "float",
) : Record

/**
 * On-device OCR models (ONNX) for label reading: PP-OCRv6 and WATERec (see
 * LabelOcr), plus a timing function used to choose them.
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
      "PP-OCRv6_small_det.onnx", "PP-OCRv6_small_rec.onnx", "PP-OCRv6.chars.txt",
      "WATERec-RS-encoder.onnx", "WATERec-RS-decoder.onnx", "WATERec-RS.chars.txt",
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

    AsyncFunction("benchmarkAsync") Coroutine { modelFile: String, inputs: List<BenchInput>, runs: Int, provider: String ->
      val options = OrtSession.SessionOptions().apply {
        setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
        setIntraOpNumThreads(4)
        if (provider == "xnnpack") addXnnpack(mapOf("intra_op_num_threads" to "4"))
      }
      val loadStart = SystemClock.elapsedRealtime()
      env.createSession(open(modelFile), options).use { session ->
        val loadMs = SystemClock.elapsedRealtime() - loadStart
        val tensors = inputs.associate { it.name to tensor(it) }
        try {
          val times = (0..runs).map {
            val start = SystemClock.elapsedRealtime()
            session.run(tensors).close()
            SystemClock.elapsedRealtime() - start
          }
          val steady = times.drop(1).sorted()
          val result = mapOf(
            "model" to modelFile,
            "provider" to provider,
            "loadMs" to loadMs,
            "firstMs" to times.first(),
            "medianMs" to steady[steady.size / 2],
            "minMs" to steady.first(),
          )
          Log.i("GlutenlessBench", result.toString())
          result
        } finally {
          tensors.values.forEach { it.close() }
        }
      }
    }
  }

  private fun tensor(input: BenchInput): OnnxTensor {
    val shape = input.shape.toLongArray()
    val count = shape.fold(1L) { a, b -> a * b }.toInt()
    return if (input.type == "int64") {
      OnnxTensor.createTensor(env, LongBuffer.wrap(LongArray(count) { Random.nextLong(1, 90) }), shape)
    } else {
      OnnxTensor.createTensor(env, FloatBuffer.wrap(FloatArray(count) { Random.nextFloat() * 2 - 1 }), shape)
    }
  }
}
