package expo.modules.ocrmodels

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.media.ExifInterface
import android.os.SystemClock
import java.nio.FloatBuffer
import java.nio.LongBuffer
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/** A text line found in the photo, in the photo's pixels. */
data class OcrLine(
  val left: Int,
  val top: Int,
  val width: Int,
  val height: Int,
  /** PP-OCRv6's reading and its mean character confidence (0–1). */
  val text: String,
  val score: Float,
  /** WATERec's reading of the same crop, for lines PP-OCRv6 was unsure of. */
  var waterecText: String? = null,
  var waterecScore: Float? = null,
)

/**
 * Reads a label photo with PP-OCRv6 (find text lines, then read each) and,
 * for lines it was unsure of, WATERec (artistic lettering). A port of
 * PaddleX's pipeline: the same resizing, normalization and decoding as the
 * models were trained with, so results match the desktop bench
 * (tools/ocr-bench). Each text region gets its smallest rotated rectangle
 * and is read straightened, as PaddleX does; axis-aligned boxes garbled
 * tilted labels (a Peroni bottle held at an angle read as "S / 爱 / ssss").
 */
class LabelOcr(private val env: OrtEnvironment, private val open: (String) -> ByteArray) {
  // ORT-format models, already optimized for the phone when converted
  // (tools/ocr-bench/build_ort.sh): the app's minimal runtime can't optimize.
  private fun session(name: String) =
    env.createSession(open(name), OrtSession.SessionOptions().apply { setIntraOpNumThreads(4) })

  private fun lines(name: String) = String(open(name), Charsets.UTF_8).split('\n').dropLastWhile { it.isEmpty() }

  private val det by lazy { session("PP-OCRv6_small_det.ort") }
  private val rec by lazy { session("PP-OCRv6_small_rec.ort") }
  private val waterecEncoder by lazy { session("WATERec-RS-encoder.ort") }
  private val waterecDecoder by lazy { session("WATERec-RS-decoder.ort") }
  private val paddleChars by lazy { lines("PP-OCRv6.chars.txt") }
  private val waterecChars by lazy { lines("WATERec-RS.chars.txt") }

  val timings = mutableMapOf<String, Long>()

  private inline fun <T> timed(name: String, block: () -> T): T {
    val start = SystemClock.elapsedRealtime()
    return block().also { timings[name] = (timings[name] ?: 0) + SystemClock.elapsedRealtime() - start }
  }

  /** `detectMaxSide`: the long side the photo is shrunk to for finding text (960 for a label; more for a menu's small print). */
  fun read(path: String, waterecBelow: Float, maxWaterecLines: Int, detectMaxSide: Float = DET_MAX_SIDE): List<OcrLine> {
    timings.clear()
    val photo = timed("decode") { loadUpright(path) }
    try {
      val boxes = timed("detect") { detect(photo, detectMaxSide) }
      val lines = timed("read") { boxes.map { box -> readLine(photo, box) } }
      timed("waterec") {
        lines.indices
          .filter { lines[it].score < waterecBelow && boxes[it].width >= 8 && boxes[it].height >= 8 }
          .sortedByDescending { boxes[it].width * boxes[it].height }
          .take(maxWaterecLines)
          .forEach { i ->
            val crop = upright(straightCrop(photo, boxes[i]))
            val (text, score) = waterec(crop)
            crop.recycle()
            lines[i].waterecText = text
            lines[i].waterecScore = score
          }
      }
      return lines
    } finally {
      photo.recycle()
    }
  }

  /** The photo with its EXIF rotation applied, as camera and library photos may carry one. */
  private fun loadUpright(path: String): Bitmap {
    val bitmap = BitmapFactory.decodeFile(path) ?: throw IllegalArgumentException("Could not read image: $path")
    val degrees = when (ExifInterface(path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
      ExifInterface.ORIENTATION_ROTATE_90 -> 90f
      ExifInterface.ORIENTATION_ROTATE_180 -> 180f
      ExifInterface.ORIENTATION_ROTATE_270 -> 270f
      else -> 0f
    }
    if (degrees == 0f) return bitmap
    val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, Matrix().apply { postRotate(degrees) }, true)
    bitmap.recycle()
    return rotated
  }

