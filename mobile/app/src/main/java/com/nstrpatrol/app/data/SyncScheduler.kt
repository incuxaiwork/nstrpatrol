package com.nstrpatrol.app.data

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Schedules background sync per the offline-first architecture:
 *
 *  - a [periodic] work every 30 minutes (while the phone has internet), and
 *  - an immediate one-time sync that WorkManager holds until connectivity is
 *    available, so pending data always flows the moment the ranger reconnects.
 *
 * Both jobs carry a NETWORK_CONNECTED constraint, so they are paused while
 * offline and resume on their own when a connection returns — no user action
 * required, even if the app is closed.
 */
object SyncScheduler {

    private const val PERIODIC_WORK = "nstr-periodic-sync"
    private const val IMMEDIATE_WORK = "nstr-immediate-sync"
    private const val INTERVAL_MINUTES = 30L
    private const val BACKOFF_MINUTES = 10L

    /**
     * Idempotent: called on every app start. Keeps the existing 30-min cadence
     * (KEEP) and re-enqueues an immediate network-gated sync (REPLACE) so a
     * reconnect after the app launches is synced promptly.
     */
    fun schedule(context: Context) {
        val wm = WorkManager.getInstance(context)
        val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        val periodic = PeriodicWorkRequestBuilder<SyncWorker>(INTERVAL_MINUTES, TimeUnit.MINUTES)
            .setConstraints(online)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_MINUTES, TimeUnit.MINUTES)
            .build()
        wm.enqueueUniquePeriodicWork(PERIODIC_WORK, ExistingPeriodicWorkPolicy.KEEP, periodic)

        syncNow(context)
    }

    /** Forces a prompt network-gated sync (used by explicit user actions). */
    fun syncNow(context: Context) {
        val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val work = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(online)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork(IMMEDIATE_WORK, ExistingWorkPolicy.REPLACE, work)
    }
}