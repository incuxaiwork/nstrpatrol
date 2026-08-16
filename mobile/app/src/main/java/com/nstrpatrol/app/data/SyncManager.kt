package com.nstrpatrol.app.data

import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.data.map.ApiException
import com.nstrpatrol.app.data.map.BackendApiClient
import kotlinx.coroutines.Dispatchers
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
            failedItems++
            advance(count)
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
        for (session in dao.sessionsToSync()) {
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
        for ((patrolId, rows) in points.groupBy { it.patrolId }) {
            runCatching {
                val records = JSONArray()
                for (p in rows) {
                    records.put(JSONObject().apply {
                        put("patrolId", p.patrolId)
                        put("timestamp", p.timestamp)
                        put("latitude", p.latitude)
                        put("longitude", p.longitude)
                        p.altitude?.let { put("altitude", it) }
                        p.speed?.let { put("speed", it) }
                        p.bearing?.let { put("bearing", it) }
                        p.accuracy?.let { put("accuracy", it) }
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
                dao.markPointsSynced(patrolId)
                ok(rows.size)
            }.onFailure { fail(rows.size, it) }
        }
    }

    private suspend fun syncReadings(
        dao: TelemetryDao,
        api: BackendApiClient,
        ok: (Int) -> Unit,
        fail: (Int, Throwable?) -> Unit
    ) {
        val readings = dao.pendingReadingRows()
        if (readings.isEmpty()) return
        for ((patrolId, rows) in readings.groupBy { it.patrolId }) {
            val byEntity = rows.groupBy { mapReadingEntity(it.type) }.filterKeys { it != null }
            for ((entity, recs) in byEntity) {
                runCatching {
                    val records = JSONArray()
                    for (r in recs) {
                        records.put(JSONObject().apply {
                            put("patrolId", r.patrolId)
                            put("timestamp", r.timestamp)
                            when (entity) {
                                "step-readings" -> put("steps", r.value?.toInt() ?: 0)
                                "barometer" -> put("pressureHpa", r.value ?: 0.0)
                                else -> {
                                    r.x?.let { put("x", it) }
                                    r.y?.let { put("y", it) }
                                    r.z?.let { put("z", it) }
                                }
                            }
                        })
                    }
                    val body = JSONObject().apply {
                        put("patrolId", patrolId)
                        put("batches", JSONArray().put(JSONObject().apply {
                            put("entity", entity)
                            put("records", records)
                        }))
                    }
                    withNetworkRetry { api.postJson("/api/sync/upload", body) }
                    dao.markReadingsSynced(patrolId)
                    ok(recs.size)
                }.onFailure { fail(recs.size, it) }
            }
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
        val records = JSONArray()
        for (inc in incidents) {
            records.put(JSONObject().apply {
                put("type", inc.type)
                put("title", inc.title)
                inc.description?.let { put("description", it) }
                put("severity", inc.severity)
                put("details", org.json.JSONObject(inc.detailsJson ?: "{}"))
                inc.latitude?.let { put("latitude", it) }
                inc.longitude?.let { put("longitude", it) }
                inc.accuracy?.let { put("accuracy", it) }
                put("photos", org.json.JSONArray(inc.photos ?: "[]"))
                put("occurredAt", inc.occurredAt)
                inc.patrolId?.let { put("patrolId", it) }
            })
        }
        val body = JSONObject().apply {
            put("batches", JSONArray().put(JSONObject().apply {
                put("entity", "incidents")
                put("records", records)
            }))
        }
        runCatching {
            withNetworkRetry { api.postJson("/api/sync/upload", body) }
            dao.markIncidentsSynced()
            ok(incidents.size)
        }.onFailure { fail(incidents.size, it) }
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
