package com.nstrpatrol.app.data

import android.util.Log
import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.data.db.SensorReadingEntity
import com.nstrpatrol.app.data.map.ApiException
import com.nstrpatrol.app.data.map.BackendApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/**
 * Pushes locally recorded patrol data to the backend.
 *
 * Offline-first: every row is written to Room first with syncStatus PENDING,
 * then uploaded here. The summary reports what succeeded and, crucially, the
 * first error encountered (e.g. a 401) so the UI can surface *why* a sync
 * failed instead of silently leaving rows PENDING.
 */
object SyncManager {

    private const val TAG = "SyncManager"
    private const val CHUNK_SIZE = 500

    data class SyncSummary(
        val syncedItems: Int,
        val failedItems: Int,
        val error: String?
    )

    suspend fun syncNow(
        dao: TelemetryDao,
        api: BackendApiClient,
        onProgress: (Float) -> Unit = {}
    ): SyncSummary = withContext(Dispatchers.IO) {
        val totalItems = dao.sessionsToSync().size +
            dao.pendingPointRows().size +
            dao.pendingReadingRows().size +
            dao.pendingIncidents().size

        Log.i(TAG, "Sync started: $totalItems pending items")

        var processed = 0
        val advance: (Int) -> Unit = { count ->
            processed += count
            if (totalItems > 0) {
                onProgress((processed.toFloat() / totalItems).coerceIn(0f, 1f))
            }
        }

        var syncedItems = 0
        var failedItems = 0
        var firstError: String? = null

        val fail: (Int, Throwable?) -> Unit = { count, t ->
            failedItems += count
            advance(count)
            Log.e(TAG, "Sync failed ($count items): ${t?.message}")
            if (firstError == null) {
                firstError = (t as? ApiException)?.let {
                    "HTTP ${it.statusCode}${it.errorCode?.let { c -> " ($c)" } ?: ""}: ${it.message ?: "error"}"
                } ?: t?.message ?: "unknown error"
            }
        }
        val ok: (Int) -> Unit = { count ->
            syncedItems += count
            advance(count)
        }

        syncPatrols(dao, api, ok, fail)
        syncPoints(dao, api, ok, fail)
        syncReadings(dao, api, ok, fail)
        syncIncidents(dao, api, ok, fail)
        onProgress(1f)

        Log.i(TAG, "Sync complete: $syncedItems synced, $failedItems failed")
        SyncSummary(syncedItems, failedItems, firstError)
    }

    /**
     * Re-runs [block] up to 3 times on transport failures (connection refused,
     * DNS/timeout, cold-starting backend) so a flaky or just-waking server
     * doesn't immediately fail the sync. Server-side errors (real HTTP status)
     * are not retried.
     */
    private suspend fun <T> withNetworkRetry(block: suspend () -> T): T {
        var attempt = 0
        while (true) {
            try {
                return block()
            } catch (e: ApiException) {
                if (e.statusCode != 0 || attempt >= 2) throw e
                attempt++
                Log.w(TAG, "Transport error, retry $attempt: ${e.message}")
                delay(2_000L * attempt)
            }
        }
    }

    private suspend fun syncPatrols(
        dao: TelemetryDao,
        api: BackendApiClient,
        ok: (Int) -> Unit,
        fail: (Int, Throwable?) -> Unit
    ) {
        val sessions = dao.sessionsToSync()
        if (sessions.isEmpty()) return
        Log.d(TAG, "Syncing ${sessions.size} patrol sessions")
        for (session in sessions) {
            val body = JSONObject().apply {
                put("id", session.patrolId)
                put("type", mapPatrolType(session.patrolType))
                put("name", buildPatrolName(session))
            }
            // Idempotent: create first; if that fails (e.g. the patrol already
            // exists on the server from a prior attempt) fall back to completing
            // it. Either success means the row is synced — otherwise it stays
            // PENDING and is retried on the next sync.
            val created = runCatching { withNetworkRetry { api.createPatrol(body); true } }.getOrElse { e -> fail(1, e); false }
            val completed = if (created) true
            else runCatching { withNetworkRetry { api.completePatrol(session.patrolId); true } }.getOrElse { e -> fail(1, e); false }
            if (created || completed) {
                dao.updateSessionSyncStatus(session.patrolId, "SYNCED")
                ok(1)
                if (session.status == "COMPLETED") {
                    runCatching { withNetworkRetry { api.completePatrol(session.patrolId) } }
                }
            }
        }
    }

