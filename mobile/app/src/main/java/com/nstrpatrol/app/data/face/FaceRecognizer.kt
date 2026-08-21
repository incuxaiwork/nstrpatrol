package com.nstrpatrol.app.data.face

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.Rect
import androidx.exifinterface.media.ExifInterface
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.tensorflow.lite.Interpreter
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.sqrt

/**
 * On-device face matching using a vendored MobileFaceNet TFLite model
 * (input 112x112x3 normalized to [-1,1], output 192-dim L2-normalized embedding).
 * Faces are located with ML Kit, square-cropped from the source bitmap, and
 * compared via cosine similarity against the officer's enrolled reference.
 */
object FaceRecognizer {

    /** Cosine similarity at or above which two embeddings count as the same person. */
    const val MATCH_THRESHOLD = 0.5f

    private const val MODEL_ASSET = "mobilefacenet.tflite"
    private const val INPUT_SIZE = 112
    private const val EMBEDDING_DIM = 192

    @Volatile
    private var interpreter: Interpreter? = null

    private fun load(context: Context): Interpreter {
        interpreter?.let { return it }
        synchronized(this) {
            interpreter?.let { return it }
            val buffer: MappedByteBuffer = context.assets.openFd(MODEL_ASSET).use { fd ->
                java.io.FileInputStream(fd.fileDescriptor).channel
                    .map(FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength)
            }
            return Interpreter(buffer, Interpreter.Options().apply { numThreads = 2 })
                .also { interpreter = it }
        }
    }

    /**
     * Computes the face embedding for an image file (JPEG). Applies EXIF rotation,
     * detects the largest face, crops it, and runs the model. Returns null when no
     * usable face is found or decoding fails.
     */
    suspend fun embed(context: Context, imageFile: File): FloatArray? = withContext(Dispatchers.Default) {
        val bitmap = decodeUpright(imageFile) ?: return@withContext null
        embed(context, bitmap)
    }

    /** See [embed]; takes a bitmap directly. */
    suspend fun embed(context: Context, bitmap: Bitmap): FloatArray? = withContext(Dispatchers.Default) {
        val box = detectLargestFace(context, bitmap) ?: return@withContext null
        val crop = cropFace(bitmap, box)
        val emb = try {
            runModel(load(context), crop)
        } catch (t: Throwable) {
            android.util.Log.e("FaceRecognizer", "model inference failed", t)
            null
        }
        android.util.Log.d("FaceRecognizer", "embedding computed: ${emb?.size}")
        emb
    }

    /** Cosine similarity of two L2-normalized embeddings, clamped into [0,1]. */
    fun similarity(a: FloatArray, b: FloatArray): Float {
        if (a.size != b.size) return 0f
        var dot = 0f
        for (i in a.indices) dot += a[i] * b[i]
        return dot.coerceIn(0f, 1f)
    }

    fun l2Normalize(v: FloatArray): FloatArray {
        var sum = 0f
        for (x in v) sum += x * x
        val norm = sqrt(sum)
        if (norm > 0f) for (i in v.indices) v[i] /= norm
        return v
    }

    /** Serializes an embedding for storage / transport (CSV of floats). */
    fun encode(embedding: FloatArray): String = embedding.joinToString(",") { it.toString() }

    /** Parses a CSV embedding produced by [encode]; null when malformed. */
    fun decode(csv: String?): FloatArray? {
        if (csv.isNullOrBlank()) return null
        val parts = csv.split(",")
        if (parts.size != EMBEDDING_DIM) return null
        return runCatching { FloatArray(EMBEDDING_DIM) { parts[it].trim().toFloat() } }.getOrNull()
    }

    /** Returns the largest detected face's bounding box, or null when no face is found.
     * Runs a second, looser pass before giving up so marginal selfies still enroll. */
    private suspend fun detectLargestFace(context: Context, bitmap: Bitmap): Rect? {
        detectWithOptions(context, bitmap, 0.15f)?.let { return it }
        return detectWithOptions(context, bitmap, 0.06f)
    }

