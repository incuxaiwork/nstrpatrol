package com.nstrpatrol.app.time

import android.os.SystemClock
import com.google.android.gms.location.DetectedActivity

/**
 * Classification of how a ranger is moving during a patrol.
 *
 * The integer [code] is the stable on-disk representation (persisted as the
 * `value` of a MOVEMENT_MODE sensor reading) so renames never break history.
 */
enum class MovementMode(val code: Int, val label: String) {
    UNKNOWN(0, "Unknown"),
    STILL(1, "Still"),
    WALKING(2, "Walking"),
    RUNNING(3, "Running"),
    CYCLING(4, "Cycling"),
    VEHICLE(5, "Vehicle");

    companion object {
        fun fromCode(code: Int): MovementMode =
            entries.firstOrNull { it.code == code } ?: UNKNOWN

        /**
         * Maps the Google Activity Recognition result to a movement mode.
         * ON_FOOT is disambiguated using the confidence split between the
         * walking and running activities in the full result list.
         */
        fun fromGoogleDetectedActivity(
            activity: DetectedActivity,
            all: List<DetectedActivity>
        ): MovementMode = when (activity.type) {
            DetectedActivity.IN_VEHICLE -> VEHICLE
            DetectedActivity.ON_BICYCLE -> CYCLING
            DetectedActivity.RUNNING -> RUNNING
            DetectedActivity.WALKING -> WALKING
            DetectedActivity.STILL -> STILL
            DetectedActivity.ON_FOOT -> {
                val running = all.firstOrNull { it.type == DetectedActivity.RUNNING }
                val walking = all.firstOrNull { it.type == DetectedActivity.WALKING }
                if ((running?.confidence ?: 0) > (walking?.confidence ?: 0) &&
                    (running?.confidence ?: 0) > 0
                ) {
                    RUNNING
                } else {
                    WALKING
                }
            }
            else -> UNKNOWN
        }
    }
}

/** Where the current movement classification came from. */
enum class ModeSource {
    /** Google Activity Recognition client (needs ACTIVITY_RECOGNITION). */
    GMS_ACTIVITY_RECOGNITION,

    /** Speed-band / step-cadence rules applied locally. */
    HEURISTIC
}

/**
 * Live snapshot of the movement classification exposed to the UI.
 */
data class MovementInfo(
    val mode: MovementMode = MovementMode.UNKNOWN,
    val confidence: Float = 0f,
    val source: ModeSource = ModeSource.HEURISTIC,
    val speedKmh: Float? = null,
    val stepCadence: Float? = null,
    val sinceElapsedRealtime: Long = SystemClock.elapsedRealtime()
)
