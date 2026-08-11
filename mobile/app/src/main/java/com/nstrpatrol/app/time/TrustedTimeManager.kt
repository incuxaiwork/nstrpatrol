package com.nstrpatrol.app.time

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.GnssStatus
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.Calendar

/**
 * Immutable snapshot of the time-integrity state the UI can react to.
 */
data class TimeIntegrityState(
    val gnssTimeAvailable: Boolean = false,
    val satelliteUtcMillis: Long? = null,
    val deviceUtcMillis: Long = System.currentTimeMillis(),
    val divergenceSeconds: Long = 0,
    val autoTimeEnabled: Boolean = true,
    val tamperDetected: Boolean = false,
    val lastFixAt: Long = 0,
    val satellites: Int = 0
)

/**
 * Trusted-time manager (anti-cheat).
 *
 * True UTC is read from the GNSS receiver via NMEA sentences ($GPRMC/$GPGGA) so a
 * ranger cannot fake timings by changing the device clock. The value is anchored to
 * the monotonic clock ([SystemClock.elapsedRealtime]) so `trustedUtcNow()` keeps
 * ticking correctly even if the wall clock is changed while the app runs.
 *
 * Tampering is flagged when:
 *  - the device auto-time setting (AUTO_TIME) is turned off, or
 *  - the device wall clock diverges from trusted satellite time beyond [DIVERGENCE_THRESHOLD_MS].
 *
 * Broadcast receivers for TIME_CHANGED / TIMEZONE_CHANGED / DATE_CHANGED force a
 * re-evaluation so a manual clock change is caught immediately.
 */
class TrustedTimeManager(private val appContext: Context) {

    private val locationManager =
        appContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val _state = MutableStateFlow(TimeIntegrityState(autoTimeEnabled = isAutoTimeEnabled()))
    val state: StateFlow<TimeIntegrityState> = _state.asStateFlow()

    @Volatile
    private var initialSystemTimeMillis: Long = System.currentTimeMillis()
    @Volatile
    private var initialElapsedRealtime: Long = SystemClock.elapsedRealtime()

    @Volatile
    private var anchorGnssUtcMillis: Long? = null
    @Volatile
    private var anchorElapsedRealtime: Long = SystemClock.elapsedRealtime()

    private val settingsObserver = object : android.database.ContentObserver(android.os.Handler(android.os.Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean) {
            evaluate()
        }
    }

    init {
        listenToNmea()
        startGpsFixRequest()
        registerClockChangeReceiver()
        registerSettingsObserver()
        startPeriodicTicker()
        evaluate()
    }

    private fun startPeriodicTicker() {
        scope.launch {
            while (true) {
                evaluate()
                delay(1000)
            }
        }
    }

    private fun registerSettingsObserver() {
        try {
            appContext.contentResolver.registerContentObserver(
                Settings.Global.getUriFor(Settings.Global.AUTO_TIME),
                false,
                settingsObserver
            )
            appContext.contentResolver.registerContentObserver(
                Settings.Global.getUriFor(Settings.Global.AUTO_TIME_ZONE),
                false,
                settingsObserver
            )
        } catch (e: Exception) {
            // Ignored if setting uri is protected on vendor ROMs
        }
    }

    /**
     * True UTC at this instant, derived from the GNSS anchor + monotonic clock.
     *
     * Anchored to the monotonic clock ([SystemClock.elapsedRealtime]) so changing
     * the device wall clock in settings NEVER causes trustedUtcNow() to change or jump.
     */
    fun trustedUtcNow(): Long {
        val satellite = anchorGnssUtcMillis
        return if (satellite != null) {
            satellite + (SystemClock.elapsedRealtime() - anchorElapsedRealtime)
        } else {
            initialSystemTimeMillis + (SystemClock.elapsedRealtime() - initialElapsedRealtime)
        }
    }

    fun isAutoTimeEnabled(): Boolean {
        return try {
            Settings.Global.getInt(
                appContext.contentResolver,
                Settings.Global.AUTO_TIME
            ) == 1
        } catch (e: Exception) {
            true
        }
    }

