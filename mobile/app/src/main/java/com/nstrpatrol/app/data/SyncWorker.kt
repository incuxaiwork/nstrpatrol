package com.nstrpatrol.app.data

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.nstrpatrol.app.data.db.NstrDatabase

/**
 * Background sync worker. Uploads every PENDING row (patrol sessions, points,
 * sensor readings, incidents) to the backend.
 *
 * Offline-first: it never deletes or rewrites local data — it only flips
 * PENDING -> SYNCED after a successful upload. If the device is offline the
 * work is held by WorkManager (network constraint) and runs automatically the
 * moment connectivity returns. Transport failures are returned as retryable so
 * WorkManager backs off and tries again.
 */
class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    companion object {
        private const val TAG = "SyncWorker"
    }

    override suspend fun doWork(): Result {
        val app = applicationContext
        // No signed-in session and nothing to do with a token.
        val auth = AuthSession(app)
        if (!auth.restore()) return Result.success()

        // Respect the ranger's sync setting: Manual disables automatic uploads.
        if (SettingsStore(app).syncMode.value != SettingsStore.MODE_AUTO) return Result.success()

        val dao = NstrDatabase.getInstance(app).telemetryDao()
        // Push local changes, then pull remote changes (bidirectional sync).
        val pushSummary = SyncManager.syncNow(dao, auth.apiClient(), auth.deviceId())
        val pulled = runCatching { SyncManager.pullFromBackend(dao, auth.apiClient()) }.getOrDefault(0)
        if (pulled > 0) Log.i(TAG, "Auto-pulled $pulled patrols from backend")

        // Only transient network problems warrant WorkManager retries; server-side
        // or auth errors should not hammer the API (the next 30-min run retries
        // whatever rows remain PENDING anyway).
        val retriable = pushSummary.error
            ?.let { it.startsWith("HTTP 0") || it.startsWith("Cannot reach") }
            ?: false
        return if (retriable) Result.retry() else Result.success()
    }
}