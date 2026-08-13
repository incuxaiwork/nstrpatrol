package com.nstrpatrol.app.data

import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.data.map.BackendApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/**
 * Pushes locally recorded patrol data to the backend.
 *
 * Offline-first: every row is written to Room first with syncStatus PENDING,
 * then uploaded here. Failures are swallowed so rows stay PENDING and are
 * retried on the next sync (periodic, on patrol stop, and on app start).
 */
object SyncManager {

    suspend fun syncNow(dao: TelemetryDao, api: BackendApiClient) = withContext(Dispatchers.IO) {
        syncPatrols(dao, api)
        syncPoints(dao, api)
        syncReadings(dao, api)
        syncIncidents(dao, api)
    }

    private suspend fun syncPatrols(dao: TelemetryDao, api: BackendApiClient) {
        for (session in dao.sessionsToSync()) {
            val created = runCatching {
                val body = JSONObject().apply {
                    put("id", session.patrolId)
                    put("type", mapPatrolType(session.patrolType))
                    put("name", buildPatrolName(session))
                }
                api.createPatrol(body)
                true
            }.getOrElse { false }
            if (created) {
                dao.updateSessionSyncStatus(session.patrolId, "SYNCED")
                // A patrol stopped while offline is created above, then completed here.
                // Idempotent: the backend just (re)sets COMPLETED + endedAt.
                if (session.status == "COMPLETED") {
                    runCatching { api.completePatrol(session.patrolId) }
                }
            }
        }
    }

    private suspend fun syncPoints(dao: TelemetryDao, api: BackendApiClient) {
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
                api.postJson("/api/sync/upload", body)
            }.onSuccess { dao.markPointsSynced(patrolId) }
        }
    }

    private suspend fun syncReadings(dao: TelemetryDao, api: BackendApiClient) {
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
                    api.postJson("/api/sync/upload", body)
                }.onSuccess { dao.markReadingsSynced(patrolId) }
            }
        }
    }

    private suspend fun syncIncidents(dao: TelemetryDao, api: BackendApiClient) {
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
        runCatching { api.postJson("/api/sync/upload", body) }
            .onSuccess { dao.markIncidentsSynced() }
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
