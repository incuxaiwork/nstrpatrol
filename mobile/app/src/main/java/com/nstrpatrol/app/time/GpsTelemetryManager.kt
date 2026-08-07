package com.nstrpatrol.app.time

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.GnssStatus
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.abs

/** GNSS constellation a tracked satellite belongs to. */
enum class GnssConstellation(val label: String) {
    GPS("GPS"),
    GLONASS("GLONASS"),
    GALILEO("Galileo"),
    BEIDOU("BeiDou"),
    QZSS("QZSS"),
    NAVIC("NavIC"),
    SBAS("SBAS"),
    UNKNOWN("Unknown");

    companion object {
        fun fromType(type: Int): GnssConstellation = when (type) {
            GnssStatus.CONSTELLATION_GPS -> GPS
            GnssStatus.CONSTELLATION_GLONASS -> GLONASS
            GnssStatus.CONSTELLATION_SBAS -> SBAS
            GnssStatus.CONSTELLATION_BEIDOU -> BEIDOU
            GnssStatus.CONSTELLATION_QZSS -> QZSS
            GnssStatus.CONSTELLATION_GALILEO -> GALILEO
            else ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                    type == GnssStatus.CONSTELLATION_IRNSS
                ) {
                    NAVIC
                } else {
                    UNKNOWN
                }
        }
    }
}

/** A single satellite tracked by the GNSS receiver. */
data class GnssSatellite(
    val svid: Int,
    val constellation: GnssConstellation,
    val cn0DbHz: Float,
    val elevationDegrees: Float,
    val azimuthDegrees: Float,
    val usedInFix: Boolean,
    val carrierFrequencyHz: Float
) {
    /** Human readable band used by the satellite, e.g. "L1" or "L5". */
    val bandLabel: String
        get() = when {
            carrierFrequencyHz >= 1.5e9f -> "L1"
            carrierFrequencyHz >= 1.1e9f -> "L5"
            else -> "L-band"
        }
}

/**
 * Immutable snapshot of everything the GNSS receiver and location providers report.
 * The UI collects this via [GpsTelemetryManager.telemetry].
 */
data class GpsTelemetry(
    val available: Boolean = false,
    val enabled: Boolean = false,
    val permissionGranted: Boolean = false,
    val provider: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val altitudeMeters: Double? = null,
    val horizontalAccuracyMeters: Float? = null,
    val verticalAccuracyMeters: Float? = null,
    val speedMps: Float? = null,
    val bearingDegrees: Float? = null,
    val headingDegrees: Float? = null,
    val fixTimeMillis: Long? = null,
    val satellites: List<GnssSatellite> = emptyList(),
    val satelliteUtcMillis: Long? = null,
    val lastUpdatedElapsedRealtime: Long = 0L
) {
    val visibleSatellites: Int get() = satellites.size
    val usedInFix: Int get() = satellites.count { it.usedInFix }

    val avgCn0: Float?
        get() = if (satellites.isNotEmpty()) {
            satellites.map { it.cn0DbHz }.average().toFloat()
        } else {
            null
        }

    /** True if we have a recent, accurate GPS-provider fix. */
    val hasGpsFix: Boolean
        get() = provider == "gps" &&
            latitude != null && longitude != null &&
            horizontalAccuracyMeters != null &&
            ageMs in 0..15_000

    /** True if the GNSS receiver reports a fix is being used, or a fresh GPS fix exists. */
    val hasFix: Boolean
        get() = hasGpsFix || (latitude != null && longitude != null && usedInFix >= 3)

    val is3dFix: Boolean get() = hasFix && altitudeMeters != null && usedInFix >= 4

    val fixModeLabel: String
        get() = when {
            is3dFix -> "3D Fix"
            hasFix -> "2D Fix"
            else -> "No Fix"
        }

    /** Age of the last location fix in ms, or -1 if never updated. */
    val ageMs: Long
        get() = if (lastUpdatedElapsedRealtime == 0L) -1L
        else SystemClock.elapsedRealtime() - lastUpdatedElapsedRealtime

    fun satellitesByConstellation(): Map<GnssConstellation, Int> =
        satellites.groupingBy { it.constellation }.eachCount()

    fun inUseByConstellation(): Map<GnssConstellation, Int> =
        satellites.filter { it.usedInFix }.groupingBy { it.constellation }.eachCount()

    fun strongestSatellites(limit: Int = 6): List<GnssSatellite> =
        satellites.sortedByDescending { it.cn0DbHz }.take(limit)
}

