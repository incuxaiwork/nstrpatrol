package com.nstrpatrol.app.time

import android.util.Log
import com.nstrpatrol.app.AppConfig
import com.nstrpatrol.app.data.db.ActivitySegmentEntity
import com.nstrpatrol.app.data.db.CoverageEventEntity
import com.nstrpatrol.app.data.db.PatrolSessionEntity
import com.nstrpatrol.app.data.db.TelemetryDao
import java.util.UUID
import kotlin.math.abs

/**
 * Derives higher-level audit data from the raw telemetry a patrol recorded.
 *
 * Run once at patrol stop. Produces two PENDING row families that mirror the
 * backend Prisma models:
 *
 *  - [ActivitySegmentEntity] — contiguous same-mode runs of WALK | BICYCLE |
 *    VEHICLE | STATIONARY, derived from the MOVEMENT_MODE sensor stream.
 *  - [CoverageEventEntity] — anomalies raised from the raw track:
 *      * SPEED_MISMATCH — the detected movement mode contradicts the patrol's
 *        declared method (e.g. WALK patrol riding a vehicle).
 *      * JUMP — two consecutive GPS fixes displaced far more than the elapsed
 *        time allows (teleport / signal jump).
 *      * DEVICE_STATIONARY — the device stayed STILL for a long stretch of an
 *        otherwise moving patrol.
 *
 * Integrity logs (TIME_TAMPER etc.) are captured live during the patrol by
 * [TelemetryRecorder] from [TrustedTimeManager] state, so they are not
 * re-derived here.
 */
object PatrolDataGenerator {

    private const val TAG = "PatrolDataGenerator"

    /** Speed (km/h) below which a fast mode on a slow patrol is suspicious. */
    private const val JUMP_MIN_SPEED_KMH = 60.0

    /**
     * Generates and persists segments + coverage events for [patrolId].
     * Safe to call repeatedly: existing rows are not re-created.
     */
    suspend fun generateForPatrol(patrolId: String, dao: TelemetryDao) {
        val session = dao.patrolSession(patrolId) ?: return
        generateActivitySegments(patrolId, session, dao)
        generateCoverageEvents(patrolId, session, dao)
    }

    private suspend fun generateActivitySegments(
        patrolId: String,
        session: PatrolSessionEntity,
        dao: TelemetryDao
    ) {
        if (dao.activitySegmentsForPatrol(patrolId).isNotEmpty()) return
        val samples = dao.movementSamplesForPatrol(patrolId)
        if (samples.isEmpty()) return
        val interval = sampleIntervalMs(samples)

        val segments = mutableListOf<ActivitySegmentEntity>()
        var begin = 0
        var i = 1
        while (i <= samples.size) {
            val changed = i == samples.size || samples[i].value != samples[begin].value
            if (changed) {
                val mode = mapToActivityMode(MovementMode.fromCode(samples[begin].value))
                if (mode != null) {
                    val start = samples[begin].timestamp
                    val last = samples[i - 1].timestamp
                    val end = if (i < samples.size) {
                        (samples[i].timestamp - 1).coerceAtLeast(start)
                    } else {
                        last + interval
                    }
                    if (end > start) {
                        segments += ActivitySegmentEntity(
                            id = "as-${UUID.randomUUID()}",
                            patrolId = patrolId,
                            mode = mode,
                            startTime = start,
                            endTime = end
                        )
                    }
                }
                begin = i
            }
            i++
        }

        if (segments.isNotEmpty()) {
            dao.insertActivitySegments(segments)
            Log.d(TAG, "Generated ${segments.size} activity segments for patrol $patrolId")
        }
    }

    private suspend fun generateCoverageEvents(
        patrolId: String,
        session: PatrolSessionEntity,
        dao: TelemetryDao
    ) {
        if (dao.coverageEventsForPatrol(patrolId).isNotEmpty()) return
        val events = mutableListOf<CoverageEventEntity>()

        // 1. SPEED_MISMATCH — declared method vs detected movement.
        val declared = mapPatrolTypeToActivityMode(session.patrolType)
        val detected = mapDetectedMethodToActivityMode(session.detectedMethod)
        if (declared != null && detected != null) {
            val mismatch = when (declared) {
                "WALK" -> detected == "VEHICLE" || detected == "BICYCLE"
                "BICYCLE" -> detected == "VEHICLE"
                else -> false
            }
            if (mismatch) {
                events += CoverageEventEntity(
                    id = "cv-${UUID.randomUUID()}",
                    patrolId = patrolId,
                    type = "SPEED_MISMATCH",
                    timestamp = session.endTime ?: session.startTime
                )
            }
        }

        // 2. JUMP — consecutive fixes displaced too far for the elapsed time.
        events += detectJumps(patrolId, dao)

        // 3. DEVICE_STATIONARY — long STILL stretch while patrol was active.
        events += detectDeviceStationary(patrolId, session, dao)

        if (events.isNotEmpty()) {
            dao.insertCoverageEvents(events)
            Log.d(TAG, "Generated ${events.size} coverage events for patrol $patrolId")
        }
    }

