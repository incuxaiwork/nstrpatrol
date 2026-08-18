package com.nstrpatrol.app.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface TelemetryDao {

    @Insert
    suspend fun insertPoint(point: PatrolPointEntity)

    @Insert(onConflict = androidx.room.OnConflictStrategy.REPLACE)
    suspend fun insertIncident(incident: IncidentEntity)

    @Query("SELECT * FROM incidents WHERE syncStatus = 'PENDING'")
    suspend fun pendingIncidents(): List<IncidentEntity>

    @Query("UPDATE incidents SET syncStatus = 'SYNCED' WHERE syncStatus = 'PENDING'")
    suspend fun markIncidentsSynced()

    @Query("SELECT * FROM incidents ORDER BY occurredAt DESC")
    suspend fun allIncidents(): List<IncidentEntity>

    @Query("SELECT * FROM incidents WHERE id = :id")
    suspend fun incidentById(id: String): IncidentEntity?

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

    @Query(
        "SELECT COALESCE(SUM(value), 0) FROM sensor_readings " +
            "WHERE patrolId = :patrolId AND type = 'STEP_COUNTER'"
    )
    suspend fun stepsForPatrol(patrolId: String): Double

    @Query(
        "SELECT COALESCE(SUM(value), 0) FROM sensor_readings " +
            "WHERE type = 'STEP_COUNTER' " +
            "AND timestamp >= :startOfDay AND timestamp < :endOfDay"
    )
    suspend fun stepsForDay(startOfDay: Long, endOfDay: Long): Double

    @Query(
        "SELECT * FROM patrol_points " +
            "WHERE patrolId = :patrolId ORDER BY timestamp ASC"
    )
    suspend fun patrolPointsOrdered(patrolId: String): List<PatrolPointEntity>

    @Query(
        "SELECT COUNT(*) FROM sensor_readings " +
            "WHERE patrolId = :patrolId AND type = 'MOVEMENT_MODE' " +
            "AND CAST(value AS INTEGER) IN (2, 3, 4)"
    )
    suspend fun activeMovementSamplesForPatrol(patrolId: String): Int

    @Query(
        "SELECT CAST(value AS INTEGER) AS value, COUNT(*) AS count FROM sensor_readings " +
            "WHERE patrolId = :patrolId AND type = 'MOVEMENT_MODE' " +
            "GROUP BY CAST(value AS INTEGER)"
    )
    suspend fun movementModeCountsForPatrol(patrolId: String): List<MovementModeCount>

    @Query(
        "SELECT timestamp, CAST(value AS INTEGER) AS value FROM sensor_readings " +
            "WHERE patrolId = :patrolId AND type = 'MOVEMENT_MODE' " +
            "ORDER BY timestamp ASC"
    )
    suspend fun movementSamplesForPatrol(patrolId: String): List<MovementSample>

    @Query(
        "SELECT COUNT(*) FROM sensor_readings " +
            "WHERE type = 'MOVEMENT_MODE' " +
            "AND CAST(value AS INTEGER) IN (2, 3, 4) " +
            "AND timestamp >= :startOfDay AND timestamp < :endOfDay"
    )
    suspend fun activeMovementSamplesForDay(startOfDay: Long, endOfDay: Long): Int

    @Query(
        "SELECT patrolId FROM sensor_readings " +
            "WHERE type = 'MOVEMENT_MODE' " +
            "AND timestamp >= :startOfDay AND timestamp < :endOfDay " +
            "GROUP BY patrolId"
    )
    suspend fun patrolIdsForDay(startOfDay: Long, endOfDay: Long): List<String>

    @Query("SELECT * FROM daily_activity WHERE date = :date")
    suspend fun dailyActivity(date: String): DailyActivityEntity?

    @Query("SELECT * FROM daily_activity WHERE date = :date")
    fun dailyActivityFlow(date: String): Flow<DailyActivityEntity?>

    @Insert(onConflict = androidx.room.OnConflictStrategy.REPLACE)
    suspend fun upsertDailyActivity(entity: DailyActivityEntity)

    @Query(
        "SELECT MIN(timestamp) FROM patrol_points " +
        "WHERE patrolId = :patrolId"
    )
    suspend fun patrolStartTime(patrolId: String): Long?

    @Query(
        "SELECT MAX(timestamp) FROM patrol_points " +
        "WHERE patrolId = :patrolId"
    )
    suspend fun patrolEndTime(patrolId: String): Long?

    @Insert(onConflict = androidx.room.OnConflictStrategy.REPLACE)
    suspend fun upsertPatrolSession(session: PatrolSessionEntity)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertSessionIfAbsent(session: PatrolSessionEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertPatrolPoints(points: List<PatrolPointEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertMovementModeReadings(readings: List<MovementModeReadingEntity>)

    @Query("SELECT * FROM movement_mode_readings WHERE patrolId = :patrolId ORDER BY timestamp ASC")
    suspend fun movementModeReadingsForPatrol(patrolId: String): List<MovementModeReadingEntity>

    @Query("UPDATE patrol_sessions SET detectedMethod = :method WHERE patrolId = :patrolId")
    suspend fun setDetectedMethod(patrolId: String, method: String?)

    @Query("SELECT * FROM patrol_sessions WHERE patrolId = :patrolId")
    fun patrolSessionFlow(patrolId: String): Flow<PatrolSessionEntity?>

    @Query("SELECT * FROM patrol_points WHERE patrolId = :patrolId ORDER BY timestamp ASC")
    fun patrolPointsFlow(patrolId: String): Flow<List<PatrolPointEntity>>

    @Query("SELECT * FROM patrol_sessions WHERE patrolId = :patrolId")
    suspend fun patrolSession(patrolId: String): PatrolSessionEntity?

    @Query("SELECT * FROM patrol_sessions ORDER BY startTime DESC")
    fun allPatrolSessions(): Flow<List<PatrolSessionEntity>>

    @Query("SELECT * FROM patrol_sessions WHERE status = :status ORDER BY startTime DESC")
    fun patrolSessionsByStatus(status: String): Flow<List<PatrolSessionEntity>>

    @Query("UPDATE patrol_sessions SET status = :status WHERE patrolId = :patrolId")
    suspend fun updatePatrolStatus(patrolId: String, status: String)

    @Query("SELECT * FROM patrol_sessions WHERE syncStatus = 'PENDING'")
    suspend fun sessionsToSync(): List<PatrolSessionEntity>

    @Query("UPDATE patrol_sessions SET syncStatus = :status WHERE patrolId = :patrolId")
    suspend fun updateSessionSyncStatus(patrolId: String, status: String)

    @Query("DELETE FROM patrol_points WHERE patrolId = :patrolId AND syncStatus = 'PENDING'")
    suspend fun deletePendingPointsForPatrol(patrolId: String)

    @Query("DELETE FROM sensor_readings WHERE patrolId = :patrolId AND syncStatus = 'PENDING'")
    suspend fun deletePendingReadingsForPatrol(patrolId: String)

    @Query("SELECT * FROM patrol_points WHERE syncStatus = 'PENDING'")
    suspend fun pendingPointRows(): List<PatrolPointEntity>

    @Query(
        "UPDATE patrol_points SET syncStatus = 'SYNCED' " +
        "WHERE patrolId = :patrolId AND syncStatus = 'PENDING'"
    )
    suspend fun markPointsSynced(patrolId: String)

    @Query("SELECT * FROM sensor_readings WHERE syncStatus = 'PENDING'")
    suspend fun pendingReadingRows(): List<SensorReadingEntity>

    @Query(
        "UPDATE sensor_readings SET syncStatus = 'SYNCED' " +
        "WHERE patrolId = :patrolId AND syncStatus = 'PENDING'"
    )
    suspend fun markReadingsSynced(patrolId: String)

    @Query("SELECT COUNT(*) FROM patrol_sessions")
    suspend fun countSessions(): Int

    @Query("SELECT COUNT(*) FROM patrol_sessions WHERE syncStatus = 'SYNCED'")
    suspend fun countSyncedSessions(): Int

    @Query("SELECT COUNT(*) FROM patrol_points")
    suspend fun countPoints(): Int

    @Query("SELECT COUNT(*) FROM patrol_points WHERE syncStatus = 'SYNCED'")
    suspend fun countSyncedPoints(): Int

    @Query("SELECT COUNT(*) FROM sensor_readings")
    suspend fun countReadings(): Int

    @Query("SELECT COUNT(*) FROM sensor_readings WHERE syncStatus = 'SYNCED'")
    suspend fun countSyncedReadings(): Int

    @Query("SELECT COUNT(*) FROM incidents")
    suspend fun countIncidents(): Int

    @Query("SELECT COUNT(*) FROM incidents WHERE syncStatus = 'SYNCED'")
    suspend fun countSyncedIncidents(): Int

    @Query(
        "UPDATE patrol_sessions SET endTime = :endTime, status = 'COMPLETED', " +
        "totalDistanceMeters = :distance, totalSteps = :steps, " +
        "moveMinutes = :moveMin, caloriesEstimate = :calories, " +
        "heartPointsEstimate = :heartPoints, avgSpeedKmh = :avgSpeed, " +
        "pointCount = :points WHERE patrolId = :patrolId"
    )
    suspend fun completePatrol(
        patrolId: String,
        endTime: Long,
        distance: Double,
        steps: Int,
        moveMin: Int,
        calories: Double,
        heartPoints: Double,
        avgSpeed: Double,
        points: Int
    )
}

/** Aggregated count of a movement mode (its persisted `value` code) in a patrol. */
data class MovementModeCount(val value: Int, val count: Int)

/** A single tracked movement-mode reading with its exact capture time. */
data class MovementSample(val timestamp: Long, val value: Int)
