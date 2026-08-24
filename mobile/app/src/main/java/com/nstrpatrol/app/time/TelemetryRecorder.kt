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
import com.nstrpatrol.app.data.SettingsStore
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
    private val dao: TelemetryDao,
    private val settings: SettingsStore? = null
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

    /** Patrol this recorder is sampling into; null when idle. Read by
     *  [TelemetryRegistry] when neutralizing abandoned instances. */
    var patrolId: String? = null
        private set

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

    private var lastPointLat: Double? = null
    private var lastPointLon: Double? = null
    private var lastPointTime: Long = 0L
    private var lastPersistedMode: MovementMode = MovementMode.UNKNOWN
    private var lastIntegrityLogAt: Long = 0L
    private var arPendingIntent: PendingIntent? = null
    private var sensorsRegistered = false
    private var stepSensorRegistered = false

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
        if (granted && running) {
            registerArUpdates()
            // TYPE_STEP_COUNTER is gated behind ACTIVITY_RECOGNITION on API 29+;
            // the grant usually arrives after startPatrol() already ran, so the
            // step sensor must be (re)registered here or steps stay at zero.
            registerStepCounter()
        }
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
        lastPointLat = null
        lastPointLon = null
        lastPointTime = 0L
        lastPersistedMode = MovementMode.UNKNOWN
        registerSensors()
        registerArUpdates()
        patrolId?.let { pid ->
            scope.launch {
                // INSERT OR IGNORE: never clobber the session the start screen
                // already persisted (team leader, beat, method, etc.).
                dao.insertSessionIfAbsent(
                    PatrolSessionEntity(
                        patrolId = pid,
                        startTime = patrolTimer.trustedNow()
                    )
                )
            }
        }
        // Refuse to sample for a finalized patrol and cancel any abandoned
        // predecessor recorder still holding the sampling loop.
        val mayRecord = patrolId == null || TelemetryRegistry.recorderStarted(patrolId!!, this)
        if (!mayRecord) {
            Log.w(TAG, "Refusing to record into finalized patrol $patrolId")
            running = false
            unregisterArUpdates()
            unregisterSensors()
            patrolId = null
            return
        }
        sampleJob = scope.launch {
            while (running) {
                try {
                    sampleOnce()
                } catch (e: Exception) {
                    Log.w(TAG, "Sample failed", e)
                }
                delay(effectivePollDelay())
            }
        }
    }

    /** Cancels the sampler without touching sensors — used by
     *  [TelemetryRegistry] to neutralize an abandoned recorder instance. */
    fun cancelSampling() {
        running = false
        sampleJob?.cancel()
        sampleJob = null
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
                // Final forced point so the trace ends at the true stop moment.
                tryRecordPoint(pid, timeManager.trustedUtcNow(), force = true)
            }
        }
        // NOTE: session completion (endTime, metrics, status flip) is written
        // ONLY by MainActivity.stopActivePatrol(). This path used to write a
        // competing completePatrol() with a different clock; the race between
        // the two writers corrupted session windows in prod. Recording must
        // also never outlive a completed session — see TelemetryRegistry.
        TelemetryRegistry.recorderStopped(pid, this)
        patrolId = null
    }

    private suspend fun sampleOnce() {
        val pid = patrolId ?: return
        val now = timeManager.trustedUtcNow()

        tryRecordPoint(pid, now, force = false)

        val readings = buildSensorReadings(pid, now)
        if (readings.isNotEmpty()) {
            dao.insertReadings(readings)
        }

        val telemetry = telemetryManager.telemetry.value
        val info = computeMovement(telemetry)
        _movement.value = info
        // Persist the detected movement mode (once per change) so the patrol
        // report can surface it and we can alert on method mismatches.
        if (info.mode != MovementMode.UNKNOWN && info.mode != lastPersistedMode) {
            dao.setDetectedMethod(pid, info.mode.name)
            lastPersistedMode = info.mode
        }
        dao.insertReading(
            SensorReadingEntity(
                id = "mm-${UUID.randomUUID()}",
                patrolId = pid,
                timestamp = now,
                type = TYPE_MOVEMENT_MODE,
                value = info.mode.code.toFloat(),
                x = info.confidence,
                y = info.speedKmh
            )
        )
        persistIntegrityLog(pid, now)
    }

    /** Snapshots the trusted-time state into Room every [AppConfig.INTEGRITY_LOG_INTERVAL_MS]. */
    private suspend fun persistIntegrityLog(pid: String, now: Long) {
        if (now - lastIntegrityLogAt < AppConfig.INTEGRITY_LOG_INTERVAL_MS) return
        lastIntegrityLogAt = now
        val s = timeManager.state.value
        dao.insertIntegrityLogs(
            listOf(
                com.nstrpatrol.app.data.db.IntegrityLogEntity(
                    id = "il-${UUID.randomUUID()}",
                    patrolId = pid,
                    timestamp = now,
                    gnssTimeAvailable = s.gnssTimeAvailable,
                    divergenceSeconds = s.divergenceSeconds.toInt(),
                    autoTimeEnabled = s.autoTimeEnabled,
                    tamperDetected = s.tamperDetected,
                    satellites = s.satellites
                )
            )
        )
    }

    /**
     * Records a patrol point when the device has a usable fix and either the
     * sampling interval has elapsed or it has moved enough since the last
     * point. Recording on displacement (not just time) captures the real route
     * instead of a handful of far-apart samples, so reported distance matches
     * the actual track.
     */
    private suspend fun tryRecordPoint(pid: String, now: Long, force: Boolean): Boolean {
        val telemetry = telemetryManager.telemetry.value
        val lat = telemetry.latitude ?: return false
        val lon = telemetry.longitude ?: return false
        val maxFixAge = settings?.gpsMaxFixAgeMs?.value ?: AppConfig.DEFAULT_MAX_FIX_AGE_MS
        if (!force && telemetry.ageMs !in 0..maxFixAge) return false

        val disp = if (lastPointLat != null) {
            haversine(lastPointLat!!, lastPointLon!!, lat, lon)
        } else {
            Double.MAX_VALUE
        }
        val timeSince = now - lastPointTime
        val minDisp = settings?.gpsMinDisplacementM?.value ?: AppConfig.DEFAULT_MIN_DISPLACEMENT_M
        val baseSampleInterval = settings?.gpsSampleIntervalMs?.value ?: AppConfig.DEFAULT_SAMPLE_INTERVAL_MS
        val sampleInterval = effectiveSampleInterval(baseSampleInterval)
        if (!force &&
            disp < minDisp &&
            timeSince < sampleInterval
        ) {
            return false
        }

        dao.insertPoint(
            PatrolPointEntity(
                id = "pt-${UUID.randomUUID()}",
                patrolId = pid,
                latitude = lat,
                longitude = lon,
                altitude = telemetry.altitudeMeters,
                speed = telemetry.speedMps,
                bearing = telemetry.bearingDegrees,
                accuracy = telemetry.horizontalAccuracyMeters,
                timestamp = now
            )
        )
        _samplesRecorded.update { it + 1 }
        lastPointLat = lat
        lastPointLon = lon
        lastPointTime = now
        return true
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
        if (stepsValue < 0) {
            // No counter events yet — the sensor may have become registrable
            // mid-patrol (permission grant raced the start). Retry each tick;
            // registerStepCounter() is idempotent and cheap once registered.
            registerStepCounter()
            return
        }
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
                    // GMS DetectedActivity confidence is 0..100; normalize to
                    // 0..1 so every consumer (recorder, upload, report) and the
                    // backend schema agree on the range.
                    confidence = (best.confidence.toFloat() / 100f).coerceIn(0f, 1f),
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
        if (!sensorsRegistered) {
            val sensors = listOfNotNull(
                sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER),
                sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE),
                sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD),
                sensorManager.getDefaultSensor(Sensor.TYPE_PRESSURE)
            )
            sensors.forEach { sensor ->
                sensorManager.registerListener(sensorListener, sensor, SensorManager.SENSOR_DELAY_NORMAL)
            }
            sensorsRegistered = true
        }
        registerStepCounter()
    }

    /** The step counter is registered separately: it is a no-op until the
     *  ACTIVITY_RECOGNITION permission is granted, which can happen mid-patrol. */
    private fun registerStepCounter() {
        if (stepSensorRegistered || !hasActivityRecognitionPermission()) return
        val stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) ?: return
        sensorManager.registerListener(sensorListener, stepSensor, SensorManager.SENSOR_DELAY_NORMAL)
        stepSensorRegistered = true
    }

    private fun unregisterSensors() {
        if (!sensorsRegistered && !stepSensorRegistered) return
        sensorManager.unregisterListener(sensorListener)
        sensorsRegistered = false
        stepSensorRegistered = false
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

    /** Shorter poll delay when moving fast so the track captures road curves. */
    private fun effectivePollDelay(): Long {
        val base = settings?.gpsPollMs?.value ?: AppConfig.DEFAULT_POINT_POLL_MS
        return when (_movement.value.mode) {
            MovementMode.VEHICLE -> minOf(1000L, base)
            MovementMode.CYCLING -> minOf(2000L, base)
            MovementMode.RUNNING -> minOf(3000L, base)
            MovementMode.STILL -> maxOf(10000L, base)
            else -> base
        }
    }

    /** Shorter sample interval when moving fast so points are denser on the map. */
    private fun effectiveSampleInterval(baseMs: Long): Long {
        return when (_movement.value.mode) {
            MovementMode.VEHICLE -> minOf(1000L, baseMs)
            MovementMode.CYCLING -> minOf(2000L, baseMs)
            MovementMode.RUNNING -> minOf(3000L, baseMs)
            MovementMode.STILL -> maxOf(10000L, baseMs)
            else -> baseMs
        }
    }

    companion object {
        private const val TAG = "TelemetryRecorder"
        private const val AR_ACTION = "com.nstrpatrol.app.ACTION_ACTIVITY_RESULT"
        const val TYPE_MOVEMENT_MODE = "MOVEMENT_MODE"
    }
}
