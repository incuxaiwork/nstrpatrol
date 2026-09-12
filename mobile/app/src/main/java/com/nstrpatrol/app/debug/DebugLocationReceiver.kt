package com.nstrpatrol.app.debug

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.Toast

/**
 * Receives debug GPS override broadcasts from ADB.
 *
 * Set location:
 *   adb shell am broadcast -a com.nstrpatrol.app.DEBUG_SET_LOCATION \
 *       --el lat 15.9213 --el lng 79.0068 \
 *       -n com.nstrpatrol.app/.debug.DebugLocationReceiver
 *
 * Clear location:
 *   adb shell am broadcast -a com.nstrpatrol.app.DEBUG_CLEAR_LOCATION \
 *       -n com.nstrpatrol.app/.debug.DebugLocationReceiver
 */
class DebugLocationReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            "com.nstrpatrol.app.DEBUG_SET_LOCATION" -> {
                val lat = intent.getDoubleExtra("lat",
                    intent.getFloatExtra("lat", 0f).toDouble())
                val lng = intent.getDoubleExtra("lng",
                    intent.getFloatExtra("lng", 0f).toDouble())
                if (lat != 0.0 || lng != 0.0) {
                    DebugLocation.set(context, lat, lng)
                    Log.w("DebugLocation", "GPS override set: ($lat, $lng)")
                    Toast.makeText(context, "GPS override: $lat, $lng", Toast.LENGTH_SHORT).show()
                }
            }
            "com.nstrpatrol.app.DEBUG_CLEAR_LOCATION" -> {
                DebugLocation.clear(context)
                Log.w("DebugLocation", "GPS override cleared")
                Toast.makeText(context, "GPS override cleared", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
