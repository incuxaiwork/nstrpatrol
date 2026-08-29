package com.nstrpatrol.app.debug

import android.content.Context

/**
 * Debug GPS location override — allows testing location validation from any
 * physical location via ADB:
 *
 *   adb shell am broadcast -a com.nstrpatrol.app.DEBUG_SET_LOCATION \
 *       --el lat 15.9213 --el lng 79.0068 \
 *       -n com.nstrpatrol.app/.debug.DebugLocationReceiver
 *
 *   adb shell am broadcast -a com.nstrpatrol.app.DEBUG_CLEAR_LOCATION \
 *       -n com.nstrpatrol.app/.debug.DebugLocationReceiver
 */
object DebugLocation {
    private const val PREFS = "nstr_debug_location"
    private const val KEY_LAT = "override_lat"
    private const val KEY_LNG = "override_lng"
    private const val KEY_ENABLED = "override_enabled"

    fun set(context: Context, lat: Double, lng: Double) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putFloat(KEY_LAT, lat.toFloat())
            .putFloat(KEY_LNG, lng.toFloat())
            .putBoolean(KEY_ENABLED, true)
            .apply()
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_ENABLED, false)
            .apply()
    }

    /** Returns (lat, lng) if a debug override is active, else null. */
    fun get(context: Context): Pair<Double, Double>? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_ENABLED, false)) return null
        val lat = prefs.getFloat(KEY_LAT, 0f).toDouble()
        val lng = prefs.getFloat(KEY_LNG, 0f).toDouble()
        return if (lat != 0.0 || lng != 0.0) lat to lng else null
    }
}
