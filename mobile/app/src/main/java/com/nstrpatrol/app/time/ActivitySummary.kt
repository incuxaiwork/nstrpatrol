package com.nstrpatrol.app.time

import com.nstrpatrol.app.AppConfig
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

    private val dayFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)

    suspend fun computeForPatrol(patrolId: String, dao: TelemetryDao): PatrolMetrics {
        val points = dao.patrolPointsOrdered(patrolId)
        val recordedSteps = dao.stepsForPatrol(patrolId)
        val activeSamples = dao.activeMovementSamplesForPatrol(patrolId)

        val distance = haversineDistance(points)
        val startTime = points.firstOrNull()?.timestamp
        val endTime = points.lastOrNull()?.timestamp
        val durationMs = if (startTime != null && endTime != null) (endTime - startTime).coerceAtLeast(0L) else 0L
        val avgSpeedKmh = if (durationMs > 0) (distance / 1000.0) / (durationMs / 3_600_000.0) else 0.0

        var moveMinutes = (activeSamples * AppConfig.METRICS_SAMPLE_INTERVAL_MS) / 60_000
        if (moveMinutes == 0L && durationMs > 0L) {
            moveMinutes = computeMovingMinutesFromPoints(points, durationMs, avgSpeedKmh)
        }

        var steps = recordedSteps.toInt()
        if (steps == 0 && distance > 0 && !isVehicleDominant(dao, patrolId)) {
            // Cadence-based step estimation is only meaningful for foot-dominant
            // patrols: a trace that is mostly vehicle/cycling says nothing about
            // walking (4.2 km driven once became "5,680 steps" in prod).
            steps = (distance / 0.75).toInt()
        }

        val calories = estimateCalories(
            moveMinutes = moveMinutes,
            durationMs = durationMs,
            walkingSteps = steps.toLong()
        )
        val heartPoints = estimateHeartPoints(activeSamples.coerceAtLeast((moveMinutes * 60_000 / AppConfig.METRICS_SAMPLE_INTERVAL_MS).toInt()))

        return PatrolMetrics(
            steps = steps,
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

    /**
     * True when the patrol's movement samples are dominated by vehicle/cycling
     * rather than walking/running — used to suppress step estimation.
     */
    suspend fun isVehicleDominant(dao: TelemetryDao, patrolId: String): Boolean {
        val counts = dao.movementModeCountsForPatrol(patrolId)
        var foot = 0
        var ride = 0
        for (c in counts) {
            when (c.value) {
                MovementMode.WALKING.code, MovementMode.RUNNING.code -> foot += c.count
                MovementMode.VEHICLE.code, MovementMode.CYCLING.code -> ride += c.count
            }
        }
        return ride > foot
    }

    /**
     * Shared step estimator for report surfaces: real counter readings win,
     * then cadence-based estimation for foot-dominant patrols, and zero for
     * vehicle-dominant ones (never invent steps someone "walked" in a jeep).
     */
    suspend fun estimateSteps(
        dao: TelemetryDao,
        patrolId: String,
        recordedSteps: Int,
        distanceMeters: Double
    ): Int {
        if (recordedSteps > 0) return recordedSteps
        if (distanceMeters <= 0.0) return 0
        return if (!isVehicleDominant(dao, patrolId)) (distanceMeters / 0.75).toInt() else 0
    }

    private fun computeMovingMinutesFromPoints(
        points: List<com.nstrpatrol.app.data.db.PatrolPointEntity>,
        durationMs: Long,
        avgSpeedKmh: Double
    ): Long {
        if (points.size < 2) return if (avgSpeedKmh >= 0.5) (durationMs / 60_000L) else 0L
        var movingMs = 0L
        for (i in 1 until points.size) {
            val p1 = points[i - 1]
            val p2 = points[i]
            val dt = p2.timestamp - p1.timestamp
            if (dt in 1..300_000) {
                val dist = singleHaversine(p1.latitude, p1.longitude, p2.latitude, p2.longitude)
                val speedKmh = (dist / 1000.0) / (dt / 3_600_000.0)
                if (speedKmh >= 0.5) {
                    movingMs += dt
                }
            }
        }
        val mins = movingMs / 60_000L
        if (mins > 0L) return mins
        return if (avgSpeedKmh >= 0.5) (durationMs / 60_000L) else 0L
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

        val moveMinutes = (activeSamples * AppConfig.METRICS_SAMPLE_INTERVAL_MS) / 60_000
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
            total += singleHaversine(p1.latitude, p1.longitude, p2.latitude, p2.longitude)
        }
        return total
    }

    private fun singleHaversine(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2).pow(2) +
            cos(Math.toRadians(lat1)) *
            cos(Math.toRadians(lat2)) *
            sin(dLon / 2).pow(2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return EARTH_RADIUS_M * c
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

        val activeCals = moveHours * 3.5 * AppConfig.DEFAULT_RANGER_WEIGHT_KG
        val restCals = stillHours * 1.0 * AppConfig.DEFAULT_RANGER_WEIGHT_KG
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
