package com.nstrpatrol.app.data

import android.annotation.SuppressLint
import android.content.Context
import android.location.LocationManager
import com.nstrpatrol.app.data.db.IncidentEntity
import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.data.map.BackendApiClient
import com.nstrpatrol.app.data.SyncController
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.UUID

/**
 * Persists a reported incident locally (PENDING) and kicks off a sync attempt.
 * The actual upload is driven by [SyncManager] (fired on connectivity), so this
 * is safe to call offline — the row flushes automatically once online.
 *
 * Non-suspending on purpose: it builds the entity synchronously and performs the
 * DB write + sync on an IO coroutine, so it can be called directly from a click
 * handler.
 */
fun submitIncident(
    dao: TelemetryDao,
    api: BackendApiClient,
    patrolTimer: PatrolTimer,
    context: Context,
    type: String,
    title: String,
    description: String?,
    severity: String,
    details: Map<String, Any?>,
    photos: List<String>
) {
    val loc = lastKnownLocation(context)
    val now = System.currentTimeMillis()
    val entity = IncidentEntity(
        id = UUID.randomUUID().toString(),
        patrolId = patrolTimer.patrolId,
        type = type,
        title = title,
        description = description,
        severity = severity.uppercase(),
        detailsJson = JSONObject(
            details.mapValues { it.value?.toString() ?: JSONObject.NULL }
        ).toString(),
        latitude = loc?.first,
        longitude = loc?.second,
        photos = JSONArray(photos).toString(),
        occurredAt = now,
        reportedAt = now
    )
    CoroutineScope(Dispatchers.IO).launch {
        dao.insertIncident(entity)
        SyncController.sync(dao, api)
    }
}

@SuppressLint("MissingPermission")
fun lastKnownLocation(context: Context): Pair<Double, Double>? {
    val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    for (provider in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
        runCatching {
            val loc = lm.getLastKnownLocation(provider) ?: return@runCatching
            return loc.latitude to loc.longitude
        }
    }
    return null
}

/** Human-readable captured-coordinate string for the "Captured" panel, or null. */
fun capturedLocationText(context: Context): String? =
    lastKnownLocation(context)?.let { (lat, lon) ->
        String.format(Locale.US, "%.4f° N, %.4f° E", lat, lon)
    }
