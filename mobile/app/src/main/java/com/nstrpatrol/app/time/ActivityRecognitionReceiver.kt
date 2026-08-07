package com.nstrpatrol.app.time

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.ActivityRecognitionResult

/**
 * Manifest-declared receiver for Google Activity Recognition results.
 *
 * The recorder creates a [android.app.PendingIntent] targeting this component;
 * Play services delivers detected-activity results to it. The callback is
 * forwarded to the live [TelemetryRecorder] instance (set in its init).
 */
class ActivityRecognitionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context?, intent: Intent?) {
        android.util.Log.d(TAG, "AR broadcast received: action=${intent?.action}")
        val result = intent?.let { ActivityRecognitionResult.extractResult(it) }
        if (result != null) {
            val best = result.mostProbableActivity
            android.util.Log.d(TAG, "AR result: type=${best.type} conf=${best.confidence}")
            onActivityResult?.invoke(result)
        }
    }

    companion object {
        private const val TAG = "ActivityRecognition"

        @Volatile
        var onActivityResult: ((ActivityRecognitionResult) -> Unit)? = null
    }
}