    private fun evaluate() {
        val satellite = anchorGnssUtcMillis
        val trusted = trustedUtcNow()
        val device = System.currentTimeMillis()
        val divergence = Math.abs(device - trusted)
        val autoTime = isAutoTimeEnabled()
        val tamper = (divergence > DIVERGENCE_THRESHOLD_MS) || !autoTime
        _state.value = TimeIntegrityState(
            gnssTimeAvailable = satellite != null,
            satelliteUtcMillis = satellite ?: trusted,
            deviceUtcMillis = device,
            divergenceSeconds = divergence / 1000,
            autoTimeEnabled = autoTime,
            tamperDetected = tamper,
            lastFixAt = if (satellite != null) SystemClock.elapsedRealtime() else 0,
            satellites = _state.value.satellites
        )
    }

    @SuppressLint("MissingPermission")
    private fun listenToNmea() {
        if (!hasLocationPermission()) return
        try {
            locationManager.addNmeaListener(
                android.location.OnNmeaMessageListener { nmea, _ ->
                    val utc = NmeaParser.parseUtcMillis(nmea)
                    if (utc != null) {
                        anchorGnssUtcMillis = utc
                        anchorElapsedRealtime = SystemClock.elapsedRealtime()
                        evaluate()
                    }
                },
                android.os.Handler(appContext.mainLooper)
            )
        } catch (e: Exception) {
            // GNSS provider not available; detection still works via broadcasts/settings.
        }
    }

    @SuppressLint("MissingPermission")
    private fun startGpsFixRequest() {
        if (!hasLocationPermission()) return
        try {
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                MIN_FIX_INTERVAL_MS,
                0f,
                object : LocationListener {
                    override fun onLocationChanged(location: Location) {
                        val time = location.time
                        if (time > 0) {
                            anchorGnssUtcMillis = time
                            anchorElapsedRealtime = SystemClock.elapsedRealtime()
                            evaluate()
                        }
                    }

                    @Deprecated("Deprecated in Java")
                    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
                    override fun onProviderEnabled(provider: String) {}
                    override fun onProviderDisabled(provider: String) {}
                }
            )
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                locationManager.registerGnssStatusCallback(
                    object : GnssStatus.Callback() {
                        override fun onSatelliteStatusChanged(status: GnssStatus) {
                            _state.value = _state.value.copy(satellites = status.satelliteCount)
                        }
                    }
                )
            }
        } catch (e: Exception) {
            // ignored
        }
    }

    private fun registerClockChangeReceiver() {
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_TIME_CHANGED)
            addAction(Intent.ACTION_TIMEZONE_CHANGED)
            addAction(Intent.ACTION_DATE_CHANGED)
        }
        try {
            androidx.core.content.ContextCompat.registerReceiver(
                appContext,
                clockReceiver,
                filter,
                androidx.core.content.ContextCompat.RECEIVER_EXPORTED
            )
        } catch (e: Exception) {
            try {
                appContext.registerReceiver(clockReceiver, filter)
            } catch (ignored: Exception) {}
        }
    }

    private val clockReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            evaluate()
        }
    }

    private fun hasLocationPermission(): Boolean {
        return androidx.core.content.ContextCompat.checkSelfPermission(
            appContext,
            android.Manifest.permission.ACCESS_FINE_LOCATION
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    }

    companion object {
        const val DIVERGENCE_THRESHOLD_MS = 60_000L
        const val MIN_FIX_INTERVAL_MS = 30_000L
    }
}

/**
 * Minimal NMEA parser for UTC time extraction.
 * Handles $GPRMC (recommended minimum): fields = time(1) status(2) lat(3) N/S(4)
 * lon(5) E/W(6) speed(7) course(8) date(9).
 */
object NmeaParser {

    /** Returns UTC epoch millis parsed from a GPRMC sentence, or null if no fix / invalid. */
    fun parseUtcMillis(nmea: String): Long? {
        if (!nmea.contains("\$GPRMC")) return null
        val parts = nmea.split(",")
        if (parts.size < 10) return null
        if (parts[2] != "A") return null // V = invalid fix
        val time = parts[1]
        val date = parts[9]
        if (time.length < 6 || date.length < 6) return null

        val hh = time.substring(0, 2).toIntOrNull() ?: return null
        val mm = time.substring(2, 4).toIntOrNull() ?: return null
        val ss = time.substring(4, 6).toIntOrNull() ?: return null
        val dd = date.substring(0, 2).toIntOrNull() ?: return null
        val mmDate = date.substring(2, 4).toIntOrNull() ?: return null
        val yy = 2000 + (date.substring(4, 6).toIntOrNull() ?: return null)

        val cal = Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"))
        cal.clear()
        cal.set(yy, mmDate - 1, dd, hh, mm, ss)
        return cal.timeInMillis
    }
}
