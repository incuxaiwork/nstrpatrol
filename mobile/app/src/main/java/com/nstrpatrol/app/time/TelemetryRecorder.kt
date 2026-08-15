package com.nstrpatrol.app.time

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityRecognitionResult
import com.nstrpatrol.app.AppConfig
import com.nstrpatrol.app.data.PatrolTimer
import com.nstrpatrol.app.data.db.PatrolPointEntity
import com.nstrpatrol.app.data.db.PatrolSessionEntity
import com.nstrpatrol.app.data.db.SensorReadingEntity
import com.nstrpatrol.app.data.db.TelemetryDao
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * Offline-first telemetry logger for an active patrol.
 *
 * While [PatrolTimer.running] is true it:
 *  - snapshots a patrol point every [AppConfig.SAMPLE_INTERVAL_MS] when a GPS fix exists,
 *  - caches raw sensor samples (accel/gyro/magnet/barometer/steps),
 *  - classifies the ranger's movement mode, preferring Google Activity
 *    Recognition and falling back to speed/cadence heuristics,
 *  - persists everything to Room as [PatrolPointEntity] / [SensorReadingEntity]
 *    rows flagged PENDING for later sync.
 */
class TelemetryRecorder(
    private val appContext: Context,
    private val patrolTimer: PatrolTimer,
    private val telemetryManager: GpsTelemetryManager,
    private val timeManager: TrustedTimeManager,
    private val dao: TelemetryDao
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val sensorManager =
        appContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager

    private val _movement = MutableStateFlow(MovementInfo())
    val movement: StateFlow<MovementInfo> = _movement.asStateFlow()

    private val _samplesRecorded = MutableStateFlow(0L)
    val samplesRecorded: StateFlow<Long> = _samplesRecorded.asStateFlow()

    private val _arPermissionGranted = MutableStateFlow(hasActivityRecognitionPermission())
    val arPermissionGranted: StateFlow<Boolean> = _arPermissionGranted.asStateFlow()

    private var patrolId: String? = null

    @Volatile
    private var running = false
    private var sampleJob: Job? = null

    private val accelValues = FloatArray(3)
    private val gyroValues = FloatArray(3)
    private val magValues = FloatArray(3)
    private var pressureValue = 0f
    private var stepsValue = -1L
    private var prevSteps = -1L
    private var prevStepsElapsed = 0L
    private var lastStepDelta = 0L
    private var lastCadence = 0f

    private var lastArResult: ActivityRecognitionResult? = null
    private var arPendingIntent: PendingIntent? = null
    private var sensorsRegistered = false

    init {
        ActivityRecognitionReceiver.onActivityResult = { result ->
            lastArResult = result
        }
        scope.launch {
            patrolTimer.running.collectLatest { isRunning ->
                if (isRunning) startPatrol() else stopPatrol()
            }
        }
    }

    fun onPermissionResult(granted: Boolean) {
        _arPermissionGranted.value = granted
        if (granted && running) registerArUpdates()
    }

    fun hasActivityRecognitionPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
        return ContextCompat.checkSelfPermission(
            appContext,
            android.Manifest.permission.ACTIVITY_RECOGNITION
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun startPatrol() {
        if (running) return
        running = true
        patrolId = patrolTimer.patrolId
        _samplesRecorded.value = 0
        _movement.value = MovementInfo()
        registerSensors()
        registerArUpdates()
        patrolId?.let { pid ->
            scope.launch {
                dao.upsertPatrolSession(
                    PatrolSessionEntity(
                        patrolId = pid,
                        startTime = patrolTimer.trustedNow()
                    )
                )
            }
        }
        sampleJob = scope.launch {
            while (running) {
                try {
                    sampleOnce()
                } catch (e: Exception) {
                    Log.w(TAG, "Sample failed", e)
                }
                delay(AppConfig.SAMPLE_INTERVAL_MS)
            }
        }
    }

    private fun stopPatrol() {
        running = false
        sampleJob?.cancel()
        sampleJob = null
        unregisterArUpdates()
        unregisterSensors()
        val pid = patrolId
        if (pid != null) {
            scope.launch {
                val metrics = ActivitySummary.computeForPatrol(pid, dao)
                val endTime = timeManager.trustedUtcNow()
                dao.completePatrol(
                    patrolId = pid,
                    endTime = endTime,
                    distance = metrics.distanceMeters,
                    steps = metrics.steps,
                    moveMin = metrics.moveMinutes,
                    calories = metrics.caloriesEstimate,
                    heartPoints = metrics.heartPointsEstimate,
                    avgSpeed = metrics.avgSpeedKmh,
                    points = _samplesRecorded.value.toInt()
                )
            }
        }
        patrolId = null
    }

    private suspend fun sampleOnce() {
        val pid = patrolId ?: return
        val telemetry = telemetryManager.telemetry.value
        val now = timeManager.trustedUtcNow()

        // Accept any usable fix (gps / network / fused). The strict `hasGpsFix`
        // gate required provider == "gps", which most devices never report for
        // the active location, so points were never recorded and the patrol
        // page + dashboard showed zero distance/speed/steps.
        val usableFix = telemetry.latitude != null &&
            telemetry.longitude != null &&
            telemetry.horizontalAccuracyMeters != null &&
            telemetry.ageMs in 0..30_000

        if (usableFix) {
            dao.insertPoint(
                PatrolPointEntity(
                    id = "pt-${UUID.randomUUID()}",
                    patrolId = pid,
                    latitude = telemetry.latitude,
                    longitude = telemetry.longitude,
                    altitude = telemetry.altitudeMeters,
                    speed = telemetry.speedMps,
                    bearing = telemetry.bearingDegrees,
                    accuracy = telemetry.horizontalAccuracyMeters,
                    timestamp = now
                )
            )
            _samplesRecorded.update { it + 1 }
        }

        val readings = buildSensorReadings(pid, now)
        if (readings.isNotEmpty()) {
            dao.insertReadings(readings)
        }

        val info = computeMovement(telemetry)
        _movement.value = info
        dao.insertReading(
            SensorReadingEntity(
                id = "mm-${UUID.randomUUID()}",
                patrolId = pid,
                timestamp = now,
                type = TYPE_MOVEMENT_MODE,
                value = info.mode.code.toFloat()
            )
        )
    }

    private fun buildSensorReadings(pid: String, now: Long): List<SensorReadingEntity> {
        stepSample()
        val readings = mutableListOf<SensorReadingEntity>()
        readings += SensorReadingEntity(
            id = "acc-${UUID.randomUUID()}", patrolId = pid, timestamp = now,
            type = "ACCELEROMETER", x = accelValues[0], y = accelValues[1], z = accelValues[2]
        )
        readings += SensorReadingEntity(
            id = "gyr-${UUID.randomUUID()}", patrolId = pid, timestamp = now,
            type = "GYROSCOPE", x = gyroValues[0], y = gyroValues[1], z = gyroValues[2]
        )
        readings += SensorReadingEntity(
            id = "mag-${UUID.randomUUID()}", patrolId = pid, timestamp = now,
            type = "MAGNETOMETER", x = magValues[0], y = magValues[1], z = magValues[2]
        )
        if (pressureValue != 0f) {
            readings += SensorReadingEntity(
                id = "bar-${UUID.randomUUID()}", patrolId = pid, timestamp = now,
                type = "BAROMETER", value = pressureValue
            )
        }
        if (lastStepDelta > 0L) {
            readings += SensorReadingEntity(
                id = "step-${UUID.randomUUID()}", patrolId = pid, timestamp = now,
                type = "STEP_COUNTER", value = lastStepDelta.toFloat()
            )
        }
        return readings
    }

    /** Updates the rolling step delta/cadence from the cumulative step counter. */
    private fun stepSample() {
        if (stepsValue < 0) return
        val now = SystemClock.elapsedRealtime()
        if (prevSteps >= 0 && now > prevStepsElapsed) {
            lastStepDelta = stepsValue - prevSteps
            val minutes = (now - prevStepsElapsed) / 60_000f
            lastCadence = if (minutes > 0f) lastStepDelta / minutes else 0f
        }
        prevSteps = stepsValue
        prevStepsElapsed = now
    }

    private fun computeMovement(telemetry: GpsTelemetry): MovementInfo {
        val speedKmh = telemetry.speedMps?.let { it * 3.6f }
        val cadence = lastCadence.takeIf { it > 0f }

        val result = lastArResult
        val fresh = result != null &&
            SystemClock.elapsedRealtime() - result.elapsedRealtimeMillis < AppConfig.AR_FRESH_MS
        if (fresh) {
            val best = result.mostProbableActivity
            val mode = MovementMode.fromGoogleDetectedActivity(best, result.probableActivities)
            if (mode != MovementMode.UNKNOWN && best.confidence >= AppConfig.AR_MIN_CONFIDENCE) {
                return MovementInfo(
                    mode = mode,
                    confidence = best.confidence.toFloat(),
                    source = ModeSource.GMS_ACTIVITY_RECOGNITION,
                    speedKmh = speedKmh,
                    stepCadence = cadence
                )
            }
        }

        val mode = when {
            speedKmh == null -> MovementMode.UNKNOWN
            speedKmh >= 25f -> MovementMode.VEHICLE
            speedKmh >= 7f -> MovementMode.CYCLING
            speedKmh >= 0.5f ->
                if (cadence != null && cadence >= AppConfig.RUN_CADENCE_THRESHOLD) {
                    MovementMode.RUNNING
                } else {
                    MovementMode.WALKING
                }
            else -> MovementMode.STILL
        }
        return MovementInfo(
            mode = mode,
            source = ModeSource.HEURISTIC,
            speedKmh = speedKmh,
            stepCadence = cadence
        )
    }

    private val sensorListener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
            when (event.sensor.type) {
                Sensor.TYPE_ACCELEROMETER -> System.arraycopy(event.values, 0, accelValues, 0, 3)
                Sensor.TYPE_GYROSCOPE -> System.arraycopy(event.values, 0, gyroValues, 0, 3)
                Sensor.TYPE_MAGNETIC_FIELD -> System.arraycopy(event.values, 0, magValues, 0, 3)
                Sensor.TYPE_PRESSURE -> pressureValue = event.values[0]
                Sensor.TYPE_STEP_COUNTER -> stepsValue = event.values[0].toLong()
            }
        }

        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
    }

    private fun registerSensors() {
        if (sensorsRegistered) return
        val sensors = listOfNotNull(
            sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER),
            sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE),
            sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD),
            sensorManager.getDefaultSensor(Sensor.TYPE_PRESSURE),
            sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        )
        sensors.forEach { sensor ->
            sensorManager.registerListener(sensorListener, sensor, SensorManager.SENSOR_DELAY_NORMAL)
        }
        sensorsRegistered = true
    }

    private fun unregisterSensors() {
        if (!sensorsRegistered) return
        sensorManager.unregisterListener(sensorListener)
        sensorsRegistered = false
        accelValues.fill(0f)
        gyroValues.fill(0f)
        magValues.fill(0f)
        pressureValue = 0f
        stepsValue = -1L
        prevSteps = -1L
        prevStepsElapsed = 0L
        lastStepDelta = 0L
        lastCadence = 0f
    }

    private fun registerArUpdates() {
        if (!hasActivityRecognitionPermission()) {
            _arPermissionGranted.value = false
            Log.i(TAG, "ACTIVITY_RECOGNITION missing; heuristic fallback only")
            return
        }
        _arPermissionGranted.value = true
        if (arPendingIntent != null) return
        try {
            val intent = Intent(appContext, ActivityRecognitionReceiver::class.java)
                .setAction(AR_ACTION)
            val pending = PendingIntent.getBroadcast(
                appContext,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            )
            arPendingIntent = pending
            ActivityRecognition.getClient(appContext)
                .requestActivityUpdates(AppConfig.ACTIVITY_UPDATE_INTERVAL_MS, pending)
            Log.i(TAG, "Activity Recognition updates requested")
        } catch (e: Exception) {
            Log.w(TAG, "Activity Recognition unavailable", e)
            arPendingIntent = null
        }
    }

    private fun unregisterArUpdates() {
        arPendingIntent?.let { pending ->
            runCatching {
                ActivityRecognition.getClient(appContext).removeActivityUpdates(pending)
            }
        }
        arPendingIntent = null
        lastArResult = null
    }

    companion object {
        private const val TAG = "TelemetryRecorder"
        private const val AR_ACTION = "com.nstrpatrol.app.ACTION_ACTIVITY_RESULT"
        const val TYPE_MOVEMENT_MODE = "MOVEMENT_MODE"
    }
}
