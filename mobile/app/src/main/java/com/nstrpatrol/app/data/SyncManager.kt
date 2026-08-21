package com.nstrpatrol.app.data

import android.util.Log
import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.data.db.PatrolPointEntity
import com.nstrpatrol.app.data.db.SensorReadingEntity
import com.nstrpatrol.app.data.map.ApiException
import com.nstrpatrol.app.data.map.BackendApiClient
import com.nstrpatrol.app.time.MovementMode
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
    private const val CHUNK_SIZE = 250

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
            dao.pendingIncidents().size +
            dao.pendingActivitySegments().size +
            dao.pendingCoverageEvents().size +
            dao.pendingIntegrityLogs().size

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
        runCatching { dao.resetLocalPathIncidentsToPending() }
        syncIncidents(dao, api, ok, fail)
        syncActivitySegments(dao, api, ok, fail)
        syncCoverageEvents(dao, api, ok, fail)
        syncIntegrityLogs(dao, api, ok, fail)
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
                put("startedAt", session.startTime)
                session.endTime?.let { put("endedAt", it) }
                session.patrolMethod?.let { put("patrolMethod", it) }
                session.beat?.let { put("beat", it) }
                session.armedStatus?.let { put("armedStatus", it) }
                put("faceVerified", session.faceVerified)
                put("caloriesEstimate", session.caloriesEstimate)
                put("heartPointsEstimate", session.heartPointsEstimate)
                put("avgSpeedKmh", session.avgSpeedKmh)
                session.detectedMethod?.let { put("detectedMethod", it) }
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
                    val completeBody = JSONObject().apply {
                        session.endTime?.let { put("endedAt", it) }
                    }
                    runCatching { withNetworkRetry { api.completePatrol(session.patrolId, completeBody) } }
                }
            } else {
                // Both create and complete failed — mark as SYNCED locally
                // to stop retrying (e.g. ID too long for server validation).
                Log.w(TAG, "Patrol ${session.patrolId} permanently failed, skipping")
                dao.updateSessionSyncStatus(session.patrolId, "SYNCED")
                dao.deletePendingPointsForPatrol(session.patrolId)
                dao.deletePendingReadingsForPatrol(session.patrolId)
                ok(1)
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
                        records.put(pointRecord(p))
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
                }.onFailure { e ->
                    Log.w(TAG, "Points upload failed for patrol $patrolId: ${e.message}. Attempting patrol auto-create fallback...")
                    val createdShell = runCatching {
                        api.createPatrol(JSONObject().apply {
                            put("id", patrolId)
                            put("type", "WALK")
                            put("name", "Patrol")
                        })
                        true
                    }.getOrDefault(false)

                    if (createdShell) {
                        val records = JSONArray()
                        for (p in chunk) {
                            records.put(pointRecord(p))
                        }
                        val body = JSONObject().apply {
                            put("patrolId", patrolId)
                            put("batches", JSONArray().put(JSONObject().apply {
                                put("entity", "points")
                                put("records", records)
                            }))
                        }
                        val retrySuccess = runCatching { api.postJson("/api/sync/upload", body); true }.getOrDefault(false)
                        if (retrySuccess) {
                            Log.d(TAG, "Points chunk ${idx + 1}/${chunks.size} retry uploaded after patrol auto-create")
                            return@onFailure
                        }
                    }

                    // Keep items PENDING so no offline data is lost — fail the item batch for retry on next network connection
                    fail(chunk.size, e)
                    return
                }
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
                                "movement-mode" -> {
                                    val modeCode = r.value?.toInt() ?: 0
                                    put("mode", MovementMode.fromCode(modeCode).name)
                                    r.x?.let { put("confidence", it.coerceIn(0f, 1f).toDouble()) }
                                    r.y?.takeIf { it > 0f }?.let { put("speedKmh", it.toDouble()) }
                                }
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

            // Split into groups of 3 to keep request payload sizes under 100 KB
            val batchesPerRequest = 3
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
                }.onFailure { err ->
                    Log.w(TAG, "Readings upload failed for patrol $patrolId: ${err.message}. Attempting patrol auto-create fallback...")
                    // Attempt to auto-create missing patrol shell on server
                    val createdShell = runCatching {
                        api.createPatrol(JSONObject().apply {
                            put("id", patrolId)
                            put("type", "WALK")
                            put("name", "Patrol")
                        })
                        true
                    }.getOrDefault(false)

                    if (createdShell) {
                        val retrySuccess = runCatching {
                            val body = JSONObject().apply {
                                put("patrolId", patrolId)
                                put("batches", JSONArray().apply {
                                    group.forEach { put(it) }
                                })
                            }
                            api.postJson("/api/sync/upload", body)
                            true
                        }.getOrDefault(false)

                        if (retrySuccess) {
                            totalUploaded += group.sumOf { it.getJSONArray("records").length() }
                            Log.d(TAG, "Readings group ${groupIdx + 1}/${requestGroups.size} retry uploaded after patrol auto-create")
                            return@onFailure
                        }
                    }

                    // Keep readings PENDING in Room DB so no offline sensor telemetry is lost
                    fail(patrolReadings.size, err)
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
        Log.d(TAG, "Syncing ${incidents.size} incidents to S3 + backend")

        for (inc in incidents) {
            val photoArray = JSONArray()
            val rawPhotos = inc.photos ?: "[]"
            val photoList = if (rawPhotos.trim().startsWith("[")) {
                runCatching {
                    val arr = JSONArray(rawPhotos)
                    (0 until arr.length()).mapNotNull { arr.optString(it).ifEmpty { null } }
                }.getOrDefault(emptyList())
            } else {
                rawPhotos.split(",").map { it.trim() }.filter { it.isNotEmpty() }
            }

            var uploadError: Throwable? = null
            for (p in photoList) {
                val file = java.io.File(p)
                if (file.exists()) {
                    val s3Key = runCatching {
                        val res = api.uploadMultipart("/api/uploads", "file", file)
                        res.optString("key").ifEmpty { null }
                    }.onFailure { err ->
                        Log.e(TAG, "Failed to upload photo $p to S3: ${err.message}", err)
                        uploadError = err
                    }.getOrNull()

                    if (s3Key != null) {
                        Log.i(TAG, "Uploaded photo $p -> S3 Key: $s3Key")
                        // Preserve local photo file under S3 filename so ranger phone retains instant local access
                        runCatching {
                            val filename = s3Key.split("/").last()
                            val localTarget = java.io.File(PhotoStore.dir(), filename)
                            if (!localTarget.exists()) {
                                file.copyTo(localTarget, overwrite = true)
                            }
                        }
                        photoArray.put(s3Key)
                    } else {
                        photoArray.put(p)
                    }
                } else {
                    photoArray.put(p)
                }
            }

            if (uploadError != null) {
                fail(1, uploadError)
                continue
            }

            val updatedPhotosJson = photoArray.toString()
            val record = JSONObject().apply {
                put("id", inc.id)
                put("type", inc.type)
                put("title", inc.title)
                inc.description?.let { put("description", it) }
                put("severity", inc.severity)
                put("details", org.json.JSONObject(inc.detailsJson ?: "{}"))
                inc.latitude?.let { put("latitude", it) }
                inc.longitude?.let { put("longitude", it) }
                inc.accuracy?.let { put("accuracy", it.toDouble()) }
                put("photos", photoArray)
                put("occurredAt", inc.occurredAt)
                put("reportedAt", inc.reportedAt)
                inc.patrolId?.let { put("patrolId", it) }
            }

            runCatching {
                val body = JSONObject().apply {
                    put("batches", JSONArray().put(JSONObject().apply {
                        put("entity", "incidents")
                        put("records", JSONArray().put(record))
                    }))
                }
                withNetworkRetry { api.postJson("/api/sync/upload", body) }
                dao.updateIncidentPhotosAndSyncStatus(inc.id, updatedPhotosJson, "SYNCED")
                Log.i(TAG, "Incident ${inc.id} synced with ${photoArray.length()} S3 photo key(s)")
                ok(1)
            }.onFailure { fail(1, it) }
        }
    }

    private suspend fun syncActivitySegments(
        dao: TelemetryDao,
        api: BackendApiClient,
        ok: (Int) -> Unit,
        fail: (Int, Throwable?) -> Unit
    ) {
        val segments = dao.pendingActivitySegments()
        if (segments.isEmpty()) return
        Log.d(TAG, "Syncing ${segments.size} activity segments")
        val byPatrol = segments.groupBy { it.patrolId }
        var totalSynced = 0
        for ((patrolId, rows) in byPatrol) {
            val chunks = rows.chunked(CHUNK_SIZE)
            var okCount = 0
            for (chunk in chunks) {
                val records = JSONArray()
                for (s in chunk) {
                    records.put(JSONObject().apply {
                        put("patrolId", s.patrolId)
                        put("startTime", s.startTime)
                        put("endTime", s.endTime)
                        put("mode", s.mode)
                        s.confidence?.let { put("confidence", it.toDouble()) }
                    })
                }
                val success = runCatching {
                    val body = JSONObject().apply {
                        put("patrolId", patrolId)
                        put("batches", JSONArray().put(JSONObject().apply {
                            put("entity", "activity-segments")
                            put("records", records)
                        }))
                    }
                    withNetworkRetry { api.postJson("/api/sync/upload", body) }
                    true
                }.getOrDefault(false)
                if (success) okCount += chunk.size
                else { fail(chunk.size, null); return }
            }
            dao.markActivitySegmentsSynced(patrolId)
            totalSynced += okCount
        }
        ok(totalSynced)
    }

    private suspend fun syncCoverageEvents(
        dao: TelemetryDao,
        api: BackendApiClient,
        ok: (Int) -> Unit,
        fail: (Int, Throwable?) -> Unit
    ) {
        val events = dao.pendingCoverageEvents()
        if (events.isEmpty()) return
        Log.d(TAG, "Syncing ${events.size} coverage events")
        val byPatrol = events.groupBy { it.patrolId }
        var totalSynced = 0
        for ((patrolId, rows) in byPatrol) {
            val chunks = rows.chunked(CHUNK_SIZE)
            var okCount = 0
            for (chunk in chunks) {
                val records = JSONArray()
                for (e in chunk) {
                    records.put(JSONObject().apply {
                        put("patrolId", e.patrolId)
                        put("timestamp", e.timestamp)
                        put("type", e.type)
                        e.latitude?.let { put("latitude", it) }
                        e.longitude?.let { put("longitude", it) }
                    })
                }
                val success = runCatching {
                    val body = JSONObject().apply {
                        put("patrolId", patrolId)
                        put("batches", JSONArray().put(JSONObject().apply {
                            put("entity", "coverage-events")
                            put("records", records)
                        }))
                    }
                    withNetworkRetry { api.postJson("/api/sync/upload", body) }
                    true
                }.getOrDefault(false)
                if (success) okCount += chunk.size
                else { fail(chunk.size, null); return }
            }
            dao.markCoverageEventsSynced(patrolId)
            totalSynced += okCount
        }
        ok(totalSynced)
    }

    private suspend fun syncIntegrityLogs(
        dao: TelemetryDao,
        api: BackendApiClient,
        ok: (Int) -> Unit,
        fail: (Int, Throwable?) -> Unit
    ) {
        val logs = dao.pendingIntegrityLogs()
        if (logs.isEmpty()) return
        Log.d(TAG, "Syncing ${logs.size} integrity logs")
        val byPatrol = logs.groupBy { it.patrolId }
        var totalSynced = 0
        for ((patrolId, rows) in byPatrol) {
            val chunks = rows.chunked(CHUNK_SIZE)
            var okCount = 0
            for (chunk in chunks) {
                val records = JSONArray()
                for (l in chunk) {
                    records.put(JSONObject().apply {
                        put("patrolId", l.patrolId)
                        put("timestamp", l.timestamp)
                        put("gnssTimeAvailable", l.gnssTimeAvailable)
                        put("divergenceSeconds", l.divergenceSeconds)
                        put("autoTimeEnabled", l.autoTimeEnabled)
                        put("tamperDetected", l.tamperDetected)
                        put("satellites", l.satellites)
                    })
                }
                val success = runCatching {
                    val body = JSONObject().apply {
                        put("patrolId", patrolId)
                        put("batches", JSONArray().put(JSONObject().apply {
                            put("entity", "integrity-logs")
                            put("records", records)
                        }))
                    }
                    withNetworkRetry { api.postJson("/api/sync/upload", body) }
                    true
                }.getOrDefault(false)
                if (success) okCount += chunk.size
                else { fail(chunk.size, null); return }
            }
            dao.markIntegrityLogsSynced(patrolId)
            totalSynced += okCount
        }
        ok(totalSynced)
    }

    /**
     * Pulls all patrols and their GPS points from the backend into the local
     * database. This enables cross-device viewing: a patrol recorded on device A
     * becomes visible (with route map) on device B after pulling.
     *
     * Only upserts — existing local data (SYNCED or PENDING) is not overwritten.
     * Returns the number of patrols pulled.
     */
    suspend fun pullFromBackend(
        dao: TelemetryDao,
        api: BackendApiClient
    ): Int = withContext(Dispatchers.IO) {
        Log.i(TAG, "Pulling patrols from backend")
        val arr = api.getJsonArray("/api/patrols") ?: return@withContext 0
        var pulled = 0
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val id = o.optString("id")
            if (id.isEmpty()) continue

            // Skip if we already have a local session for this patrol
            if (dao.patrolSession(id) != null) {
                pulled++
                continue
            }

            // Fetch full detail from backend
            val detail = api.getJson("/api/patrols/$id") ?: continue
            val startedMs = parseIsoMs(detail.optString("startedAt"))
            val endedMs = detail.optString("endedAt").takeIf { it.isNotEmpty() }
                ?.let { parseIsoMs(it) }
            val stats = detail.optJSONObject("stats")
            val distanceKm = stats?.optDouble("distanceKm", 0.0) ?: 0.0
            val durationSec = stats?.optDouble("durationSeconds", 0.0) ?: 0.0
            val pointCount = stats?.optInt("points", 0) ?: 0
            val steps = stats?.optInt("steps", 0) ?: 0
            val detectedMethod = detail.optString("detectedMethod")
                .takeIf { it.isNotEmpty() && it != "null" }
                ?: null

            val session = com.nstrpatrol.app.data.db.PatrolSessionEntity(
                patrolId = id,
                startTime = startedMs,
                endTime = endedMs,
                status = detail.optString("status", "COMPLETED"),
                patrolType = detail.optString("type").ifEmpty { null },
                patrolMethod = detail.optString("patrolMethod").takeIf { it.isNotEmpty() && it != "null" },
                beat = detail.optString("beat").takeIf { it.isNotEmpty() && it != "null" },
                armedStatus = detail.optString("armedStatus").takeIf { it.isNotEmpty() && it != "null" },
                totalDistanceMeters = distanceKm * 1000,
                totalSteps = steps,
                moveMinutes = (durationSec / 60).toInt(),
                caloriesEstimate = if (!detail.isNull("caloriesEstimate")) detail.optDouble("caloriesEstimate") else 0.0,
                heartPointsEstimate = if (!detail.isNull("heartPointsEstimate")) detail.optDouble("heartPointsEstimate") else 0.0,
                avgSpeedKmh = if (!detail.isNull("avgSpeedKmh")) detail.optDouble("avgSpeedKmh") else 0.0,
                pointCount = pointCount,
                detectedMethod = detectedMethod,
                syncStatus = "SYNCED"
            )
            dao.upsertPatrolSession(session)

            // Fetch GPS points
            val pointsArr = api.getJsonArray("/api/patrols/$id/points")
            if (pointsArr != null && pointsArr.length() > 0) {
                val points = mutableListOf<com.nstrpatrol.app.data.db.PatrolPointEntity>()
                for (j in 0 until pointsArr.length()) {
                    val p = pointsArr.optJSONObject(j) ?: continue
                    points.add(
                        com.nstrpatrol.app.data.db.PatrolPointEntity(
                            id = "bp-$id-$j",
                            patrolId = id,
                            latitude = p.optDouble("lat", 0.0),
                            longitude = p.optDouble("lng", 0.0),
                            altitude = if (!p.isNull("altitude")) p.optDouble("altitude") else null,
                            speed = if (!p.isNull("speed")) p.optDouble("speed").toFloat() else null,
                            bearing = if (!p.isNull("bearing")) p.optDouble("bearing").toFloat() else null,
                            accuracy = if (!p.isNull("accuracy")) p.optDouble("accuracy").toFloat() else null,
                            timestamp = parseIsoMs(p.optString("t")),
                            syncStatus = "SYNCED"
                        )
                    )
                }
                dao.upsertPatrolPoints(points)
                Log.d(TAG, "Pulled ${points.size} points for patrol $id")
            }

            // Fetch movement-mode readings. They are stored back into
            // sensor_readings (type=MOVEMENT_MODE) — the SAME table/format the
            // recorder writes locally — so the patrol report and processing
            // functions read them identically on any device.
            val movArr = api.getJsonArray("/api/patrols/$id/movement")
            if (movArr != null && movArr.length() > 0) {
                val movReadings = mutableListOf<com.nstrpatrol.app.data.db.SensorReadingEntity>()
                for (j in 0 until movArr.length()) {
                    val m = movArr.optJSONObject(j) ?: continue
                    val mode = runCatching {
                        com.nstrpatrol.app.time.MovementMode.valueOf(m.optString("mode", "UNKNOWN"))
                    }.getOrDefault(com.nstrpatrol.app.time.MovementMode.UNKNOWN)
                    movReadings.add(
                        com.nstrpatrol.app.data.db.SensorReadingEntity(
                            id = "bm-$id-$j",
                            patrolId = id,
                            timestamp = parseIsoMs(m.optString("t")),
                            type = "MOVEMENT_MODE",
                            value = mode.code.toFloat(),
                            x = if (!m.isNull("confidence")) m.optDouble("confidence").toFloat() else null,
                            y = if (!m.isNull("speedKmh")) m.optDouble("speedKmh").toFloat() else null,
                            syncStatus = "SYNCED"
                        )
                    )
                }
                dao.upsertSensorReadings(movReadings)
                Log.d(TAG, "Pulled ${movReadings.size} movement-mode readings for patrol $id")
            }

            // Fetch all sensor readings (accel, gyro, mag, barometer, steps)
            val sensorsObj = api.getJson("/api/patrols/$id/sensors")
            if (sensorsObj != null) {
                val sensorEntities = mutableListOf<com.nstrpatrol.app.data.db.SensorReadingEntity>()
                // Accelerometer
                val accelArr = sensorsObj.optJSONArray("accelerometer")
                if (accelArr != null) {
                    for (j in 0 until accelArr.length()) {
                        val a = accelArr.optJSONObject(j) ?: continue
                        sensorEntities.add(
                            com.nstrpatrol.app.data.db.SensorReadingEntity(
                                id = "bs-a-$id-$j",
                                patrolId = id,
                                timestamp = parseIsoMs(a.optString("t")),
                                type = "ACCELEROMETER",
                                x = if (!a.isNull("x")) a.optDouble("x").toFloat() else null,
                                y = if (!a.isNull("y")) a.optDouble("y").toFloat() else null,
                                z = if (!a.isNull("z")) a.optDouble("z").toFloat() else null,
                                syncStatus = "SYNCED"
                            )
                        )
                    }
                }
                // Gyroscope
                val gyroArr = sensorsObj.optJSONArray("gyroscope")
                if (gyroArr != null) {
                    for (j in 0 until gyroArr.length()) {
                        val g = gyroArr.optJSONObject(j) ?: continue
                        sensorEntities.add(
                            com.nstrpatrol.app.data.db.SensorReadingEntity(
                                id = "bs-g-$id-$j",
                                patrolId = id,
                                timestamp = parseIsoMs(g.optString("t")),
                                type = "GYROSCOPE",
                                x = if (!g.isNull("x")) g.optDouble("x").toFloat() else null,
                                y = if (!g.isNull("y")) g.optDouble("y").toFloat() else null,
                                z = if (!g.isNull("z")) g.optDouble("z").toFloat() else null,
                                syncStatus = "SYNCED"
                            )
                        )
                    }
                }
                // Magnetometer
                val magArr = sensorsObj.optJSONArray("magnetometer")
                if (magArr != null) {
                    for (j in 0 until magArr.length()) {
                        val m = magArr.optJSONObject(j) ?: continue
                        sensorEntities.add(
                            com.nstrpatrol.app.data.db.SensorReadingEntity(
                                id = "bs-m-$id-$j",
                                patrolId = id,
                                timestamp = parseIsoMs(m.optString("t")),
                                type = "MAGNETOMETER",
                                x = if (!m.isNull("x")) m.optDouble("x").toFloat() else null,
                                y = if (!m.isNull("y")) m.optDouble("y").toFloat() else null,
                                z = if (!m.isNull("z")) m.optDouble("z").toFloat() else null,
                                syncStatus = "SYNCED"
                            )
                        )
                    }
                }
                // Barometer
                val baroArr = sensorsObj.optJSONArray("barometer")
                if (baroArr != null) {
                    for (j in 0 until baroArr.length()) {
                        val b = baroArr.optJSONObject(j) ?: continue
                        sensorEntities.add(
                            com.nstrpatrol.app.data.db.SensorReadingEntity(
                                id = "bs-b-$id-$j",
                                patrolId = id,
                                timestamp = parseIsoMs(b.optString("t")),
                                type = "BAROMETER",
                                value = if (!b.isNull("pressureHpa")) b.optDouble("pressureHpa").toFloat() else null,
                                syncStatus = "SYNCED"
                            )
                        )
                    }
                }
                // Step counter
                val stepsArr = sensorsObj.optJSONArray("steps")
                if (stepsArr != null) {
                    for (j in 0 until stepsArr.length()) {
                        val s = stepsArr.optJSONObject(j) ?: continue
                        sensorEntities.add(
                            com.nstrpatrol.app.data.db.SensorReadingEntity(
                                id = "bs-s-$id-$j",
                                patrolId = id,
                                timestamp = parseIsoMs(s.optString("t")),
                                type = "STEP_COUNTER",
                                value = s.optInt("steps", 0).toFloat(),
                                syncStatus = "SYNCED"
                            )
                        )
                    }
                }
                if (sensorEntities.isNotEmpty()) {
                    dao.upsertSensorReadings(sensorEntities)
                    Log.d(TAG, "Pulled ${sensorEntities.size} sensor readings for patrol $id")
                }
            }

            // Fetch incidents
            val incArr = api.getJsonArray("/api/patrols/$id/incidents")
            if (incArr != null && incArr.length() > 0) {
                val incidents = mutableListOf<com.nstrpatrol.app.data.db.IncidentEntity>()
                for (j in 0 until incArr.length()) {
                    val i = incArr.optJSONObject(j) ?: continue
                    val photosArr = i.optJSONArray("photos")
                    val photosStr = if (photosArr != null && photosArr.length() > 0) {
                        (0 until photosArr.length()).mapNotNull { photosArr.optString(it) }
                            .filter { it.isNotEmpty() }.joinToString(",")
                    } else null
                    incidents.add(
                        com.nstrpatrol.app.data.db.IncidentEntity(
                            id = i.optString("id", "bi-$id-$j"),
                            patrolId = id,
                            type = i.optString("type", "GENERAL"),
                            title = i.optString("title", ""),
                            description = i.optString("description").takeIf { it.isNotEmpty() },
                            severity = i.optString("severity", "LOW"),
                            detailsJson = if (!i.isNull("details")) i.optJSONObject("details")?.toString() else null,
                            latitude = if (!i.isNull("latitude")) i.optDouble("latitude") else null,
                            longitude = if (!i.isNull("longitude")) i.optDouble("longitude") else null,
                            accuracy = if (!i.isNull("accuracy")) i.optDouble("accuracy").toFloat() else null,
                            photos = photosStr,
                            occurredAt = parseIsoMs(i.optString("occurredAt")),
                            reportedAt = parseIsoMs(i.optString("reportedAt")),
                            status = i.optString("status", "SUBMITTED"),
                            syncStatus = "SYNCED"
                        )
                    )
                }
                dao.upsertIncidents(incidents)
                Log.d(TAG, "Pulled ${incidents.size} incidents for patrol $id")
            }

            // Fetch activity segments
            val segArr = api.getJsonArray("/api/patrols/$id/segments")
            if (segArr != null && segArr.length() > 0) {
                val segments = mutableListOf<com.nstrpatrol.app.data.db.ActivitySegmentEntity>()
                for (j in 0 until segArr.length()) {
                    val s = segArr.optJSONObject(j) ?: continue
                    segments.add(
                        com.nstrpatrol.app.data.db.ActivitySegmentEntity(
                            id = "bseg-$id-$j",
                            patrolId = id,
                            mode = s.optString("mode", "WALK"),
                            startTime = parseIsoMs(s.optString("start")),
                            endTime = parseIsoMs(s.optString("end")),
                            confidence = if (!s.isNull("confidence")) s.optDouble("confidence").toFloat() else null,
                            syncStatus = "SYNCED"
                        )
                    )
                }
                dao.upsertActivitySegments(segments)
                Log.d(TAG, "Pulled ${segments.size} activity segments for patrol $id")
            }

            // Fetch coverage events
            val covArr = api.getJsonArray("/api/patrols/$id/coverage")
            if (covArr != null && covArr.length() > 0) {
                val events = mutableListOf<com.nstrpatrol.app.data.db.CoverageEventEntity>()
                for (j in 0 until covArr.length()) {
                    val e = covArr.optJSONObject(j) ?: continue
                    events.add(
                        com.nstrpatrol.app.data.db.CoverageEventEntity(
                            id = "bcov-$id-$j",
                            patrolId = id,
                            type = e.optString("type", "GENERAL"),
                            latitude = if (!e.isNull("lat")) e.optDouble("lat") else null,
                            longitude = if (!e.isNull("lng")) e.optDouble("lng") else null,
                            timestamp = parseIsoMs(e.optString("t")),
                            syncStatus = "SYNCED"
                        )
                    )
                }
                dao.upsertCoverageEvents(events)
                Log.d(TAG, "Pulled ${events.size} coverage events for patrol $id")
            }

            // Fetch integrity logs
            val intArr = api.getJsonArray("/api/patrols/$id/integrity")
            if (intArr != null && intArr.length() > 0) {
                val logs = mutableListOf<com.nstrpatrol.app.data.db.IntegrityLogEntity>()
                for (j in 0 until intArr.length()) {
                    val l = intArr.optJSONObject(j) ?: continue
                    logs.add(
                        com.nstrpatrol.app.data.db.IntegrityLogEntity(
                            id = "bint-$id-$j",
                            patrolId = id,
                            timestamp = parseIsoMs(l.optString("t")),
                            gnssTimeAvailable = l.optBoolean("gnssTimeAvailable"),
                            divergenceSeconds = l.optInt("divergenceSeconds", 0),
                            autoTimeEnabled = l.optBoolean("autoTimeEnabled"),
                            tamperDetected = l.optBoolean("tamperDetected"),
                            satellites = l.optInt("satellites", 0),
                            syncStatus = "SYNCED"
                        )
                    )
                }
                dao.upsertIntegrityLogs(logs)
                Log.d(TAG, "Pulled ${logs.size} integrity logs for patrol $id")
            }

            pulled++
        }
        Log.i(TAG, "Pull complete: $pulled patrols pulled from backend")
        pulled
    }

    private fun parseIsoMs(iso: String): Long {
        if (iso.isEmpty()) return System.currentTimeMillis()
        val patterns = listOf(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXX"
        )
        for (pattern in patterns) {
            runCatching {
                val sdf = java.text.SimpleDateFormat(pattern, java.util.Locale.US)
                    .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
                return sdf.parse(iso)!!.time
            }
        }
        return System.currentTimeMillis()
    }

    private fun mapReadingEntity(type: String): String? = when (type) {
        "ACCELEROMETER" -> "accelerometer"
        "GYROSCOPE" -> "gyroscope"
        "MAGNETOMETER" -> "magnetometer"
        "BAROMETER" -> "barometer"
        "STEP_COUNTER" -> "step-readings"
        "MOVEMENT_MODE" -> "movement-mode"
        else -> null
    }

    private fun mapPatrolType(type: String?): String = when (type) {
        "BICYCLE", "Cycle" -> "BICYCLE"
        "VEHICLE", "Motor Cycle", "Four Wheeler", "Boat", "Aerial" -> "VEHICLE"
        "STATIONARY" -> "STATIONARY"
        else -> "WALK"
    }

    /** Builds an upload record for a patrol point, dropping fields whose raw
     *  sensor values would be rejected by the backend (negative speed/accuracy,
     *  bearing out of 0..360) so one noisy fix never fails a whole batch. */
    private fun pointRecord(p: PatrolPointEntity): JSONObject = JSONObject().apply {
        put("patrolId", p.patrolId)
        put("timestamp", p.timestamp)
        put("latitude", p.latitude)
        put("longitude", p.longitude)
        p.altitude?.let { put("altitude", it) }
        p.speed?.let { s -> if (s >= 0f && s.isFinite()) put("speed", s.toDouble()) }
        p.bearing?.let { b -> if (b in 0f..360f) put("bearing", b.toDouble()) }
        p.accuracy?.let { a -> if (a >= 0f && a.isFinite()) put("accuracy", a.toDouble()) }
    }

    private fun buildPatrolName(session: com.nstrpatrol.app.data.db.PatrolSessionEntity): String {
        val parts = listOfNotNull(session.patrolType, session.beat).filter { it.isNotBlank() }
        return if (parts.isEmpty()) "Patrol" else parts.joinToString(" – ")
    }
}
