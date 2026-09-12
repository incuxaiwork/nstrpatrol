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

    // GPS motion gating — separates real travel from satellite drift/teleports.
    /** Per-tick raw displacement (m) suggesting motion (before latching). */
    const val GPS_TICK_DISP_M = 2.5
    /** Consecutive raw-moving ticks required to latch GPS motion on. */
    const val GPS_LATCH_TICKS = 2
    /** Consecutive stationary ticks required to latch motion off. */
    const val GPS_STILL_TICKS = 2
    /** Cumulative raw displacement (m, teleport ticks excluded) that latches motion immediately. */
    const val GPS_LATCH_CUMULATIVE_M = 10.0
    /** Single-tick jumps at/above this with poor accuracy are teleports, never motion. */
    const val GPS_TELEPORT_M = 30.0
    /** Fixes worse than this accuracy (m) are unusable for point recording. */
    const val GPS_MAX_FIX_ACCURACY_M = 50.0
    /** Accuracy above which jumps need speed corroboration. */
    const val GPS_POOR_ACCURACY_M = 20.0
    /** Speed (km/h) that corroborates motion despite poor accuracy. */
    const val GPS_MOVING_SPEED_KMH = 5.0

    // Coverage-event thresholds
    /** A STILL stretch this long inside a patrol triggers DEVICE_STATIONARY. */
    const val DEVICE_STATIONARY_THRESHOLD_MS = 300_000L
    /** Integrity-log capture cadence while a patrol is running. */
    const val INTEGRITY_LOG_INTERVAL_MS = 30_000L
}
