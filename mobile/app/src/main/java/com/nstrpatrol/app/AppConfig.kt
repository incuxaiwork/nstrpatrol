package com.nstrpatrol.app

object AppConfig {
    // GPS recording defaults — overridable via SettingsStore.
    /** How often the recorder loop polls for a new fix (ms). */
    const val DEFAULT_POINT_POLL_MS = 3000L
    /** Minimum distance (m) between successive recorded points — 5 m filters GPS jitter when still. */
    const val DEFAULT_MIN_DISPLACEMENT_M = 5.0
    /** When STILL, require this larger displacement to cut stationary drift (GPS wanders ~3-8 m). */
    const val STILL_MIN_DISPLACEMENT_M = 10.0
    /** Tiny jumps below this are always jitter, even when moving slowly. */
    const val JITTER_DISTANCE_M = 3.0
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

    // Coverage-event thresholds
    /** A STILL stretch this long inside a patrol triggers DEVICE_STATIONARY. */
    const val DEVICE_STATIONARY_THRESHOLD_MS = 300_000L
    /** Integrity-log capture cadence while a patrol is running. */
    const val INTEGRITY_LOG_INTERVAL_MS = 30_000L
}
