package com.nstrpatrol.app.data

import android.content.Context
import android.os.SystemClock
import com.nstrpatrol.app.data.db.NstrDatabase
import com.nstrpatrol.app.time.GpsTelemetryManager
import com.nstrpatrol.app.time.TelemetryRecorder
import com.nstrpatrol.app.time.TrustedTimeManager
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

    @Volatile
    private var appContext: Context? = null

    private val _running = MutableStateFlow(false)
    val running: StateFlow<Boolean> = _running.asStateFlow()

    private var startElapsedRealtime = 0L
    private var startTrustedMillis = 0L
    private var startWallClockMillis = 0L

    var patrolId: String? = null
        private set

    /** Inject app context for SharedPreferences persistence. */
    fun initContext(context: Context) {
        appContext = context.applicationContext
    }

    fun start(trustedUtcNow: Long, wallClockNow: Long) {
        patrolId = UUID.randomUUID().toString()
        startElapsedRealtime = SystemClock.elapsedRealtime()
        startTrustedMillis = trustedUtcNow
        startWallClockMillis = wallClockNow
        _running.value = true
        persist()
    }

    fun stop() {
        _running.value = false
        clearPersisted()
    }

    fun isRunning(): Boolean = _running.value

    // ── Persistence: survives process death on swipe-up ──────────────────

    private fun prefs() = appContext?.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** Write current timer state to SharedPreferences. */
    fun persist() {
        val p = prefs() ?: return
        if (!_running.value || patrolId == null) {
            p.edit().clear().apply()
            return
        }
        p.edit()
            .putString("patrol_id", patrolId)
            .putLong("start_elapsed", startElapsedRealtime)
            .putLong("start_trusted", startTrustedMillis)
            .putLong("start_wallclock", startWallClockMillis)
            .apply()
    }

    /**
     * Restore timer state from SharedPreferences after process death.
     * Returns true if a live patrol was restored.  Returns false (and clears
     * prefs) if no saved state exists or the device was rebooted since start
     * (monotonic clock no longer valid).
     */
    fun restore(): Boolean {
        val p = prefs() ?: return false
        val id = p.getString("patrol_id", null) ?: return false
        val elapsed = p.getLong("start_elapsed", 0)
        // After a reboot elapsedRealtime resets to ~0; the saved value would
        // be larger → negative elapsed → stale patrol.
        if (SystemClock.elapsedRealtime() < elapsed) {
            p.edit().clear().apply()
            return false
        }
        patrolId = id
        startElapsedRealtime = elapsed
        startTrustedMillis = p.getLong("start_trusted", 0)
        startWallClockMillis = p.getLong("start_wallclock", 0)
        _running.value = true
        return true
    }

    /** Remove persisted state (called on explicit stop). */
    fun clearPersisted() {
        prefs()?.edit()?.clear()?.apply()
    }

    companion object {
        private const val PREFS_NAME = "patrol_timer_state"
    }

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

/**
 * Process-wide patrol state owner.
 *
 * The timer used to be created with `remember { }` inside the Activity, so an
 * Activity recreation silently replaced it with a blank instance (no patrolId,
 * not running) while the foreground service kept the process — and the real
 * patrol — alive. Stop flows then fell back to wall-clock time and orphan
 * recovery could finalize a live patrol. Holding the instance here keeps one
 * authoritative timer for the whole process lifetime.
 */
object PatrolState {
    val timer: PatrolTimer = PatrolTimer()

    @Volatile
    private var graph: PatrolTelemetryGraph? = null

    /**
     * Process-wide telemetry components. Both used to be `remember { }` in the
     * Activity, so an Activity recreation silently replaced them mid-patrol:
     * the old recorder stopped sampling with its composition while the timer
     * (and the foreground service) kept going, and nothing restarted sampling
     * afterwards — patrols lost their GPS trace from that point on. Holding
     * them here gives every composition the SAME instances.
     */
    fun telemetryGraph(context: Context): PatrolTelemetryGraph =
        graph ?: synchronized(this) {
            graph ?: PatrolTelemetryGraph(context.applicationContext).also { graph = it }
        }

    /** Inject app context into the timer so persistence works. Called once. */
    fun initContext(context: Context) {
        timer.initContext(context.applicationContext)
    }
}

/**
 * Owns the long-lived telemetry pipeline for the whole process lifetime.
 * Created lazily on first access and never recreated.
 */
class PatrolTelemetryGraph(appContext: Context) {
    val settings = SettingsStore(appContext)
    val timeManager = TrustedTimeManager(appContext)
    val database = NstrDatabase.getInstance(appContext)
    val telemetry = GpsTelemetryManager(appContext, settings)
    val recorder = TelemetryRecorder(
        appContext = appContext,
        patrolTimer = PatrolState.timer,
        telemetryManager = telemetry,
        timeManager = timeManager,
        dao = database.telemetryDao(),
        settings = settings
    )
}
