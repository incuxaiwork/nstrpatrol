package com.nstrpatrol.app.data.db

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * A single recorded patrol position fix.
 *
 * Mirrors the backend [PatrolPoint] Prisma model so rows can be shipped
 * as-is during sync. `syncStatus` starts PENDING and flips once uploaded.
 */
@Entity(
    tableName = "patrol_points",
    indices = [Index(value = ["patrolId", "timestamp"])]
)
data class PatrolPointEntity(
    @PrimaryKey val id: String,
    val patrolId: String,
    val gridId: String? = null,
    val latitude: Double,
    val longitude: Double,
    val altitude: Double? = null,
    val speed: Float? = null,
    val bearing: Float? = null,
    val accuracy: Float? = null,
    val point: String? = null,
    val timestamp: Long,
    val syncStatus: String = "PENDING"
)

/**
 * A single sensor sample captured during a patrol.
 *
 * Mirrors the backend [SensorReading] Prisma model. `type` is one of
 * ACCELEROMETER | GYROSCOPE | MAGNETOMETER | STEP_COUNTER | BAROMETER |
 * MOVEMENT_MODE (the last carries the movement-mode code in `value`).
 */
@Entity(
    tableName = "sensor_readings",
    indices = [Index(value = ["patrolId", "timestamp"])]
)
data class SensorReadingEntity(
    @PrimaryKey val id: String,
    val patrolId: String,
    val timestamp: Long,
    val type: String,
    val x: Float? = null,
    val y: Float? = null,
    val z: Float? = null,
    val value: Float? = null,
    val syncStatus: String = "PENDING"
)

/**
 * A contiguous same-mode activity run generated from movement-mode samples.
 *
 * Mirrors the backend [ActivitySegment] Prisma model. `mode` is one of
 * WALK | BICYCLE | VEHICLE | STATIONARY.
 */
@Entity(
    tableName = "activity_segments",
    indices = [Index(value = ["patrolId", "startTime"])]
)
data class ActivitySegmentEntity(
    @PrimaryKey val id: String,
    val patrolId: String,
    val mode: String,
    val startTime: Long,
    val endTime: Long,
    val confidence: Float? = null,
    val syncStatus: String = "PENDING"
)

/**
 * A coverage/anomaly event raised during a patrol.
 *
 * Mirrors the backend [CoverageEvent] Prisma model. `type` is one of
 * OUTSIDE_BEAT | NON_FOREST | OFF_ROUTE | SPEED_MISMATCH | JUMP |
 * WAYPOINT_MISSED | MOCK_LOCATION | DEVICE_STATIONARY | TIME_TAMPER.
 */
@Entity(
    tableName = "coverage_events",
    indices = [Index(value = ["patrolId", "timestamp"])]
)
data class CoverageEventEntity(
    @PrimaryKey val id: String,
    val patrolId: String,
    val type: String,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val timestamp: Long,
    val syncStatus: String = "PENDING"
)

/**
 * A time-integrity snapshot captured during a patrol.
 *
 * Mirrors the backend [TimeIntegrityLog] Prisma model. Persisted from
 * [com.nstrpatrol.app.time.TrustedTimeManager] state while a patrol runs.
 */
@Entity(
    tableName = "integrity_logs",
    indices = [Index(value = ["patrolId", "timestamp"])]
)
data class IntegrityLogEntity(
    @PrimaryKey val id: String,
    val patrolId: String,
    val timestamp: Long,
    val gnssTimeAvailable: Boolean,
    val divergenceSeconds: Int,
    val autoTimeEnabled: Boolean,
    val tamperDetected: Boolean,
    val satellites: Int,
    val syncStatus: String = "PENDING"
)
