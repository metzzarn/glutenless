package expo.modules.ocrmodels

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
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
 * On-device OCR models (ONNX) for label reading. For now it only times them,
 * to decide whether PP-OCRv6 and WATERec are fast enough on a phone.
 */
class OcrModelsModule : Module() {
  private val env by lazy { OrtEnvironment.getEnvironment() }

  override fun definition() = ModuleDefinition {
    Name("OcrModels")

    /** Where models are read from: the app's external files dir, writable over adb. */
    Function("modelDir") {
      appContext.reactContext?.getExternalFilesDir("onnx")?.absolutePath
    }

    AsyncFunction("benchmarkAsync") Coroutine { modelFile: String, inputs: List<BenchInput>, runs: Int, provider: String ->
      val path = File(appContext.reactContext?.getExternalFilesDir("onnx"), modelFile).absolutePath
      val options = OrtSession.SessionOptions().apply {
        setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
        setIntraOpNumThreads(4)
        if (provider == "xnnpack") addXnnpack(mapOf("intra_op_num_threads" to "4"))
      }
      val loadStart = SystemClock.elapsedRealtime()
      env.createSession(path, options).use { session ->
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