/**
 * Live GNSS telemetry provider.
 *
 * Aggregates everything the platform exposes so the diagnostics screen is driven by
 * real sensor data instead of hard-coded values:
 *  - continuous location fixes (lat/lon/altitude/accuracy/speed/bearing/provider)
 *  - the full satellite constellation table via [GnssStatus.Callback]
 *  - satellite-derived UTC time from raw NMEA sentences ([NmeaParser])
 */
class GpsTelemetryManager(private val appContext: Context) {

    private val locationManager =
        appContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    private val _telemetry = MutableStateFlow(
        GpsTelemetry(
            permissionGranted = hasLocationPermission(),
            enabled = isLocationEnabled()
        )
    )
    val telemetry: StateFlow<GpsTelemetry> = _telemetry.asStateFlow()

    private val handler = Handler(Looper.getMainLooper())
    private val gnssExecutor = ContextCompat.getMainExecutor(appContext)

    private val sensorManager =
        appContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager

    private val rotationVectorSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    private val accelerometerSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val magnetometerSensor = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)

    private val gravityValues = FloatArray(3)
    private val magneticValues = FloatArray(3)
    private var hasGravity = false
    private var hasMagnetic = false
    private var lastHeadingDegrees = -1f

    /** Live magnetic heading from the device sensors (0=N, 90=E, clockwise). */
    private val headingListener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
            when (event.sensor.type) {
                Sensor.TYPE_ROTATION_VECTOR -> updateHeadingFromRotationVector(event.values)
                Sensor.TYPE_ACCELEROMETER -> {
                    System.arraycopy(event.values, 0, gravityValues, 0, 3)
                    hasGravity = true
                    updateHeadingFromMagnetic()
                }
                Sensor.TYPE_MAGNETIC_FIELD -> {
                    System.arraycopy(event.values, 0, magneticValues, 0, 3)
                    hasMagnetic = true
                    updateHeadingFromMagnetic()
                }
            }
        }

        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
    }

    private val gnssCallback = object : GnssStatus.Callback() {
        override fun onStarted() {
            Log.d(TAG, "GNSS started")
            _telemetry.value = _telemetry.value.copy(enabled = isLocationEnabled())
            resync()
        }

        override fun onStopped() {
            Log.d(TAG, "GNSS stopped")
            _telemetry.value = _telemetry.value.copy(enabled = isLocationEnabled())
        }

        override fun onFirstFix(ttffMillis: Int) {
            Log.d(TAG, "GNSS first fix after ${ttffMillis}ms")
        }

        override fun onSatelliteStatusChanged(status: GnssStatus) {
            processGnssStatus(status)
        }
    }

    private val locationListener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            _telemetry.value = _telemetry.value.copy(
                available = true,
                enabled = isLocationEnabled(),
                provider = location.provider,
                latitude = location.latitude,
                longitude = location.longitude,
                altitudeMeters = location.altitude,
                horizontalAccuracyMeters =
                    if (location.hasAccuracy()) location.accuracy else null,
                verticalAccuracyMeters =
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                        location.hasVerticalAccuracy()
                    ) {
                        location.verticalAccuracyMeters
                    } else {
                        null
                    },
                speedMps = if (location.hasSpeed()) location.speed else null,
                bearingDegrees = if (location.hasBearing()) location.bearing else null,
                fixTimeMillis = location.time,
                lastUpdatedElapsedRealtime = SystemClock.elapsedRealtime()
            )
        }

        override fun onProviderEnabled(provider: String) {
            resync()
        }

        override fun onProviderDisabled(provider: String) {
            resync()
        }

        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
    }

    private val registeredProviders = mutableSetOf<String>()
    private var listenersStarted = false

    init {
        // The poll runs from the very start (even without permission) so the
        // manager self-starts and picks up providers/permission automatically.
        pollProviderState()
        ensureStarted()
    }

    /** Called from the UI after the fine-location permission dialog resolves. */
    fun onPermissionResult(granted: Boolean) {
        _telemetry.value = _telemetry.value.copy(permissionGranted = granted)
        ensureStarted()
    }

    /** Registers the passive GNSS listeners exactly once, once permission exists. */
    private fun ensureStarted() {
        if (listenersStarted || !hasLocationPermission()) return
        listenersStarted = true

        try {
            locationManager.addNmeaListener({ nmea, _ ->
                val utc = NmeaParser.parseUtcMillis(nmea)
                if (utc != null) {
                    _telemetry.value = _telemetry.value.copy(satelliteUtcMillis = utc)
                }
            }, handler)
        } catch (e: Exception) {
            // NMEA not available; GNSS time just stays null.
        }

        registerGnssCallback()
        registerHeadingSensors()
        resync()
    }

    /** Registers the magnetometer/rotation-vector listener for the compass. */
    private fun registerHeadingSensors() {
        try {
            if (rotationVectorSensor != null) {
                sensorManager.registerListener(
                    headingListener,
                    rotationVectorSensor,
                    SensorManager.SENSOR_DELAY_UI,
                    handler
                )
            } else if (accelerometerSensor != null && magnetometerSensor != null) {
                sensorManager.registerListener(
                    headingListener,
                    accelerometerSensor,
                    SensorManager.SENSOR_DELAY_UI,
                    handler
                )
                sensorManager.registerListener(
                    headingListener,
                    magnetometerSensor,
                    SensorManager.SENSOR_DELAY_UI,
                    handler
                )
            } else {
                Log.w(TAG, "No heading sensors available on this device")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Heading sensor registration failed", e)
        }
    }

    private fun updateHeadingFromRotationVector(values: FloatArray) {
        val rotation = FloatArray(9)
        SensorManager.getRotationMatrixFromVector(rotation, values)
        setHeading(rotation)
    }

    private fun updateHeadingFromMagnetic() {
        if (!hasGravity || !hasMagnetic) return
        val rotation = FloatArray(9)
        if (!SensorManager.getRotationMatrix(rotation, null, gravityValues, magneticValues)) return
        setHeading(rotation)
    }

    private fun setHeading(rotation: FloatArray) {
        val orientation = FloatArray(3)
        SensorManager.getOrientation(rotation, orientation)
        val degrees = Math.toDegrees(orientation[0].toDouble()).toFloat()
        val heading = (degrees + 360f) % 360f
        if (lastHeadingDegrees < 0f || abs(heading - lastHeadingDegrees) >= 0.5f) {
            lastHeadingDegrees = heading
            _telemetry.value = _telemetry.value.copy(headingDegrees = heading)
        }
    }

    private fun registerGnssCallback() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                locationManager.registerGnssStatusCallback(gnssExecutor, gnssCallback)
            } else {
                @Suppress("DEPRECATION")
                locationManager.registerGnssStatusCallback(gnssCallback)
            }
        } catch (e: Exception) {
            Log.w(TAG, "GNSS status callback registration failed", e)
        }
    }

    /**
     * Re-reads the current permission / provider state, registers a location
     * update listener on every provider that has become available since the
     * last check, and reads a fresh GNSS satellite snapshot directly.
     */
    @SuppressLint("MissingPermission")
    private fun resync() {
        val permission = hasLocationPermission()
        val enabled = isLocationEnabled()
        _telemetry.value = _telemetry.value.copy(
            permissionGranted = permission,
            enabled = enabled
        )
        if (!permission) return

        providers.forEach { provider ->
            if (locationManager.isProviderEnabled(provider) && provider !in registeredProviders) {
                try {
                    locationManager.requestLocationUpdates(
                        provider,
                        UPDATE_INTERVAL_MS,
                        0f,
                        locationListener,
                        Looper.getMainLooper()
                    )
                    registeredProviders += provider
                    Log.d(TAG, "Registered location updates on provider '$provider'")
                } catch (e: Exception) {
                    Log.w(TAG, "requestLocationUpdates failed on '$provider'", e)
                }
            }
        }

        if (_telemetry.value.satellites.isEmpty()) {
            readGpsStatusLegacy()
        }
    }

    /**
     * Fallback satellite read via the legacy [LocationManager.getGpsStatus] API,
     * used only while the (preferred) GnssStatus callback has not delivered any
     * satellites yet. The legacy API has no constellation info, hence UNKNOWN.
     */
    @SuppressLint("MissingPermission")
    private fun readGpsStatusLegacy() {
        if (!hasLocationPermission()) return
        try {
            val status = locationManager.getGpsStatus(null) ?: return
            val satellites = mutableListOf<GnssSatellite>()
            status.satellites.forEach { sat ->
                satellites += GnssSatellite(
                    svid = sat.getPrn(),
                    constellation = GnssConstellation.UNKNOWN,
                    cn0DbHz = sat.getSnr(),
                    elevationDegrees = sat.getElevation(),
                    azimuthDegrees = sat.getAzimuth(),
                    usedInFix = sat.usedInFix(),
                    carrierFrequencyHz = 0f
                )
            }
            if (satellites.isNotEmpty()) {
                _telemetry.value = _telemetry.value.copy(
                    satellites = satellites,
                    enabled = isLocationEnabled()
                )
            }
        } catch (e: Exception) {
            // legacy read unavailable
        }
    }

    private fun pollProviderState() {
        handler.post(object : Runnable {
            override fun run() {
                ensureStarted()
                resync()
                handler.postDelayed(this, POLL_INTERVAL_MS)
            }
        })
    }

    @SuppressLint("MissingPermission")
    private fun processGnssStatus(status: GnssStatus) {
        val satellites = mutableListOf<GnssSatellite>()
        for (i in 0 until status.satelliteCount) {
            satellites += GnssSatellite(
                svid = status.getSvid(i),
                constellation = GnssConstellation.fromType(status.getConstellationType(i)),
                cn0DbHz = status.getCn0DbHz(i),
                elevationDegrees = status.getElevationDegrees(i),
                azimuthDegrees = status.getAzimuthDegrees(i),
                usedInFix = status.usedInFix(i),
                carrierFrequencyHz =
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        status.getCarrierFrequencyHz(i)
                    } else {
                        0f
                    }
            )
        }
        val inUse = satellites.count { it.usedInFix }
        if (satellites.size != _telemetry.value.visibleSatellites || inUse != _telemetry.value.usedInFix) {
            Log.d(TAG, "Satellites: ${satellites.size} visible, $inUse in use")
        }
        _telemetry.value = _telemetry.value.copy(
            satellites = satellites,
            enabled = isLocationEnabled()
        )
    }

    /** True if any location provider (GPS or network) is switched on. */
    private fun isLocationEnabled(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            locationManager.isLocationEnabled()
        } else {
            providers.any { locationManager.isProviderEnabled(it) }
        }
    }

    private fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(
            appContext,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

    companion object {
        private const val TAG = "GpsTelemetry"
        const val UPDATE_INTERVAL_MS = 1000L
        const val POLL_INTERVAL_MS = 2000L
        private val providers = listOf(
            LocationManager.GPS_PROVIDER,
            LocationManager.NETWORK_PROVIDER
        )
    }
}
