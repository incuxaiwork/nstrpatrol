package com.nstrpatrol.app.data

import android.os.SystemClock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

/**
 * Patrol elapsed-time tracker driven by the monotonic clock
 * ([SystemClock.elapsedRealtime]) so a ranger changing the device clock cannot
 * fake the patrol duration.
 *
 * Start time is stored twice: the device wall-clock time ([startWallClockMillis])
 * and the trusted satellite-derived time ([startTrustedMillis], when available).
 * Both are anchored to the monotonic clock; elapsed() is always cheat-proof.
 */
class PatrolTimer {

    private val _running = MutableStateFlow(false)
    val running: StateFlow<Boolean> = _running.asStateFlow()

    private var startElapsedRealtime = 0L
    private var startTrustedMillis = 0L
    private var startWallClockMillis = 0L

    var patrolId: String? = null
        private set

    fun start(trustedUtcNow: Long, wallClockNow: Long) {
        patrolId = UUID.randomUUID().toString()
        startElapsedRealtime = SystemClock.elapsedRealtime()
        startTrustedMillis = trustedUtcNow
        startWallClockMillis = wallClockNow
        _running.value = true
    }

    fun stop() {
        _running.value = false
    }

    fun isRunning(): Boolean = _running.value

    /** Elapsed millis since start, from the monotonic clock. */
    fun elapsedMillis(): Long {
        if (!_running.value) return 0
        return SystemClock.elapsedRealtime() - startElapsedRealtime
    }

    /** True (monotonic-anchored) current time. */
    fun trustedNow(): Long = if (_running.value) startTrustedMillis + elapsedMillis() else startTrustedMillis

    fun wallClockStartMillis(): Long = startWallClockMillis

    /** Formats elapsed millis as "3h 12m" / "45m 10s". */
    fun elapsedFormatted(): String {
        val totalSec = elapsedMillis() / 1000
        val h = totalSec / 3600
        val m = (totalSec % 3600) / 60
        val s = totalSec % 60
        return when {
            h > 0 -> String.format(java.util.Locale.US, "%dh %02dm", h, m)
            m > 0 -> String.format(java.util.Locale.US, "%dm %02ds", m, s)
            else -> String.format(java.util.Locale.US, "%ds", s)
        }
    }
}