    private suspend fun detectJumps(patrolId: String, dao: TelemetryDao): List<CoverageEventEntity> {
        val points = dao.patrolPointsOrdered(patrolId)
        if (points.size < 2) return emptyList()
        val events = mutableListOf<CoverageEventEntity>()
        for (i in 1 until points.size) {
            val a = points[i - 1]
            val b = points[i]
            val dtSec = (b.timestamp - a.timestamp) / 1000.0
            if (dtSec <= 0) continue
            val distM = haversine(a.latitude, a.longitude, b.latitude, b.longitude)
            val speedKmh = distM / dtSec * 3.6
            if (speedKmh > JUMP_MIN_SPEED_KMH) {
                events += CoverageEventEntity(
                    id = "cv-${UUID.randomUUID()}",
                    patrolId = patrolId,
                    type = "JUMP",
                    latitude = b.latitude,
                    longitude = b.longitude,
                    timestamp = b.timestamp
                )
            }
        }
        return events
    }

    private suspend fun detectDeviceStationary(
        patrolId: String,
        session: PatrolSessionEntity,
        dao: TelemetryDao
    ): List<CoverageEventEntity> {
        val samples = dao.movementSamplesForPatrol(patrolId)
        if (samples.isEmpty()) return emptyList()
        val thresholdMs = AppConfig.DEVICE_STATIONARY_THRESHOLD_MS
        val events = mutableListOf<CoverageEventEntity>()
        var runStart = samples[0].timestamp
        var runValue = samples[0].value
        var i = 1
        while (i <= samples.size) {
            val changed = i == samples.size || samples[i].value != runValue
            if (changed) {
                val runEnd = if (i < samples.size) samples[i].timestamp else (samples[i - 1].timestamp + 1000)
                if (runValue == MovementMode.STILL.code && runEnd - runStart >= thresholdMs) {
                    events += CoverageEventEntity(
                        id = "cv-${UUID.randomUUID()}",
                        patrolId = patrolId,
                        type = "DEVICE_STATIONARY",
                        timestamp = runStart
                    )
                }
                if (i < samples.size) {
                    runStart = samples[i].timestamp
                    runValue = samples[i].value
                }
            }
            i++
        }
        return events
    }

    private fun sampleIntervalMs(samples: List<com.nstrpatrol.app.data.db.MovementSample>): Long {
        var minGap = Long.MAX_VALUE
        for (i in 1 until samples.size) {
            val gap = samples[i].timestamp - samples[i - 1].timestamp
            if (gap > 0 && gap < minGap) minGap = gap
        }
        return if (minGap == Long.MAX_VALUE) 5000L else minGap
    }

    /** Maps a mobile movement mode to the backend ActivityMode enum (WALK/BICYCLE/VEHICLE/STATIONARY). */
    fun mapToActivityMode(mode: MovementMode): String? = when (mode) {
        MovementMode.WALKING, MovementMode.RUNNING -> "WALK"
        MovementMode.CYCLING -> "BICYCLE"
        MovementMode.VEHICLE -> "VEHICLE"
        MovementMode.STILL -> "STATIONARY"
        MovementMode.UNKNOWN -> null
    }

    private fun mapPatrolTypeToActivityMode(type: String?): String? = when (type) {
        "WALK", "BICYCLE", "VEHICLE", "STATIONARY" -> type
        "Cycle" -> "BICYCLE"
        "Motor Cycle", "Four Wheeler", "Boat", "Aerial" -> "VEHICLE"
        else -> null
    }

    private fun mapDetectedMethodToActivityMode(method: String?): String? = when (method) {
        "WALKING", "RUNNING" -> "WALK"
        "CYCLING" -> "BICYCLE"
        "VEHICLE" -> "VEHICLE"
        "STILL" -> "STATIONARY"
        else -> null
    }

    private fun haversine(aLat: Double, aLon: Double, bLat: Double, bLon: Double): Double {
        val dLat = Math.toRadians(bLat - aLat)
        val dLon = Math.toRadians(bLon - aLon)
        val a = kotlin.math.sin(dLat / 2).let { it * it } +
            kotlin.math.cos(Math.toRadians(aLat)) *
            kotlin.math.cos(Math.toRadians(bLat)) *
            kotlin.math.sin(dLon / 2).let { it * it }
        val c = 2 * kotlin.math.atan2(kotlin.math.sqrt(a), kotlin.math.sqrt(1 - a))
        return 6_371_000.0 * c
    }
}
