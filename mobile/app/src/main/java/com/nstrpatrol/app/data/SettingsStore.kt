package com.nstrpatrol.app.data

import android.content.Context
import android.content.SharedPreferences
import com.nstrpatrol.app.AppConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Persisted user preferences.
 *
 * The sync mode drives the event-based auto-sync wired in [MainActivity]: when it
 * is [MODE_AUTO] the app flushes local buffers to the backend whenever
 * connectivity is (re)gained (via [ConnectivityObserver]), with no polling.
 * When [MODE_MANUAL] auto-sync is disabled and data only leaves the device on an
 * explicit user action (e.g. stopping a patrol).
 */
class SettingsStore(context: Context) {

    private val prefs =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // ── Sync mode ──────────────────────────────────────────────────────
    private val _syncMode =
        MutableStateFlow(prefs.getString(KEY_SYNC_MODE, DEFAULT_SYNC_MODE) ?: DEFAULT_SYNC_MODE)
    val syncMode: StateFlow<String> = _syncMode.asStateFlow()

    fun setSyncMode(mode: String) {
        val next = if (mode == MODE_AUTO) MODE_AUTO else MODE_MANUAL
        prefs.edit().putString(KEY_SYNC_MODE, next).apply()
        _syncMode.value = next
    }

    // ── GPS recording settings ─────────────────────────────────────────

    private val _gpsPollMs = MutableStateFlow(
        prefs.getLong(KEY_GPS_POLL_MS, AppConfig.DEFAULT_POINT_POLL_MS)
    )
    /** How often the recorder polls for a fix (ms). */
    val gpsPollMs: StateFlow<Long> = _gpsPollMs.asStateFlow()

    fun setGpsPollMs(ms: Long) {
        prefs.edit().putLong(KEY_GPS_POLL_MS, ms).apply()
        _gpsPollMs.value = ms
    }

    private val _gpsSampleIntervalMs = MutableStateFlow(
        prefs.getLong(KEY_GPS_SAMPLE_INTERVAL_MS, AppConfig.DEFAULT_SAMPLE_INTERVAL_MS)
    )
    /** Minimum time between successive recorded points (ms). */
    val gpsSampleIntervalMs: StateFlow<Long> = _gpsSampleIntervalMs.asStateFlow()

    fun setGpsSampleIntervalMs(ms: Long) {
        prefs.edit().putLong(KEY_GPS_SAMPLE_INTERVAL_MS, ms).apply()
        _gpsSampleIntervalMs.value = ms
    }

    private val _gpsMinDisplacementM = MutableStateFlow(
        prefs.getFloat(KEY_GPS_MIN_DISPLACEMENT_M, AppConfig.DEFAULT_MIN_DISPLACEMENT_M.toFloat()).toDouble()
    )
    /** Minimum distance (m) between successive recorded points. */
    val gpsMinDisplacementM: StateFlow<Double> = _gpsMinDisplacementM.asStateFlow()

    fun setGpsMinDisplacementM(m: Double) {
        prefs.edit().putFloat(KEY_GPS_MIN_DISPLACEMENT_M, m.toFloat()).apply()
        _gpsMinDisplacementM.value = m
    }

    private val _gpsMaxFixAgeMs = MutableStateFlow(
        prefs.getLong(KEY_GPS_MAX_FIX_AGE_MS, AppConfig.DEFAULT_MAX_FIX_AGE_MS)
    )
    /** Maximum age (ms) of a GPS fix to accept for recording. */
    val gpsMaxFixAgeMs: StateFlow<Long> = _gpsMaxFixAgeMs.asStateFlow()

    fun setGpsMaxFixAgeMs(ms: Long) {
        prefs.edit().putLong(KEY_GPS_MAX_FIX_AGE_MS, ms).apply()
        _gpsMaxFixAgeMs.value = ms
    }

    private val _gpsUpdateIntervalMs = MutableStateFlow(
        prefs.getLong(KEY_GPS_UPDATE_INTERVAL_MS, AppConfig.DEFAULT_GPS_UPDATE_INTERVAL_MS)
    )
    /** How often the LocationManager delivers GPS fixes (ms). */
    val gpsUpdateIntervalMs: StateFlow<Long> = _gpsUpdateIntervalMs.asStateFlow()

    fun setGpsUpdateIntervalMs(ms: Long) {
        prefs.edit().putLong(KEY_GPS_UPDATE_INTERVAL_MS, ms).apply()
        _gpsUpdateIntervalMs.value = ms
    }

    companion object {
        private const val PREFS_NAME = "nstr_settings"
        const val KEY_SYNC_MODE = "sync_mode"
        const val DEFAULT_SYNC_MODE = "Auto"
        const val MODE_AUTO = "Auto"
        const val MODE_MANUAL = "Manual"

        private const val KEY_GPS_POLL_MS = "gps_poll_ms"
        private const val KEY_GPS_SAMPLE_INTERVAL_MS = "gps_sample_interval_ms"
        private const val KEY_GPS_MIN_DISPLACEMENT_M = "gps_min_displacement_m"
        private const val KEY_GPS_MAX_FIX_AGE_MS = "gps_max_fix_age_ms"
        private const val KEY_GPS_UPDATE_INTERVAL_MS = "gps_update_interval_ms"
    }
}
