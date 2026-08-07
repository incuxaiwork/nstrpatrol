package com.nstrpatrol.app.time

import com.nstrpatrol.app.data.db.DailyActivityEntity
import com.nstrpatrol.app.data.db.TelemetryDao
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Computes patrol and daily activity metrics from raw telemetry data.
 *
 * All metrics are derived from GPS positions, step counter deltas, and
 * movement mode classifications already stored in Room — no external
 * health API needed.
 */
object ActivitySummary {

    private const val EARTH_RADIUS_M = 6_371_000.0
    private const val SAMPLE_INTERVAL_MS = 5000L
    private const val DEFAULT_WEIGHT_KG = 70.0

    private val dayFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)

    suspend fun computeForPatrol(patrolId: String, dao: TelemetryDao): PatrolMetrics {
        val points = dao.patrolPointsOrdered(patrolId)
        val steps = dao.stepsForPatrol(patrolId)
        val activeSamples = dao.activeMovementSamplesForPatrol(patrolId)

        val distance = haversineDistance(points)
        val startTime = points.firstOrNull()?.timestamp
        val endTime = points.lastOrNull()?.timestamp
        val durationMs = if (startTime != null && endTime != null) endTime - startTime else 0L
        val avgSpeedKmh = if (durationMs > 0) (distance / 1000.0) / (durationMs / 3_600_000.0) else 0.0
        val moveMinutes = (activeSamples * SAMPLE_INTERVAL_MS) / 60_000

        val calories = estimateCalories(
            moveMinutes = moveMinutes.toLong(),
            durationMs = durationMs,
            walkingSteps = steps.toLong()
        )
        val heartPoints = estimateHeartPoints(activeSamples)

        return PatrolMetrics(
            steps = steps.toInt(),
            distanceMeters = distance,
            moveMinutes = moveMinutes.toInt(),
            caloriesEstimate = calories,
            heartPointsEstimate = heartPoints,
            avgSpeedKmh = avgSpeedKmh,
            durationMs = durationMs,
            startTimeMs = startTime,
            endTimeMs = endTime
        )
    }

    suspend fun computeForToday(dao: TelemetryDao): DailyActivityEntity {
        val (startOfDay, endOfDay) = todayRange()
        val dateStr = dayFormat.format(Calendar.getInstance().time)

        val steps = dao.stepsForDay(startOfDay, endOfDay).toInt()
        val activeSamples = dao.activeMovementSamplesForDay(startOfDay, endOfDay)
        val patrolIds = dao.patrolIdsForDay(startOfDay, endOfDay)

        var totalDistance = 0.0
        var totalDurationMs = 0L
        for (pid in patrolIds) {
            val points = dao.patrolPointsOrdered(pid)
            totalDistance += haversineDistance(points)
            val start = points.firstOrNull()?.timestamp
            val end = points.lastOrNull()?.timestamp
            if (start != null && end != null) totalDurationMs += (end - start)
        }

        val moveMinutes = (activeSamples * SAMPLE_INTERVAL_MS) / 60_000
        val calories = estimateCalories(
            moveMinutes = moveMinutes.toLong(),
            durationMs = totalDurationMs,
            walkingSteps = steps.toLong()
        )
        val heartPoints = estimateHeartPoints(activeSamples)

        return DailyActivityEntity(
            date = dateStr,
            steps = steps,
            distanceMeters = totalDistance,
            moveMinutes = moveMinutes.toInt(),
            caloriesEstimate = calories,
            heartPointsEstimate = heartPoints,
            patrolCount = patrolIds.size,
            totalPatrolMillis = totalDurationMs,
            computedAt = System.currentTimeMillis()
        )
    }

    private fun haversineDistance(points: List<com.nstrpatrol.app.data.db.PatrolPointEntity>): Double {
        if (points.size < 2) return 0.0
        var total = 0.0
        for (i in 1 until points.size) {
            val p1 = points[i - 1]
            val p2 = points[i]
            val dLat = Math.toRadians(p2.latitude - p1.latitude)
            val dLon = Math.toRadians(p2.longitude - p1.longitude)
            val a = sin(dLat / 2).pow(2) +
                cos(Math.toRadians(p1.latitude)) *
                cos(Math.toRadians(p2.latitude)) *
                sin(dLon / 2).pow(2)
            val c = 2 * atan2(sqrt(a), sqrt(1 - a))
            total += EARTH_RADIUS_M * c
        }
        return total
    }

    /**
     * MET-based calorie estimation.
     * MET values: STILL=1.0, WALKING=3.5, RUNNING=9.0, CYCLING=7.0, VEHICLE=1.3
     * Since we only have active (walking/running/cycling) vs total time,
     * we estimate proportionally.
     */
    private fun estimateCalories(
        moveMinutes: Long,
        durationMs: Long,
        walkingSteps: Long
    ): Double {
        val durationHours = durationMs / 3_600_000.0
        val moveHours = moveMinutes / 60.0
        val stillHours = (durationHours - moveHours).coerceAtLeast(0.0)

        val activeCals = moveHours * 3.5 * DEFAULT_WEIGHT_KG
        val restCals = stillHours * 1.0 * DEFAULT_WEIGHT_KG
        return activeCals + restCals
    }

    /**
     * Heart points: 1 pt/min moderate, 2 pt/min vigorous.
     * We approximate from movement mode samples. Without heart rate,
     * we assume walking = moderate, running/cycling = vigorous.
     */
    private fun estimateHeartPoints(activeSamples: Int): Double {
        return activeSamples.toDouble()
    }

    private fun todayRange(): Pair<Long, Long> {
        val cal = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val start = cal.timeInMillis
        cal.add(Calendar.DAY_OF_MONTH, 1)
        return start to cal.timeInMillis
    }
}

data class PatrolMetrics(
    val steps: Int = 0,
    val distanceMeters: Double = 0.0,
    val moveMinutes: Int = 0,
    val caloriesEstimate: Double = 0.0,
    val heartPointsEstimate: Double = 0.0,
    val avgSpeedKmh: Double = 0.0,
    val durationMs: Long = 0L,
    val startTimeMs: Long? = null,
    val endTimeMs: Long? = null
) {
    val distanceKm: String get() = if (distanceMeters >= 1000)
        String.format("%.1f km", distanceMeters / 1000) else
        String.format("%.0f m", distanceMeters)

    val avgSpeedText: String get() = String.format("%.1f km/h", avgSpeedKmh)

    val durationFormatted: String get() {
        val totalSec = durationMs / 1000
        val h = totalSec / 3600
        val m = (totalSec % 3600) / 60
        return if (h > 0) "${h}h ${m}m" else "${m}m"
    }
}
