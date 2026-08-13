package com.nstrpatrol.app

object AppConfig {
    const val SAMPLE_INTERVAL_MS = 30_000L
    const val ACTIVITY_UPDATE_INTERVAL_MS = 10_000L
    const val GPS_UPDATE_INTERVAL_MS = 1000L
    const val GPS_POLL_INTERVAL_MS = 2000L

    const val TIME_DIVERGENCE_THRESHOLD_MS = 60_000L
    const val TIME_MIN_FIX_INTERVAL_MS = 30_000L

    const val AR_FRESH_MS = 15_000L
    const val AR_MIN_CONFIDENCE = 51
    const val RUN_CADENCE_THRESHOLD = 130f

    const val METRICS_SAMPLE_INTERVAL_MS = 5000L
    const val DEFAULT_RANGER_WEIGHT_KG = 70.0
}
