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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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

    private val _state = MutableStateFlow(TimeIntegrityState(autoTimeEnabled = isAutoTimeEnabled()))
    val state: StateFlow<TimeIntegrityState> = _state.asStateFlow()

    @Volatile
    private var anchorGnssUtcMillis: Long? = null
    @Volatile
    private var anchorElapsedRealtime: Long = SystemClock.elapsedRealtime()

    init {
        listenToNmea()
        startGpsFixRequest()
        registerClockChangeReceiver()
        evaluate()
    }

    /**
     * True UTC at this instant, derived from the GNSS anchor + monotonic clock.
     *
     * Without a GNSS anchor there is no tamper-proof time source, so the raw
     * device clock is returned. (Adding the monotonic delta to the raw clock
     * here would double-count elapsed time and advance at 2x real speed.)
     */
    fun trustedUtcNow(): Long {
        val anchor = anchorGnssUtcMillis
        return if (anchor != null) {
            anchor + (SystemClock.elapsedRealtime() - anchorElapsedRealtime)
        } else {
            System.currentTimeMillis()
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
        val device = System.currentTimeMillis()
        val divergence = satellite?.let { Math.abs(device - it) } ?: 0L
        val autoTime = isAutoTimeEnabled()
        val tamper = (satellite != null && divergence > DIVERGENCE_THRESHOLD_MS) || !autoTime
        _state.value = TimeIntegrityState(
            gnssTimeAvailable = satellite != null,
            satelliteUtcMillis = satellite,
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
        appContext.registerReceiver(clockReceiver, filter)
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
