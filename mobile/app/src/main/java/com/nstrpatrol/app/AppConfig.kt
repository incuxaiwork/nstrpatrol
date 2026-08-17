package com.nstrpatrol.app

object AppConfig {
    // GPS recording defaults — overridable via SettingsStore.
    /** How often the recorder loop polls for a new fix (ms). */
    const val DEFAULT_POINT_POLL_MS = 3000L
    /** Minimum distance (m) between successive recorded points. */
    const val DEFAULT_MIN_DISPLACEMENT_M = 0.0
    /** Maximum age (ms) of a GPS fix to accept for recording. */
    const val DEFAULT_MAX_FIX_AGE_MS = 300_000L
    /** Minimum time (ms) between successive recorded points (fallback). */
    const val DEFAULT_SAMPLE_INTERVAL_MS = 5000L

    // Activity recognition
    const val ACTIVITY_UPDATE_INTERVAL_MS = 10_000L
    const val AR_FRESH_MS = 15_000L
    const val AR_MIN_CONFIDENCE = 51
    const val RUN_CADENCE_THRESHOLD = 130f

    // GPS provider — how often LocationManager delivers fixes
    const val DEFAULT_GPS_UPDATE_INTERVAL_MS = 1000L
    const val GPS_POLL_INTERVAL_MS = 2000L

    const val TIME_DIVERGENCE_THRESHOLD_MS = 60_000L
    const val TIME_MIN_FIX_INTERVAL_MS = 30_000L

    const val METRICS_SAMPLE_INTERVAL_MS = 5000L
    const val DEFAULT_RANGER_WEIGHT_KG = 70.0
}
