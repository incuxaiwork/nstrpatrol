package com.nstrpatrol.app.data

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/** Asynchronously decodes/fetches local or S3 remote images off the main UI thread. */
@Composable
fun rememberAsyncBitmap(path: String?): ImageBitmap? {
    if (path.isNullOrEmpty()) return null
    var bitmapState by remember(path) { mutableStateOf<ImageBitmap?>(null) }
    LaunchedEffect(path) {
        withContext(Dispatchers.IO) {
            val loaded = PhotoUtils.loadBitmap(path)
            if (loaded != null) {
                bitmapState = loaded.asImageBitmap()
            }
        }
    }
    return bitmapState
}

/** Shared helpers for decoding captured photos with EXIF rotation applied. */
object PhotoUtils {

    /** Decode [file] downscaled to at most [maxDim] px on the long side, EXIF-rotated. */
    fun decodeScaled(file: File, maxDim: Int = 1024): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (bounds.outWidth / sample > maxDim || bounds.outHeight / sample > maxDim) {
            sample *= 2
        }
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        val bitmap = BitmapFactory.decodeFile(file.absolutePath, options) ?: return null
        return applyExifOrientation(bitmap, file)
    }

    /** Universal bitmap loader supporting local file paths, captures directory fallbacks, and remote S3 keys/URLs. */
    fun loadBitmap(path: String): Bitmap? {
        if (path.isEmpty()) return null
        val f = File(path)
        if (f.exists()) return decodeScaled(f)

        val capturesDir = PhotoStore.dir()
        val filename = path.split("/").last()
        val localCapture = File(capturesDir, filename)
        if (localCapture.exists()) return decodeScaled(localCapture)

        val stem = filename.substringBeforeLast(".")
        if (stem.isNotEmpty() && capturesDir.exists()) {
            val matched = capturesDir.listFiles()?.firstOrNull { file ->
                file.name == filename ||
                file.name.contains(stem) ||
                (stem.length > 5 && file.name.contains(stem.take(8)))
            }
            if (matched != null && matched.exists()) return decodeScaled(matched)
        }

        val base = com.nstrpatrol.app.BuildConfig.API_BASE_URL.trimEnd('/')
        val urlString = when {
            path.startsWith("http://") || path.startsWith("https://") -> path
            else -> "$base/api/uploads/${path.trimStart('/')}"
        }

        return runCatching {
            val conn = java.net.URL(urlString).openConnection() as java.net.HttpURLConnection
            conn.connectTimeout = 10_000
            conn.readTimeout = 15_000
            val bytes = conn.inputStream.use { it.readBytes() }
            if (bytes.isNotEmpty()) {
                // Cache downloaded S3 image locally so subsequent opens load instantly offline
                runCatching { localCapture.writeBytes(bytes) }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            } else null
        }.getOrNull()
    }

    private fun applyExifOrientation(bitmap: Bitmap, file: File): Bitmap {
        val orientation = runCatching {
            ExifInterface(file.absolutePath).getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL
            )
        }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> {
                matrix.postRotate(90f)
                matrix.postScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_TRANSVERSE -> {
                matrix.postRotate(270f)
                matrix.postScale(-1f, 1f)
            }
            else -> return bitmap
        }
        val rotated = Bitmap.createBitmap(
            bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true
        )
        if (rotated !== bitmap) bitmap.recycle()
        return rotated
    }
}
