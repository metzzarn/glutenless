package expo.modules.labelreader

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.ImagePart
import com.google.mlkit.genai.prompt.ModelPreference
import com.google.mlkit.genai.prompt.ModelReleaseStage
import com.google.mlkit.genai.prompt.SystemInstruction
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.generateContentRequest
import com.google.mlkit.genai.prompt.generationConfig
import com.google.mlkit.genai.prompt.modelConfig
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.flow.first

/** How to ask: lets the debug screen compare setups for how faithfully they read a label. */
data class ReadOptions(
  /** Longest side, in pixels, of the photo sent to the model. */
  @Field val maxSide: Int = 1536,
  /** "fast" or "full" (accuracy over speed); null for the system default. */
  @Field val preference: String? = null,
  /** The newest model in preview instead of the stable one. */
  @Field val preview: Boolean = false,
  @Field val thinking: Boolean = false,
  @Field val systemInstruction: String? = null,
) : Record

/**
 * Reads the text on a beer label with Gemini Nano, the on-device model in
 * Android AICore (ML Kit GenAI Prompt API). Only some phones have it, so
 * every call reports availability instead of assuming it.
 */
class LabelReaderModule : Module() {
  private val model by lazy { Generation.getClient() }
  private val configuredModels = mutableMapOf<Pair<String?, Boolean>, GenerativeModel>()

  private fun modelFor(options: ReadOptions): GenerativeModel {
    if (options.preference == null && !options.preview) return model
    return configuredModels.getOrPut(options.preference to options.preview) {
      Generation.getClient(
        generationConfig {
          modelConfig = modelConfig {
            if (options.preference == "full") preference = ModelPreference.FULL
            if (options.preference == "fast") preference = ModelPreference.FAST
            if (options.preview) releaseStage = ModelReleaseStage.PREVIEW
          }
        },
      )
    }
  }

  override fun definition() = ModuleDefinition {
    Name("LabelReader")

    AsyncFunction("getStatusAsync") Coroutine { options: ReadOptions? ->
      currentStatus(modelFor(options ?: ReadOptions()))
    }

    // Suspends until the download finishes or fails.
    AsyncFunction("downloadAsync") Coroutine { options: ReadOptions? ->
      val model = modelFor(options ?: ReadOptions())
      val result = guarded {
        model.download().first { it is DownloadStatus.DownloadCompleted || it is DownloadStatus.DownloadFailed }
      }
      if (result is DownloadStatus.DownloadFailed) throw codedException(result.e)
      currentStatus(model)
    }

    AsyncFunction("readLabelAsync") Coroutine { uri: String, prompt: String, options: ReadOptions ->
      val model = modelFor(options)
      val status = currentStatus(model)
      if (status != "available") {
        throw CodedException("ERR_MODEL_NOT_READY", "This model setup is $status on this phone", null)
      }
      val bitmap = decodeScaled(uri, options.maxSide)
      try {
        val configure: com.google.mlkit.genai.prompt.GenerateContentRequest.Builder.() -> Unit = {
          // Transcription, not creativity: always the most likely reading.
          temperature = 0f
          topK = 1
          maxOutputTokens = 512
          enableThinking = options.thinking
        }
        val request = options.systemInstruction?.let {
          generateContentRequest(SystemInstruction(it), ImagePart(bitmap), TextPart(prompt), configure)
        } ?: generateContentRequest(ImagePart(bitmap), TextPart(prompt), configure)
        val response = guarded { model.generateContent(request) }
        response.candidates.firstOrNull()?.text.orEmpty()
      } finally {
        bitmap.recycle()
      }
    }

    OnDestroy {
      model.close()
      configuredModels.values.forEach { it.close() }
    }
  }

  private suspend fun currentStatus(model: GenerativeModel): String {
    val status = try {
      model.checkStatus()
    } catch (e: GenAiException) {
      // Phones without AICore report this as an error rather than a status.
      return "unavailable"
    }
    return when (status) {
      FeatureStatus.AVAILABLE -> "available"
      FeatureStatus.DOWNLOADABLE -> "downloadable"
      FeatureStatus.DOWNLOADING -> "downloading"
      else -> "unavailable"
    }
  }

  /**
   * Decodes the photo at most `maxSide` pixels on its longest side. A 12 MP
   * camera photo is far more than the model uses, and decoding it whole costs
   * ~50 MB of memory.
   */
  private fun decodeScaled(uri: String, maxSide: Int): Bitmap {
    val path = Uri.parse(uri).path ?: throw CodedException("ERR_BAD_URI", "Not a file URI: $uri", null)
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    if (bounds.outWidth <= 0) throw CodedException("ERR_BAD_IMAGE", "Could not read image: $uri", null)

    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
    val decoded = BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample })
      ?: throw CodedException("ERR_BAD_IMAGE", "Could not decode image: $uri", null)

    val longest = maxOf(decoded.width, decoded.height)
    if (longest <= maxSide) return decoded
    val scale = maxSide.toFloat() / longest
    val scaled = Bitmap.createScaledBitmap(decoded, (decoded.width * scale).toInt(), (decoded.height * scale).toInt(), true)
    decoded.recycle()
    return scaled
  }

  private inline fun <T> guarded(block: () -> T): T =
    try {
      block()
    } catch (e: GenAiException) {
      throw codedException(e)
    }

  private fun codedException(e: GenAiException) =
    CodedException("ERR_GENAI_${e.errorCode}", e.message ?: "Gemini Nano error ${e.errorCode}", e)
}
