package com.nstrpatrol.app.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Pre-computed daily activity totals, analogous to Google Fit daily summaries.
 *
 * Recomputed on patrol stop and on app open. Stores aggregated metrics
 * from all patrols that contributed to a single calendar day.
 */
@Entity(tableName = "daily_activity")
data class DailyActivityEntity(
    @PrimaryKey val date: String,
    val steps: Int = 0,
    val distanceMeters: Double = 0.0,
    val moveMinutes: Int = 0,
    val caloriesEstimate: Double = 0.0,
    val heartPointsEstimate: Double = 0.0,
    val patrolCount: Int = 0,
    val totalPatrolMillis: Long = 0L,
    val computedAt: Long = 0L
)
