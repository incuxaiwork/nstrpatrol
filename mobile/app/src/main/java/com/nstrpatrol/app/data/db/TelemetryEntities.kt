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
