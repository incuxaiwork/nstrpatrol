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
    // Raw GPS fix seen on the previous sampling tick (updated every tick,
    // unlike lastPoint* which only move when a point is recorded). Used to
    // measure per-tick coordinate change so sensor-only motion (shaking the
    // phone while stationary) never counts as distance or steps.
    private var lastSeenLat: Double? = null
    private var lastSeenLon: Double? = null
    // Motion latch: per-tick displacement jitters (drift looks like 3-8 m
    // jumps), so a single tick can never flip the verdict. Motion latches on
    // only after consecutive raw-moving ticks or fast cumulative travel, and
    // unlatches after consecutive stationary ticks. Teleport ticks (huge jump
    // on a poor fix) reset the streak instead of feeding it.
    private var movingStreak = 0
    private var stillStreak = 0
    private var latchCumDisp = 0.0
    private var gpsMovingLatched = false
    private var lastPersistedMode: MovementMode = MovementMode.UNKNOWN
    private var lastIntegrityLogAt: Long = 0L

    // Fix watchdog state: elapsedRealtime of the last FRESH fix, and of the
    // last forced provider re-registration (rate limit).
    private var lastFreshFixElapsed = 0L
    private var lastForceResyncElapsed = 0L

    /** Set by [tryRecordPoint] when it accepted a fix this tick. */
    private var tryRecordPointWasFresh = false

    /** Force a provider resync after this long without a fresh fix. */
    private val WATCHDOG_STALE_MS = 2L * 60_000L
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
        lastSeenLat = null
        lastSeenLon = null
        movingStreak = 0
        stillStreak = 0
        latchCumDisp = 0.0
        gpsMovingLatched = false
        lastPersistedMode = MovementMode.UNKNOWN
        lastFreshFixElapsed = 0L
        lastForceResyncElapsed = 0L
        tryRecordPointWasFresh = false
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
                // Final forced point so the trace ends at the true stop
                // moment — but only if the last fix is actually stale.
                // Without this the end-point duplicates the last recorded
                // fix (same-timestamp twin rows), and if completion already
                // flipped the session it becomes an uncounted ghost row that
                // card fallbacks then display as phantom distance.
                // (tryRecordPoint additionally refuses finalized ids.)
                val now = timeManager.trustedUtcNow()
                if (now - lastPointTime > AppConfig.DEFAULT_SAMPLE_INTERVAL_MS) {
                    tryRecordPoint(pid, now, force = true)
                }
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

        // GPS truth gate: coordinates must actually be changing for any
        // sensor-detected motion to count. Shaking a stationary phone fires
        // accelerometer/gyro and can fool Activity Recognition into CYCLING,
        // but the GPS fix stays put — in that case steps and distance stay 0.
        val rawTelemetry = telemetryManager.telemetry.value
        val tickDisp = if (rawTelemetry.latitude != null && rawTelemetry.longitude != null &&
            lastSeenLat != null && lastSeenLon != null
        ) {
            haversine(lastSeenLat!!, lastSeenLon!!, rawTelemetry.latitude!!, rawTelemetry.longitude!!)
        } else {
            Double.MAX_VALUE
        }
        val gpsMoving = updateGpsMotion(rawTelemetry, tickDisp)
        lastSeenLat = rawTelemetry.latitude
        lastSeenLon = rawTelemetry.longitude

        tryRecordPoint(pid, now, force = false, gpsMoving = gpsMoving)

        // Fix watchdog: if we are mid-patrol but no fresh fix has arrived for
        // a while, drop and re-register the location providers once. Battery
        // saver transitions and provider flaps can silently starve an existing
        // registration; re-adding it (and newly enabled providers, e.g. network
        // coming back) restores the trace without user intervention.
        val telemetryNow = telemetryManager.telemetry.value
        val elapsedNow = SystemClock.elapsedRealtime()
        if ((telemetryNow.ageMs in 0..60_000) || tryRecordPointWasFresh) {
            lastFreshFixElapsed = elapsedNow
            tryRecordPointWasFresh = false
        }
        if (lastFreshFixElapsed == 0L) {
            // Anchor on first sample so a slow GNSS cold start doesn't
            // immediately trigger the watchdog.
            lastFreshFixElapsed = elapsedNow
        } else if (elapsedNow - lastFreshFixElapsed > WATCHDOG_STALE_MS &&
            elapsedNow - lastForceResyncElapsed > WATCHDOG_STALE_MS
        ) {
            Log.w(TAG, "No fresh GPS fix for ${WATCHDOG_STALE_MS / 1000}s during active patrol — forcing provider resync")
            telemetryManager.forceResync()
            lastForceResyncElapsed = elapsedNow
            lastFreshFixElapsed = elapsedNow
        }

        val readings = buildSensorReadings(pid, now, gpsMoving)
        if (readings.isNotEmpty()) {
            dao.insertReadings(readings)
        }

        val telemetry = telemetryManager.telemetry.value
        val info = computeMovement(telemetry, gpsMoving)
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
     * the actual track. Stationary jitter is filtered: when STILL we require
     * ~10 m displacement, and tiny <3 m jumps are never recorded while speed
     * is ~0.
     */
    /**
     * Latched GPS motion verdict for this tick. Per-tick displacement alone
     * cannot separate walking from satellite drift (both look like 3-8 m
     * jumps), and one-off teleports (85 m between two 76 m-accuracy fixes)
     * must never count. So: teleport ticks reset the streak, ordinary ticks
     * vote, and motion latches on only after [AppConfig.GPS_LATCH_TICKS]
     * consecutive moving ticks or [AppConfig.GPS_LATCH_CUMULATIVE_M] of
     * travel. While unlatched, steps are swallowed and points face the
     * stationary 10 m guard no matter what the inertial sensors claim.
     */
    private fun updateGpsMotion(telemetry: GpsTelemetry, tickDisp: Double): Boolean {
        val lat = telemetry.latitude
        val lon = telemetry.longitude
        val fresh = lat != null && lon != null && !(lat == 0.0 && lon == 0.0) &&
            telemetry.ageMs in 0..(settings?.gpsMaxFixAgeMs?.value ?: AppConfig.DEFAULT_MAX_FIX_AGE_MS)
        val speedKmh = telemetry.speedMps?.let { it * 3.6 } ?: 0.0
        val acc = telemetry.horizontalAccuracyMeters?.toDouble()
        val hasAcc = acc != null && acc < 1e6

        var rawMoving = false
        if (fresh && tickDisp != Double.MAX_VALUE) {
            // Teleports must not start/feed the streak — including huge jumps
            // whose GPS speed is merely elevated (multipath Doppler), which
            // the plain 5 km/h bar lets through.
            val bigJumpNoProof = tickDisp >= 100.0 && (!hasAcc || acc!! > 30.0) && speedKmh < 8.0
            val teleport = bigJumpNoProof || (tickDisp >= AppConfig.GPS_TELEPORT_M &&
                (!hasAcc || acc!! > AppConfig.GPS_POOR_ACCURACY_M) && speedKmh < AppConfig.GPS_MOVING_SPEED_KMH)
            if (!teleport) {
                if (tickDisp >= AppConfig.GPS_TICK_DISP_M) {
                    rawMoving = true
                    latchCumDisp += tickDisp
                }
                // Fast GPS speed on a sane fix: unambiguous motion even when
                // consecutive fixes land close together.
                if (speedKmh >= AppConfig.GPS_MOVING_SPEED_KMH && hasAcc && acc!! <= 30.0) {
                    rawMoving = true
                }
            } else {
                // A teleport proves nothing except a bad fix — it must not
                // start or feed a motion streak.
                latchCumDisp = 0.0
            }
        }
        if (rawMoving) {
            movingStreak++
            stillStreak = 0
        } else {
            stillStreak++
            movingStreak = 0
            if (latchCumDisp > 0 && tickDisp != Double.MAX_VALUE) latchCumDisp = 0.0
        }
        if (movingStreak >= AppConfig.GPS_LATCH_TICKS ||
            latchCumDisp >= AppConfig.GPS_LATCH_CUMULATIVE_M
        ) {
            gpsMovingLatched = true
        }
        if (stillStreak >= AppConfig.GPS_STILL_TICKS) {
            gpsMovingLatched = false
        }
        return gpsMovingLatched
    }

    private suspend fun tryRecordPoint(pid: String, now: Long, force: Boolean, gpsMoving: Boolean = true): Boolean {
        // Post-completion ghost guard: an in-flight sample or a late forced
        // end-point must never write into a COMPLETED session (their distance
        // was already finalized; late rows only corrupt cards/reports).
        if (TelemetryRegistry.isFinalized(pid)) return false
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
        if (!force) {
            // --- Stationary jitter filter (the reported bug) ---
            // When phone is still, GPS wanders 3-8 m every fix. With minDisp=0
            // the old `disp < minDisp && time < interval` never filtered, so
            // every 10 s a jitter point was stored and distance crept up.
            // `gpsMoving` is the per-tick GPS truth: a shake can fool
            // Activity Recognition into CYCLING while coordinates don't move,
            // so stale _movement must not override a stationary GPS fix.
            val isStill = _movement.value.mode == MovementMode.STILL || !gpsMoving
            val acc = telemetry.horizontalAccuracyMeters?.toDouble() ?: Double.MAX_VALUE
            val speedKmh = telemetry.speedMps?.let { it * 3.6 } ?: 0.0
            // Garbage-fix guards (observed in the field: an 85 m teleport
            // between two 76 m-accuracy fixes was recorded as travel).
            // A fix worse than 50 m accuracy cannot anchor a track point.
            // (acc is Double.MAX_VALUE when the fix carries no accuracy —
            // those pass this gate and rely on the rules below.)
            if (acc < 1e6 && acc > AppConfig.GPS_MAX_FIX_ACCURACY_M) {
                return false
            }
            // A giant jump on a poor fix without corroborating speed is a
            // satellite teleport, not travel — drop it even mid-patrol.
            if (disp != Double.MAX_VALUE && disp >= AppConfig.GPS_TELEPORT_M &&
                acc > AppConfig.GPS_POOR_ACCURACY_M && speedKmh < AppConfig.GPS_MOVING_SPEED_KMH
            ) {
                return false
            }
            // Segment plausibility (observed: 32 m in 3 s = 38 km/h on foot
            // with GPS reporting 0.8 km/h; 681 m after a 404 s silence with
            // GPS at 5.6 km/h). Real travel keeps implied and GPS speed in
            // the same ballpark; drift does not.
            if (disp != Double.MAX_VALUE && timeSince > 0) {
                val impliedKmh = (disp / 1000.0) / (timeSince / 3_600_000.0)
                if (impliedKmh > 12.0 && speedKmh < impliedKmh * 0.5) {
                    return false
                }
                // Re-acquisition jumps: hundreds of meters after silence on a
                // poor fix are multipath teleports, not walked path.
                if (disp >= 100.0 && acc > 30.0 && speedKmh < 8.0) {
                    return false
                }
            }
            if (isStill && disp < maxOf(minDisp, AppConfig.STILL_MIN_DISPLACEMENT_M)) {
                return false
            }
            if (disp < AppConfig.JITTER_DISTANCE_M && speedKmh < 1.0) {
                return false
            }
            // Displacement inside the accuracy circle at low speed is noise.
            if (disp < acc * 0.6 && disp < 8.0 && speedKmh < 1.5) {
                return false
            }
            if (disp < minDisp && timeSince < sampleInterval) {
                return false
            }
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
        tryRecordPointWasFresh = true
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

    private fun buildSensorReadings(pid: String, now: Long, gpsMoving: Boolean = true): List<SensorReadingEntity> {
        stepSample(gpsMoving)
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

    /**
     * Updates the rolling step delta/cadence from the cumulative step
     * counter — but only when GPS proves the coordinates are changing.
     * Shaking a stationary phone can nudge the hardware counter; those
     * phantom steps are swallowed (prevSteps still advances so they can
     * never flush out later as a lump when real walking starts).
     */
    private fun stepSample(gpsMoving: Boolean = true) {
        if (stepsValue < 0) {
            // No counter events yet — the sensor may have become registrable
            // mid-patrol (permission grant raced the start). Retry each tick;
            // registerStepCounter() is idempotent and cheap once registered.
            registerStepCounter()
            return
        }
        val now = SystemClock.elapsedRealtime()
        if (!gpsMoving) {
            prevSteps = stepsValue
            prevStepsElapsed = now
            lastStepDelta = 0L
            lastCadence = 0f
            return
        }
        if (prevSteps >= 0 && now > prevStepsElapsed) {
            lastStepDelta = stepsValue - prevSteps
            val minutes = (now - prevStepsElapsed) / 60_000f
            lastCadence = if (minutes > 0f) lastStepDelta / minutes else 0f
        }
        prevSteps = stepsValue
        prevStepsElapsed = now
    }

    private fun computeMovement(telemetry: GpsTelemetry, gpsMoving: Boolean = true): MovementInfo {
        val speedKmh = telemetry.speedMps?.let { it * 3.6f }
        val cadence = lastCadence.takeIf { it > 0f }

        val result = lastArResult
        val fresh = result != null &&
            SystemClock.elapsedRealtime() - result.elapsedRealtimeMillis < AppConfig.AR_FRESH_MS
        if (fresh) {
            val best = result.mostProbableActivity
            val mode = MovementMode.fromGoogleDetectedActivity(best, result.probableActivities)
            if (mode != MovementMode.UNKNOWN && best.confidence >= AppConfig.AR_MIN_CONFIDENCE) {
                // GPS cross-check: Activity Recognition works off inertial
                // sensors, so shaking a stationary phone reports CYCLING with
                // high confidence. GPS coordinates don't lie — when they are
                // static, force STILL no matter what the inertial sensors say.
                if (!gpsMoving && mode != MovementMode.STILL) {
                    return MovementInfo(
                        mode = MovementMode.STILL,
                        confidence = 0.6f,
                        source = ModeSource.HEURISTIC,
                        speedKmh = speedKmh,
                        stepCadence = null
                    )
                }
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
