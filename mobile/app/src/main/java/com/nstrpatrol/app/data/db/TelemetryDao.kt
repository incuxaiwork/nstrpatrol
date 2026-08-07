package com.nstrpatrol.app.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface TelemetryDao {

    @Insert
    suspend fun insertPoint(point: PatrolPointEntity)

    @Insert
    suspend fun insertPoints(points: List<PatrolPointEntity>)

    @Insert
    suspend fun insertReading(reading: SensorReadingEntity)

    @Insert
    suspend fun insertReadings(readings: List<SensorReadingEntity>)

    @Query("SELECT COUNT(*) FROM patrol_points")
    fun totalPoints(): Flow<Int>

    @Query("SELECT COUNT(*) FROM sensor_readings")
    fun totalReadings(): Flow<Int>

    @Query("SELECT COUNT(*) FROM patrol_points WHERE patrolId = :patrolId")
    fun pointsForPatrol(patrolId: String): Flow<Int>

    @Query("SELECT COUNT(*) FROM sensor_readings WHERE patrolId = :patrolId")
    fun readingsForPatrol(patrolId: String): Flow<Int>

    @Query("SELECT COUNT(*) FROM patrol_points WHERE syncStatus = 'PENDING'")
    fun pendingPoints(): Flow<Int>

    @Query("SELECT COUNT(*) FROM sensor_readings WHERE syncStatus = 'PENDING'")
    fun pendingReadings(): Flow<Int>

    @Query(
        "SELECT * FROM sensor_readings WHERE type = 'MOVEMENT_MODE' " +
            "ORDER BY timestamp DESC LIMIT 1"
    )
    suspend fun latestMovementReading(): SensorReadingEntity?
}