    private suspend fun detectWithOptions(context: Context, bitmap: Bitmap, minFaceSize: Float): Rect? =
        suspendCancellableCoroutine { cont ->
            val options = FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                .setMinFaceSize(minFaceSize)
                .build()
            val detector = FaceDetection.getClient(options)
            val image = InputImage.fromBitmap(bitmap, 0)
            detector.process(image)
                .addOnSuccessListener { faces ->
                    android.util.Log.d("FaceRecognizer", "faces=${faces.size} minFace=$minFaceSize ${bitmap.width}x${bitmap.height}")
                    val biggest = faces.maxByOrNull { it.boundingBox.width() * it.boundingBox.height() }
                    cont.resume(biggest?.boundingBox)
                }
                .addOnFailureListener { e ->
                    android.util.Log.e("FaceRecognizer", "face detection failed", e)
                    cont.resume(null)
                }
                .addOnCompleteListener { detector.close() }
        }

    /** Expands the face box to a generous square (MobileFaceNet wants head-and-shoulders margin). */
    private fun cropFace(bitmap: Bitmap, box: Rect): Bitmap {
        val cx = box.exactCenterX()
        val cy = box.exactCenterY()
        // Scale height more than width: the model expects forehead-to-chin coverage.
        val side = (box.height() * 1.9f).toInt().coerceAtLeast((box.width() * 1.4f).toInt())
        val left = (cx - side / 2f).toInt().coerceAtLeast(0)
        val top = (cy - side / 2.2f).toInt().coerceAtLeast(0)
        val right = (left + side).coerceAtMost(bitmap.width)
        val bottom = (top + side).coerceAtMost(bitmap.height)
        val w = right - left
        val h = bottom - top
        if (w <= 10 || h <= 10) return bitmap
        val cropped = Bitmap.createBitmap(bitmap, left, top, w, h)
        return Bitmap.createScaledBitmap(cropped, INPUT_SIZE, INPUT_SIZE, true)
    }

    private fun runModel(interp: Interpreter, face112: Bitmap): FloatArray? {
        val input = ByteBuffer.allocateDirect(1 * INPUT_SIZE * INPUT_SIZE * 3 * 4)
            .order(ByteOrder.nativeOrder())
        val pixels = IntArray(INPUT_SIZE * INPUT_SIZE)
        face112.getPixels(pixels, 0, INPUT_SIZE, 0, 0, INPUT_SIZE, INPUT_SIZE)
        for (p in pixels) {
            input.putFloat(((p shr 16 and 0xFF) - 127.5f) / 127.5f)
            input.putFloat(((p shr 8 and 0xFF) - 127.5f) / 127.5f)
            input.putFloat(((p and 0xFF) - 127.5f) / 127.5f)
        }
        input.rewind()
        val output = Array(1) { FloatArray(EMBEDDING_DIM) }
        interp.run(input, output)
        return l2Normalize(output[0])
    }

    /** Decodes a JPEG honoring its full EXIF orientation (incl. mirrored front-camera variants); null when unreadable. */
    private fun decodeUpright(file: File): Bitmap? = runCatching {
        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, opts)
        var sample = 1
        while (opts.outWidth / sample > 1024 || opts.outHeight / sample > 1024) sample *= 2
        val decodeOpts = BitmapFactory.Options().apply { inSampleSize = sample }
        val raw = BitmapFactory.decodeFile(file.absolutePath, decodeOpts) ?: return@runCatching null
        val orientation = ExifInterface(file.absolutePath).getAttributeInt(
            ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL
        )
        android.util.Log.d("FaceRecognizer", "decoded ${raw.width}x${raw.height} exif=$orientation")
        if (orientation == ExifInterface.ORIENTATION_NORMAL ||
            orientation == ExifInterface.ORIENTATION_UNDEFINED
        ) return@runCatching raw
        val m = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> m.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_ROTATE_180 -> m.postRotate(180f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> {
                m.postRotate(180f); m.postScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_TRANSPOSE -> {
                m.postRotate(90f); m.postScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_ROTATE_90 -> m.postRotate(90f)
            ExifInterface.ORIENTATION_TRANSVERSE -> {
                m.postRotate(-90f); m.postScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_ROTATE_270 -> m.postRotate(270f)
        }
        Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true)
    }.getOrNull()
}
