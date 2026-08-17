package com.nstrpatrol.app.time

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.nstrpatrol.app.MainActivity
import com.nstrpatrol.app.R

/**
 * Foreground service that runs for the whole duration of an active patrol.
 *
 * While it is running, Android keeps the process alive even if the user swipes
 * the app from recents or leaves the UI entirely, so the in-process telemetry
 * recorder ([TelemetryRecorder]) and GPS listeners keep capturing patrol data.
 * When no patrol is active the service is stopped, and the app can be killed
 * like any normal app.
 */
class PatrolForegroundService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.fgs_patrol_channel_name),
                NotificationManager.IMPORTANCE_LOW
            )
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())
        return START_STICKY
    }

    private fun buildNotification(): Notification {
        val contentIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.fgs_patrol_title))
            .setContentText(getString(R.string.fgs_patrol_text))
            .setSmallIcon(R.drawable.ic_stat_patrol)
            .setOngoing(true)
            .setContentIntent(contentIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "nstr_patrol_active"
        private const val NOTIFICATION_ID = 1001

        /** Starts the service. Must only be called while the app is in the foreground. */
        fun start(context: Context) {
            val intent = Intent(context, PatrolForegroundService::class.java)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, PatrolForegroundService::class.java))
        }
    }
}
