package com.nstrpatrol.app.data

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.nstrpatrol.app.BuildConfig
import com.nstrpatrol.app.data.map.BackendApiClient
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class UpdateInfo(
    val versionCode: Int,
    val versionName: String,
    val notes: String?,
    val sizeBytes: Long,
    val apkKey: String,
    val sha256: String?
)

/**
 * Self-update flow for sideloaded deployments: polls the backend's public
 * /api/app/latest endpoint, downloads a newer APK into app-scoped external
 * storage, verifies its SHA-256 and hands it to the system package installer.
 * Devices must grant "Install unknown apps" once (Android routes the first
 * attempt through Settings when REQUEST_INSTALL_PACKAGES is declared).
 */
object AppUpdater {

    fun fetchLatest(api: BackendApiClient): UpdateInfo? {
        val json = api.getJson("/api/app/latest") ?: return null
        return UpdateInfo(
            versionCode = json.optInt("versionCode", 0),
            versionName = json.optString("versionName"),
            notes = json.optString("notes").ifEmpty { null },
            sizeBytes = json.optLong("sizeBytes", 0L),
            apkKey = json.optString("apkKey"),
            sha256 = json.optString("sha256").ifEmpty { null }
        )
    }

    fun isNewer(info: UpdateInfo): Boolean =
        info.versionCode > BuildConfig.VERSION_CODE

    fun canInstall(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            context.packageManager.canRequestPackageInstalls()

    fun openInstallPermissionSettings(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startActivity(
                Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${context.packageName}")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
    }

    suspend fun downloadAndLaunchInstall(context: Context, info: UpdateInfo): Boolean =
        withContext(Dispatchers.IO) {
            val dest = File(context.getExternalFilesDir(null), "updates/nstr-patrol-update.apk")
            val ok = BackendApiClient().downloadTo("/api/uploads/${info.apkKey}", dest)
            if (!ok) return@withContext false
            if (!sha256Matches(dest, info.sha256)) {
                dest.delete()
                return@withContext false
            }
            withContext(Dispatchers.Main) { launchInstall(context, dest) }
        }

    private fun sha256Matches(file: File, expected: String?): Boolean {
        if (expected.isNullOrEmpty()) return true
        return runCatching {
            val md = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { input ->
                val buf = ByteArray(64 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n <= 0) break
                    md.update(buf, 0, n)
                }
            }
            md.digest().joinToString("") { "%02x".format(it) }
                .equals(expected.lowercase(), ignoreCase = false)
        }.getOrDefault(false)
    }

    private fun launchInstall(context: Context, apk: File): Boolean =
        runCatching {
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apk)
            context.startActivity(
                Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
            true
        }.getOrDefault(false)
}
