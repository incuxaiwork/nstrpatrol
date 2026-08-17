package com.nstrpatrol.app.data

import android.content.Context
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

    override suspend fun doWork(): Result {
        val app = applicationContext
        // No signed-in session and nothing to do with a token.
        val auth = AuthSession(app)
        if (!auth.restore()) return Result.success()

        // Respect the ranger's sync setting: Manual disables automatic uploads.
        if (SettingsStore(app).syncMode.value != SettingsStore.MODE_AUTO) return Result.success()

        val dao = NstrDatabase.getInstance(app).telemetryDao()
        val summary = SyncManager.syncNow(dao, auth.apiClient())

        // Only transient network problems warrant WorkManager retries; server-side
        // or auth errors should not hammer the API (the next 30-min run retries
        // whatever rows remain PENDING anyway).
        val retriable = summary.error
            ?.let { it.startsWith("HTTP 0") || it.startsWith("Cannot reach") }
            ?: false
        return if (retriable) Result.retry() else Result.success()
    }
}