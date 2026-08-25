package com.nstrpatrol.app.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * A persisted patrol session record. Created when a patrol starts,
 * updated with final stats when it stops.
 */
@Entity(tableName = "patrol_sessions")
data class PatrolSessionEntity(
    @PrimaryKey val patrolId: String,
    val startTime: Long,
    val endTime: Long? = null,
    val status: String = "ACTIVE",
    val patrolType: String? = null,
    val patrolMethod: String? = null,
    val beat: String? = null,
    val detectedMethod: String? = null,
    val armedStatus: String? = null,
    val totalDistanceMeters: Double = 0.0,
    val totalSteps: Int = 0,
    val moveMinutes: Int = 0,
    val caloriesEstimate: Double = 0.0,
    val heartPointsEstimate: Double = 0.0,
    val avgSpeedKmh: Double = 0.0,
    val pointCount: Int = 0,
    val faceVerified: Boolean = false,
    val syncStatus: String = "PENDING",
    /// Server-side updatedAt for staleness detection during incremental pull.
    /// 0 = not yet tracked (local-only or legacy pulled session).
    val serverUpdatedAt: Long = 0
)