  /**
   * A text region's rotated rectangle, in the photo's pixels: its center,
   * its sides (width along `angle`, in radians within ±45°), and the
   * axis-aligned bounds around it for reporting.
   */
  private data class Box(val cx: Float, val cy: Float, val width: Float, val height: Float, val angle: Float) {
    private val corners: List<Pair<Float, Float>>
      get() {
        val c = cos(angle); val s = sin(angle)
        return listOf(-1f to -1f, 1f to -1f, 1f to 1f, -1f to 1f).map { (u, v) ->
          val x = u * width / 2; val y = v * height / 2
          (cx + x * c - y * s) to (cy + x * s + y * c)
        }
      }
    val left get() = corners.minOf { it.first }
    val top get() = corners.minOf { it.second }
    val right get() = corners.maxOf { it.first }
    val bottom get() = corners.maxOf { it.second }
  }

  /**
   * PP-OCRv6 detection (a DB text-probability map), as PaddleX runs it: long
   * side at most `maxSide` (PaddleX: 960 px), sides rounded to multiples of 32, BGR with ImageNet
   * normalization; pixels above 0.2 are text, a region's smallest rotated
   * rectangle needs a mean probability of 0.45, and is grown by unclip ratio 1.4.
   */
  private fun detect(photo: Bitmap, maxSide: Float): List<Box> {
    val ratio = min(1f, maxSide / max(photo.width, photo.height).toFloat())
    val w = max(32, ((photo.width * ratio) / 32f).roundToInt() * 32)
    val h = max(32, ((photo.height * ratio) / 32f).roundToInt() * 32)
    val scaled = Bitmap.createScaledBitmap(photo, w, h, true)
    val input = FloatArray(3 * w * h)
    val pixels = IntArray(w * h).also { scaled.getPixels(it, 0, w, 0, 0, w, h) }
    if (scaled !== photo) scaled.recycle()
    val plane = w * h
    for (i in 0 until plane) {
      val p = pixels[i]
      // Channels in BGR order, each with its ImageNet mean/std in that order.
      input[i] = (((p and 0xFF) / 255f) - 0.485f) / 0.229f
      input[plane + i] = ((((p shr 8) and 0xFF) / 255f) - 0.456f) / 0.224f
      input[2 * plane + i] = ((((p shr 16) and 0xFF) / 255f) - 0.406f) / 0.225f
    }
    val prob = OnnxTensor.createTensor(env, FloatBuffer.wrap(input), longArrayOf(1, 3, h.toLong(), w.toLong())).use { tensor ->
      det.run(mapOf("x" to tensor)).use { result ->
        val out = result[0] as OnnxTensor
        FloatArray(plane).also { out.floatBuffer.get(it) }
      }
    }

    val visited = BooleanArray(plane)
    val queue = IntArray(plane)
    val boxes = mutableListOf<Box>()
    val sx = photo.width / w.toFloat()
    val sy = photo.height / h.toFloat()
    for (start in 0 until plane) {
      if (prob[start] <= DET_THRESH || visited[start]) continue
      // One connected region of text pixels (8-connected, like cv2.findContours), with each row's extent.
      var head = 0
      var tail = 0
      queue[tail++] = start
      visited[start] = true
      val rowMin = HashMap<Int, Int>()
      val rowMax = HashMap<Int, Int>()
      while (head < tail) {
        val i = queue[head++]
        val x = i % w
        val y = i / w
        if (x < (rowMin[y] ?: Int.MAX_VALUE)) rowMin[y] = x
        if (x > (rowMax[y] ?: -1)) rowMax[y] = x
        for (dy in -1..1) for (dx in -1..1) {
          val nx = x + dx
          val ny = y + dy
          if ((dx == 0 && dy == 0) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          val n = ny * w + nx
          if (visited[n] || prob[n] <= DET_THRESH) continue
          visited[n] = true
          queue[tail++] = n
        }
      }
      // Pixel corners on the region's outline: enough for its convex hull.
      val points = ArrayList<Pair<Float, Float>>(rowMin.size * 4)
      for ((y, x0) in rowMin) {
        val x1 = rowMax.getValue(y) + 1f
        points.add(x0.toFloat() to y.toFloat()); points.add(x1 to y.toFloat())
        points.add(x0.toFloat() to y + 1f); points.add(x1 to y + 1f)
      }
      val rect = minAreaRect(convexHull(points)) ?: continue
      if (min(rect.width, rect.height) < DET_MIN_SIZE) continue
      if (meanProbability(prob, w, h, rect) < DET_BOX_THRESH) continue
      // Unclip: grow by area × ratio / perimeter, as PaddleX's pyclipper offset does.
      val d = rect.width * rect.height * DET_UNCLIP / (2f * (rect.width + rect.height))
      val grown = rect.copy(width = rect.width + 2 * d, height = rect.height + 2 * d)
      if (min(grown.width, grown.height) < DET_MIN_SIZE + 2) continue
      // To the photo's pixels (the two scales differ only by rounding to 32).
      boxes.add(Box(grown.cx * sx, grown.cy * sy, grown.width * (sx + sy) / 2, grown.height * (sx + sy) / 2, grown.angle))
    }
    // Top to bottom, then left to right, as PaddleX sorts them.
    return boxes.sortedWith(compareBy<Box> { (it.top / 10).toInt() }.thenBy { it.left })
  }

  /** Andrew's monotone chain: the convex hull, counter-clockwise. */
  private fun convexHull(points: List<Pair<Float, Float>>): List<Pair<Float, Float>> {
    val sorted = points.distinct().sortedWith(compareBy<Pair<Float, Float>> { it.first }.thenBy { it.second })
    if (sorted.size < 3) return sorted
    fun cross(o: Pair<Float, Float>, a: Pair<Float, Float>, b: Pair<Float, Float>) =
      (a.first - o.first) * (b.second - o.second) - (a.second - o.second) * (b.first - o.first)
    val hull = ArrayList<Pair<Float, Float>>()
    for (pass in 0..1) {
      val start = hull.size
      for (p in if (pass == 0) sorted else sorted.asReversed()) {
        while (hull.size >= start + 2 && cross(hull[hull.size - 2], hull[hull.size - 1], p) <= 0) hull.removeAt(hull.size - 1)
        hull.add(p)
      }
      hull.removeAt(hull.size - 1)
    }
    return hull
  }

  /**
   * The smallest-area rectangle around a convex hull (rotating calipers: one
   * of its sides lies along a hull edge), turned so its angle is within ±45°.
   */
  private fun minAreaRect(hull: List<Pair<Float, Float>>): Box? {
    if (hull.size < 3) return null
    var best: Box? = null
    var bestArea = Float.MAX_VALUE
    for (i in hull.indices) {
      val (x0, y0) = hull[i]
      val (x1, y1) = hull[(i + 1) % hull.size]
      val angle = atan2(y1 - y0, x1 - x0)
      val c = cos(angle); val s = sin(angle)
      var minU = Float.MAX_VALUE; var maxU = -Float.MAX_VALUE; var minV = Float.MAX_VALUE; var maxV = -Float.MAX_VALUE
      for ((x, y) in hull) {
        val u = x * c + y * s
        val v = -x * s + y * c
        minU = min(minU, u); maxU = max(maxU, u); minV = min(minV, v); maxV = max(maxV, v)
      }
      val area = (maxU - minU) * (maxV - minV)
      if (area < bestArea) {
        bestArea = area
        val cu = (minU + maxU) / 2
        val cv = (minV + maxV) / 2
        best = Box(cu * c - cv * s, cu * s + cv * c, maxU - minU, maxV - minV, angle)
      }
    }
    var box = best ?: return null
    // Normalize the angle to (-45°, 45°], swapping sides on each quarter turn.
    var a = box.angle
    var bw = box.width
    var bh = box.height
    while (a > PI / 4) { a -= (PI / 2).toFloat(); val t = bw; bw = bh; bh = t }
    while (a <= -PI / 4) { a += (PI / 2).toFloat(); val t = bw; bw = bh; bh = t }
    box = box.copy(width = bw, height = bh, angle = a)
    return box
  }

  /** PaddleX's box score: the mean text probability inside the rectangle. */
  private fun meanProbability(prob: FloatArray, w: Int, h: Int, box: Box): Float {
    val c = cos(box.angle); val s = sin(box.angle)
    var sum = 0f
    var count = 0
    for (y in max(0, box.top.toInt())..min(h - 1, box.bottom.toInt())) {
      for (x in max(0, box.left.toInt())..min(w - 1, box.right.toInt())) {
        val dx = x + 0.5f - box.cx
        val dy = y + 0.5f - box.cy
        if (abs(dx * c + dy * s) <= box.width / 2 && abs(-dx * s + dy * c) <= box.height / 2) {
          sum += prob[y * w + x]; count++
        }
      }
    }
    return if (count > 0) sum / count else 0f
  }

  /** The rectangle cut out of the photo straightened, as PaddleX's get_rotate_crop_image does. */
  private fun straightCrop(photo: Bitmap, box: Box): Bitmap {
    val cw = max(1, box.width.roundToInt())
    val ch = max(1, box.height.roundToInt())
    val crop = Bitmap.createBitmap(cw, ch, Bitmap.Config.ARGB_8888)
    val matrix = Matrix().apply {
      postTranslate(-box.cx, -box.cy)
      postRotate((-box.angle * 180 / PI).toFloat())
      postTranslate(cw / 2f, ch / 2f)
    }
    Canvas(crop).drawBitmap(photo, matrix, Paint(Paint.FILTER_BITMAP_FLAG))
    return crop
  }

  /** A crop at least 1.5 times taller than wide holds vertical text: turn it as PaddleX does (np.rot90). */
  private fun upright(crop: Bitmap): Bitmap {
    if (crop.height < crop.width * 1.5f) return crop
    val turned = Bitmap.createBitmap(crop, 0, 0, crop.width, crop.height, Matrix().apply { postRotate(-90f) }, true)
    crop.recycle()
    return turned
  }

  /**
   * PP-OCRv6 recognition, as PaddleX runs it: 48 px high, width from the
   * crop's aspect (at least 320, padded), BGR scaled to -1..1; CTC decoding
   * over "blank" + the model's characters + space.
   */
  private fun readLine(photo: Bitmap, box: Box): OcrLine {
    val crop = upright(straightCrop(photo, box))
    val ratio = crop.width / crop.height.toFloat()
    val padded = min(REC_MAX_WIDTH, max(REC_MIN_WIDTH, (REC_HEIGHT * ratio).toInt()))
    val resizedW = min(padded, ceil(REC_HEIGHT * ratio).toInt()).coerceAtLeast(1)
    val scaled = Bitmap.createScaledBitmap(crop, resizedW, REC_HEIGHT, true)
    crop.recycle()
    val pixels = IntArray(resizedW * REC_HEIGHT).also { scaled.getPixels(it, 0, resizedW, 0, 0, resizedW, REC_HEIGHT) }
    scaled.recycle()
    val plane = padded * REC_HEIGHT
    val input = FloatArray(3 * plane) // zeros: PaddleX pads with 0 after normalizing
    for (y in 0 until REC_HEIGHT) for (x in 0 until resizedW) {
      val p = pixels[y * resizedW + x]
      val i = y * padded + x
      input[i] = (p and 0xFF) / 127.5f - 1f
      input[plane + i] = ((p shr 8) and 0xFF) / 127.5f - 1f
      input[2 * plane + i] = ((p shr 16) and 0xFF) / 127.5f - 1f
    }
    val (text, score) = OnnxTensor.createTensor(env, FloatBuffer.wrap(input), longArrayOf(1, 3, REC_HEIGHT.toLong(), padded.toLong())).use { tensor ->
      rec.run(mapOf("x" to tensor)).use { result ->
        val out = result[0] as OnnxTensor
        val shape = out.info.shape
        val steps = shape[1].toInt()
        val classes = shape[2].toInt()
        val probs = FloatArray(steps * classes).also { out.floatBuffer.get(it) }
        ctcDecode(probs, steps, classes)
      }
    }
    val left = max(0, box.left.toInt())
    val top = max(0, box.top.toInt())
    return OcrLine(left, top, min(photo.width, box.right.roundToInt()) - left, min(photo.height, box.bottom.roundToInt()) - top, text, score)
  }

  private fun ctcDecode(probs: FloatArray, steps: Int, classes: Int): Pair<String, Float> {
    val text = StringBuilder()
    var scoreSum = 0f
    var count = 0
    var previous = -1
    for (t in 0 until steps) {
      var best = 0
      for (c in 1 until classes) if (probs[t * classes + c] > probs[t * classes + best]) best = c
      if (best != 0 && best != previous) {
        text.append(if (best - 1 < paddleChars.size) paddleChars[best - 1] else " ")
        scoreSum += probs[t * classes + best]
        count++
      }
      previous = best
    }
    return text.toString() to (if (count > 0) scoreSum / count else 0f)
  }

  /**
   * WATERec, as OpenOCR runs it: resized so its area is 1024–4096 px with
   * sides in multiples of 4, RGB scaled to -1..1; then the encoder once and
   * the decoder a token at a time from BOS until EOS (at most 25).
   */
  private fun waterec(crop: Bitmap): Pair<String, Float> {
    var w = crop.width.toFloat()
    var h = crop.height.toFloat()
    val area = w * h
    if (area > WATEREC_MAX_AREA) {
      val s = sqrt(WATEREC_MAX_AREA / area); w = max(1f, (w * s).toInt().toFloat()); h = max(1f, (h * s).toInt().toFloat())
    } else if (area < WATEREC_MIN_AREA) {
      val s = sqrt(WATEREC_MIN_AREA / area); w = max(1f, (w * s).toInt().toFloat()); h = max(1f, (h * s).toInt().toFloat())
    }
    val newW = max(1, w.toInt() / 4) * 4
    val newH = max(1, h.toInt() / 4) * 4
    val scaled = Bitmap.createScaledBitmap(crop, newW, newH, true)
    val pixels = IntArray(newW * newH).also { scaled.getPixels(it, 0, newW, 0, 0, newW, newH) }
    scaled.recycle()
    val plane = newW * newH
    val input = FloatArray(3 * plane)
    for (i in 0 until plane) {
      val p = pixels[i]
      input[i] = ((p shr 16) and 0xFF) / 127.5f - 1f
      input[plane + i] = ((p shr 8) and 0xFF) / 127.5f - 1f
      input[2 * plane + i] = (p and 0xFF) / 127.5f - 1f
    }
    val memory = OnnxTensor.createTensor(env, FloatBuffer.wrap(input), longArrayOf(1, 3, newH.toLong(), newW.toLong())).use { tensor ->
      waterecEncoder.run(mapOf("image" to tensor)).use { result ->
        val out = result[0] as OnnxTensor
        Pair(out.info.shape, FloatArray(out.info.shape.fold(1L) { a, b -> a * b }.toInt()).also { out.floatBuffer.get(it) })
      }
    }
    val tokens = mutableListOf(WATEREC_BOS)
    val text = StringBuilder()
    var scoreSum = 0f
    OnnxTensor.createTensor(env, FloatBuffer.wrap(memory.second), memory.first).use { memoryTensor ->
      repeat(WATEREC_MAX_LEN) {
        val (next, prob) = OnnxTensor.createTensor(env, LongBuffer.wrap(tokens.toLongArray()), longArrayOf(1, tokens.size.toLong())).use { tokenTensor ->
          waterecDecoder.run(mapOf("memory" to memoryTensor, "tokens" to tokenTensor)).use { result ->
            val out = result[0] as OnnxTensor
            val probs = FloatArray(out.info.shape.last().toInt()).also { out.floatBuffer.get(it) }
            val best = probs.indices.maxBy { probs[it] }
            best.toLong() to probs[best]
          }
        }
        if (next == WATEREC_EOS) return text.toString() to (if (text.isNotEmpty()) scoreSum / text.length else 0f)
        text.append(waterecChars[next.toInt()])
        scoreSum += prob
        tokens.add(next)
      }
    }
    return text.toString() to (if (text.isNotEmpty()) scoreSum / text.length else 0f)
  }

  companion object {
    const val DET_MAX_SIDE = 960f
    const val DET_THRESH = 0.2f
    const val DET_BOX_THRESH = 0.45f
    const val DET_UNCLIP = 1.4f
    const val DET_MIN_SIZE = 3
    const val REC_HEIGHT = 48
    const val REC_MIN_WIDTH = 320
    const val REC_MAX_WIDTH = 3200
    const val WATEREC_MIN_AREA = 64f * 16f
    const val WATEREC_MAX_AREA = 256f * 16f
    const val WATEREC_BOS = 95L
    const val WATEREC_EOS = 0L
    const val WATEREC_MAX_LEN = 25
  }
}