    private suspend fun syncPoints(
        dao: TelemetryDao,
        api: BackendApiClient,
        ok: (Int) -> Unit,
        fail: (Int, Throwable?) -> Unit
    ) {
        val points = dao.pendingPointRows()
        if (points.isEmpty()) return
        Log.d(TAG, "Syncing ${points.size} patrol points across ${points.groupBy { it.patrolId }.size} patrols")
        for ((patrolId, rows) in points.groupBy { it.patrolId }) {
            val chunks = rows.chunked(CHUNK_SIZE)
            Log.d(TAG, "Patrol $patrolId: ${rows.size} points in ${chunks.size} chunk(s)")
            for ((idx, chunk) in chunks.withIndex()) {
                runCatching {
                    val records = JSONArray()
                    for (p in chunk) {
                        records.put(JSONObject().apply {
                            put("patrolId", p.patrolId)
                            put("timestamp", p.timestamp)
                            put("latitude", p.latitude)
                            put("longitude", p.longitude)
                            p.altitude?.let { put("altitude", it) }
                            p.speed?.let { put("speed", it.toDouble()) }
                            p.bearing?.let { put("bearing", it.toDouble()) }
                            p.accuracy?.let { put("accuracy", it.toDouble()) }
                        })
                    }
                    val body = JSONObject().apply {
                        put("patrolId", patrolId)
                        put("batches", JSONArray().put(JSONObject().apply {
                            put("entity", "points")
                            put("records", records)
                        }))
                    }
                    withNetworkRetry { api.postJson("/api/sync/upload", body) }
                    Log.d(TAG, "Points chunk ${idx + 1}/${chunks.size} uploaded (${chunk.size} records)")
                }.onFailure { fail(chunk.size, it); return }
            }
            dao.markPointsSynced(patrolId)
            ok(rows.size)
        }
    }

    /**
     * Uploads all sensor readings for a patrol in a SINGLE request by batching
     * all entity types (accelerometer, gyroscope, magnetometer, barometer,
     * step-readings) into the `batches` array. This reduces HTTP round trips
     * from 5 per patrol to 1.
     *
     * Within each entity type, readings are chunked into [CHUNK_SIZE] groups
     * to keep payload size manageable.
     */
    private suspend fun syncReadings(
        dao: TelemetryDao,
        api: BackendApiClient,
        ok: (Int) -> Unit,
        fail: (Int, Throwable?) -> Unit
    ) {
        val readings = dao.pendingReadingRows()
        if (readings.isEmpty()) return
        val byPatrol = readings.groupBy { it.patrolId }
        Log.d(TAG, "Syncing ${readings.size} sensor readings across ${byPatrol.size} patrols")

        for ((patrolId, patrolReadings) in byPatrol) {
            val byEntity = patrolReadings.groupBy { mapReadingEntity(it.type) }.filterKeys { it != null }

            // Build all batches (one per entity, possibly chunked) in one list
            val allBatches = mutableListOf<JSONObject>()
            for ((entity, recs) in byEntity) {
                val chunks = recs.chunked(CHUNK_SIZE)
                for (chunk in chunks) {
                    val records = JSONArray()
                    for (r in chunk) {
                        records.put(JSONObject().apply {
                            put("patrolId", r.patrolId)
                            put("timestamp", r.timestamp)
                            when (entity) {
                                "step-readings" -> put("steps", r.value?.toInt() ?: 0)
                                "barometer" -> put("pressureHpa", r.value?.toDouble() ?: 0.0)
                                else -> {
                                    r.x?.let { put("x", it.toDouble()) }
                                    r.y?.let { put("y", it.toDouble()) }
                                    r.z?.let { put("z", it.toDouble()) }
                                }
                            }
                        })
                    }
                    allBatches.add(JSONObject().apply {
                        put("entity", entity)
                        put("records", records)
                    })
                }
            }

            // Send all batches in a single request (backend supports up to 20)
            // Split into groups of 18 to stay under the backend's 20-batch limit
            val batchesPerRequest = 18
            val requestGroups = allBatches.chunked(batchesPerRequest)
            Log.d(TAG, "Patrol $patrolId: ${patrolReadings.size} readings, ${allBatches.size} batches, ${requestGroups.size} request(s)")

            var totalUploaded = 0
            for ((groupIdx, group) in requestGroups.withIndex()) {
                runCatching {
                    val body = JSONObject().apply {
                        put("patrolId", patrolId)
                        put("batches", JSONArray().apply {
                            group.forEach { put(it) }
                        })
                    }
                    withNetworkRetry { api.postJson("/api/sync/upload", body) }
                    totalUploaded += group.sumOf { it.getJSONArray("records").length() }
                    Log.d(TAG, "Readings group ${groupIdx + 1}/${requestGroups.size} uploaded ($totalUploaded/${patrolReadings.size})")
                }.onFailure {
                    fail(patrolReadings.size, it)
                    return
                }
            }

            dao.markReadingsSynced(patrolId)
            ok(patrolReadings.size)
        }
    }

    private suspend fun syncIncidents(
        dao: TelemetryDao,
        api: BackendApiClient,
        ok: (Int) -> Unit,
        fail: (Int, Throwable?) -> Unit
    ) {
        val incidents = dao.pendingIncidents()
        if (incidents.isEmpty()) return
        Log.d(TAG, "Syncing ${incidents.size} incidents")

        // Chunk incidents into groups of 50 (incidents are larger)
        val chunks = incidents.chunked(50)
        for ((idx, chunk) in chunks.withIndex()) {
            val records = JSONArray()
            for (inc in chunk) {
                records.put(JSONObject().apply {
                    put("type", inc.type)
                    put("title", inc.title)
                    inc.description?.let { put("description", it) }
                    put("severity", inc.severity)
                    put("details", org.json.JSONObject(inc.detailsJson ?: "{}"))
                    inc.latitude?.let { put("latitude", it) }
                    inc.longitude?.let { put("longitude", it) }
                    inc.accuracy?.let { put("accuracy", it.toDouble()) }
                    put("photos", org.json.JSONArray(inc.photos ?: "[]"))
                    put("occurredAt", inc.occurredAt)
                    inc.patrolId?.let { put("patrolId", it) }
                })
            }
            runCatching {
                val body = JSONObject().apply {
                    put("batches", JSONArray().put(JSONObject().apply {
                        put("entity", "incidents")
                        put("records", records)
                    }))
                }
                withNetworkRetry { api.postJson("/api/sync/upload", body) }
                Log.d(TAG, "Incidents chunk ${idx + 1}/${chunks.size} uploaded (${chunk.size} records)")
            }.onFailure { fail(chunk.size, it); return }
        }
        dao.markIncidentsSynced()
        ok(incidents.size)
    }

    private fun mapReadingEntity(type: String): String? = when (type) {
        "ACCELEROMETER" -> "accelerometer"
        "GYROSCOPE" -> "gyroscope"
        "MAGNETOMETER" -> "magnetometer"
        "BAROMETER" -> "barometer"
        "STEP_COUNTER" -> "step-readings"
        else -> null
    }

    private fun mapPatrolType(type: String?): String = when (type) {
        "BICYCLE", "Cycle" -> "BICYCLE"
        "VEHICLE", "Motor Cycle", "Four Wheeler", "Boat", "Aerial" -> "VEHICLE"
        "STATIONARY" -> "STATIONARY"
        else -> "WALK"
    }

    private fun buildPatrolName(session: com.nstrpatrol.app.data.db.PatrolSessionEntity): String {
        val parts = listOfNotNull(session.patrolType, session.beat).filter { it.isNotBlank() }
        return if (parts.isEmpty()) "Patrol" else parts.joinToString(" – ")
    }
}
