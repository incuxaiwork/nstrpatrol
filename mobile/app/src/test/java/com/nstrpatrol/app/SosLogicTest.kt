package com.nstrpatrol.app

import com.nstrpatrol.app.data.SosLogic
import com.nstrpatrol.app.data.SosOutcome
import com.nstrpatrol.app.data.buildSosEntity
import com.nstrpatrol.app.data.db.ActivitySegmentEntity
import com.nstrpatrol.app.data.db.CoverageEventEntity
import com.nstrpatrol.app.data.db.DailyActivityEntity
import com.nstrpatrol.app.data.db.IncidentEntity
import com.nstrpatrol.app.data.db.IntegrityLogEntity
import com.nstrpatrol.app.data.db.MovementModeCount
import com.nstrpatrol.app.data.db.MovementSample
import com.nstrpatrol.app.data.db.PatrolPointEntity
import com.nstrpatrol.app.data.db.PatrolSessionEntity
import com.nstrpatrol.app.data.db.SensorReadingEntity
import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.data.deliverSos
import com.nstrpatrol.app.data.map.ApiException
import com.nstrpatrol.app.data.parseEmergencyContacts
import com.nstrpatrol.app.data.sosRequestBody
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-JVM tests for the SOS delivery logic: outcome classification, the
 * Room-first contract, client-ID reuse, GPS nullability and contact parsing.
 * Uses an in-memory fake of [TelemetryDao]; no Android framework involved.
 */
class SosLogicTest {

    // ------------------------------------------------------------------
    // Outcome classification (HTTP matrix)
    // ------------------------------------------------------------------

    @Test
    fun `201 created maps to Delivered`() {
        assertEquals(SosOutcome.Delivered, classify(201))
    }

    @Test
    fun `200 idempotent replay maps to Delivered`() {
        assertEquals(SosOutcome.Delivered, classify(200))
    }

    @Test
    fun `transport failure maps to QueuedOffline`() {
        assertEquals(SosOutcome.QueuedOffline, classify(0, errorCode = "network"))
    }

    @Test
    fun `401 maps to AuthPending`() {
        assertEquals(SosOutcome.AuthPending, classify(401))
    }

    @Test
    fun `409 with SOS_COOLDOWN maps to Cooldown with server seconds`() {
        val outcome = classify(409, errorCode = "SOS_COOLDOWN", retryAfter = 42)
        assertEquals(SosOutcome.Cooldown(42), outcome)
    }

    @Test
    fun `409 without retry hint still maps to Cooldown`() {
        val outcome = classify(409, errorCode = "SOS_COOLDOWN", retryAfter = null)
        assertTrue(outcome is SosOutcome.Cooldown)
        assertNull((outcome as SosOutcome.Cooldown).retryAfterSeconds)
    }

    @Test
    fun `400 invalid patrol maps to Rejected`() {
        val outcome = classify(400, errorCode = "patrol_not_found", message = "Patrol does not exist")
        assertEquals(SosOutcome.Rejected("Patrol does not exist"), outcome)
    }

    @Test
    fun `403 foreign patrol maps to Rejected`() {
        val outcome = classify(403, errorCode = "forbidden")
        assertTrue(outcome is SosOutcome.Rejected)
    }

    @Test
    fun `5xx transient failure maps to QueuedOffline`() {
        assertEquals(SosOutcome.QueuedOffline, classify(503))
    }

    @Test
    fun `countdown window is five seconds`() {
        assertEquals(5, SosLogic.COUNTDOWN_SECONDS)
    }

    // ------------------------------------------------------------------
    // Room-first persistence + client ID reuse
    // ------------------------------------------------------------------

    @Test
    fun `room write happens before the network attempt`() = runBlocking {
        val dao = FakeDao()
        val entity = buildSosEntity(patrolId = null, location = null)
        deliverSos(dao, entity) { body ->
            assertEquals(listOf("insert:${entity.id}"), dao.opLog)
            JSONObject()
        }
        assertEquals(listOf("insert:${entity.id}", "post", "markSynced:${entity.id}"), dao.opLog)
    }

    @Test
    fun `generated id exists before POST and stays within server limit`() = runBlocking {
        val dao = FakeDao()
        val entity = buildSosEntity(patrolId = "p1", location = 17.5 to 82.2)
        var postedId: String? = null
        deliverSos(dao, entity) { body ->
            postedId = body.getString("id")
            JSONObject()
        }
        assertEquals(entity.id, postedId)
        assertTrue(postedId!!.isNotBlank() && postedId!!.length <= 50)
    }

    @Test
    fun `same id is reused across retries and sync upload`() = runBlocking {
        val dao = FakeDao()
        val entity = buildSosEntity(patrolId = null, location = null)
        val postedIds = mutableListOf<String>()
        // First attempt fails offline; a later attempt (sync path) reuses the row.
        deliverSos(dao, entity) { body ->
            postedIds.add(body.getString("id"))
            throw ApiException(0, "network", "Cannot reach the server")
        }
        deliverSos(dao, entity) { body ->
            postedIds.add(body.getString("id"))
            JSONObject()
        }
        assertEquals(listOf(entity.id, entity.id), postedIds)
        assertEquals(entity.id, sosRequestBody(entity).getString("id"))
    }

    // ------------------------------------------------------------------
    // HTTP outcomes against the local record
    // ------------------------------------------------------------------

    @Test
    fun `offline attempt keeps record PENDING for SyncManager`() = runBlocking {
        val dao = FakeDao()
        val entity = buildSosEntity(patrolId = null, location = null)
        val outcome = deliverSos(dao, entity) { throw ApiException(0, "network", "down") }
        assertEquals(SosOutcome.QueuedOffline, outcome)
        val pending = dao.pendingIncidents()
        assertEquals(1, pending.size)
        assertEquals(entity.id, pending.first().id)
        assertEquals("PENDING", pending.first().syncStatus)
    }

    @Test
    fun `server 500 keeps record PENDING for retry`() = runBlocking {
        val dao = FakeDao()
        val entity = buildSosEntity(patrolId = null, location = null)
        val outcome = deliverSos(dao, entity) { throw ApiException(500, null, "boom") }
        assertEquals(SosOutcome.QueuedOffline, outcome)
        assertEquals("PENDING", dao.incidentById(entity.id)!!.syncStatus)
    }

    @Test
    fun `401 auth failure keeps record PENDING unchanged`() = runBlocking {
        val dao = FakeDao()
        val entity = buildSosEntity(patrolId = "p1", location = 17.5 to 82.2)
        val outcome = deliverSos(dao, entity) { throw ApiException(401, null, "Unauthorized") }
        assertEquals(SosOutcome.AuthPending, outcome)
        val stored = dao.incidentById(entity.id)!!
        assertEquals("PENDING", stored.syncStatus)
        assertEquals("p1", stored.patrolId)
        assertEquals(17.5, stored.latitude!!, 0.0)
        assertTrue(dao.opLog.none { it.startsWith("markSynced") || it.startsWith("delete") })
    }

    @Test
    fun `409 cooldown discards the local draft so sync cannot raise it later`() = runBlocking {
        val dao = FakeDao()
        val entity = buildSosEntity(patrolId = null, location = null)
        val outcome = deliverSos(dao, entity) {
            throw ApiException(409, "SOS_COOLDOWN", "wait", 37)
        }
        assertEquals(SosOutcome.Cooldown(37), outcome)
        assertNull(dao.incidentById(entity.id))
        assertTrue(dao.pendingIncidents().isEmpty())
    }

    @Test
    fun `400 rejection keeps the record but stops endless retries`() = runBlocking {
        val dao = FakeDao()
        val entity = buildSosEntity(patrolId = "ghost", location = null)
        val outcome = deliverSos(dao, entity) {
            throw ApiException(400, "patrol_not_found", "Patrol does not exist")
        }
        assertTrue(outcome is SosOutcome.Rejected)
        val stored = dao.incidentById(entity.id)!!
        assertEquals("ghost", stored.patrolId)
        assertEquals("SYNCED", stored.syncStatus)
    }

    @Test
    fun `403 rejection keeps the record but stops endless retries`() = runBlocking {
        val dao = FakeDao()
        val entity = buildSosEntity(patrolId = "foreign", location = null)
        val outcome = deliverSos(dao, entity) { throw ApiException(403, "forbidden", "not yours") }
        assertTrue(outcome is SosOutcome.Rejected)
        assertEquals("SYNCED", dao.incidentById(entity.id)!!.syncStatus)
    }

    @Test
    fun `pending SOS surfaces through the existing pending incidents query`() = runBlocking {
        val dao = FakeDao()
        val entity = buildSosEntity(patrolId = null, location = null)
        deliverSos(dao, entity) { throw ApiException(0, "network", "down") }
        val pendingIds = dao.pendingIncidents().map { it.id }
        assertTrue(entity.id in pendingIds)
    }

    // ------------------------------------------------------------------
    // GPS handling
    // ------------------------------------------------------------------

    @Test
    fun `gps available flows into entity and request body`() {
        val entity = buildSosEntity(
            patrolId = "p1",
            location = 15.8352 to 78.8686,
            accuracyMeters = 12.5f,
            nowMillis = 1_000L,
            newId = "fixed-id"
        )
        assertEquals(15.8352, entity.latitude!!, 0.0)
        assertEquals(78.8686, entity.longitude!!, 0.0)
        assertEquals(12.5f, entity.accuracy!!)
        val body = sosRequestBody(entity)
        assertEquals(15.8352, body.getDouble("latitude"), 0.0)
        assertEquals(78.8686, body.getDouble("longitude"), 0.0)
        assertEquals(12.5, body.getDouble("accuracy"), 0.0)
        assertEquals("p1", body.getString("patrolId"))
    }

    @Test
    fun `gps unavailable submits null coordinates and never fabricates zero-zero`() {
        val entity = buildSosEntity(patrolId = null, location = null)
        assertNull(entity.latitude)
        assertNull(entity.longitude)
        val body = sosRequestBody(entity)
        assertFalse(body.has("latitude"))
        assertFalse(body.has("longitude"))
        assertFalse(body.has("accuracy"))
        assertFalse(body.has("patrolId"))
    }

    @Test
    fun `sos marker in details is a real boolean for backend filtering`() {
        val entity = buildSosEntity(patrolId = null, location = null)
        val details = JSONObject(entity.detailsJson!!)
        assertTrue(details.getBoolean("sos"))
        assertEquals("QUICK_CAPTURE", entity.type)
        assertEquals("SOS", entity.title)
        assertEquals("HIGH", entity.severity)
        assertEquals("SUBMITTED", entity.status)
        assertEquals("PENDING", entity.syncStatus)
    }

    // ------------------------------------------------------------------
    // Contacts parsing (GET /api/sos/contacts)
    // ------------------------------------------------------------------

    @Test
    fun `contacts load from backend payload`() {
        val json = """
            [
              {"id":"u1","fullName":"DFO Ravi","phone":"+919000000001","role":"RANGER","cader":"DFO"},
              {"id":"u2","fullName":"FRO Latha","phone":null,"role":"RANGER","cader":"FRO"}
            ]
        """.trimIndent()
        val contacts = parseEmergencyContacts(json)
        assertEquals(2, contacts.size)
        assertEquals("DFO Ravi", contacts[0].fullName)
        assertEquals("+919000000001", contacts[0].phone)
        assertTrue(contacts[0].dialable)
    }

    @Test
    fun `null phone is handled gracefully and never dialable`() {
        val json = """[{"id":"u2","fullName":"FRO Latha","phone":null,"role":"RANGER","cader":"FRO"}]"""
        val contact = parseEmergencyContacts(json).single()
        assertNull(contact.phone)
        assertFalse(contact.dialable)
        assertEquals("FRO · RANGER", contact.designation)
    }

    @Test
    fun `malformed or empty contact payloads degrade to empty list`() {
        assertTrue(parseEmergencyContacts(null).isEmpty())
        assertTrue(parseEmergencyContacts("").isEmpty())
        assertTrue(parseEmergencyContacts("not json").isEmpty())
        assertTrue(parseEmergencyContacts("[]").isEmpty())
        assertTrue(parseEmergencyContacts("""[{"id":"u3","fullName":""}]""").isEmpty())
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private fun classify(
        statusCode: Int,
        errorCode: String? = null,
        retryAfter: Int? = null,
        message: String? = null
    ): SosOutcome = SosLogic.classifySosOutcome(statusCode, errorCode, retryAfter, message)

    /** In-memory TelemetryDao recording operation order for the SOS paths. */
    private class FakeDao : TelemetryDao {

        val incidents = linkedMapOf<String, IncidentEntity>()
        val opLog = mutableListOf<String>()

        override suspend fun insertIncident(incident: IncidentEntity) {
            incidents[incident.id] = incident
            opLog.add("insert:${incident.id}")
        }

        override suspend fun pendingIncidents(): List<IncidentEntity> =
            incidents.values.filter { it.syncStatus == "PENDING" }

        override suspend fun markIncidentsSynced() {
            incidents.keys.toList().forEach { key ->
                incidents[key] = incidents.getValue(key).copy(syncStatus = "SYNCED")
            }
        }

        override suspend fun markIncidentSynced(id: String) {
            incidents[id]?.let { incidents[id] = it.copy(syncStatus = "SYNCED") }
            opLog.add("markSynced:$id")
        }

        override suspend fun deleteIncident(id: String) {
            incidents.remove(id)
            opLog.add("delete:$id")
        }

        override suspend fun incidentById(id: String): IncidentEntity? = incidents[id]

        override suspend fun allIncidents(): List<IncidentEntity> = incidents.values.toList()

        override suspend fun countIncidents(): Int = incidents.size

        override suspend fun countSyncedIncidents(): Int =
            incidents.values.count { it.syncStatus == "SYNCED" }

        // ---- Unused by SOS tests ----

        override suspend fun insertPoint(point: PatrolPointEntity) = Unit
        override suspend fun insertPoints(points: List<PatrolPointEntity>) = Unit
        override suspend fun insertReading(reading: SensorReadingEntity) = Unit
        override suspend fun insertReadings(readings: List<SensorReadingEntity>) = Unit
        override fun totalPoints(): Flow<Int> = MutableStateFlow(0)
        override fun totalReadings(): Flow<Int> = MutableStateFlow(0)
        override fun pointsForPatrol(patrolId: String): Flow<Int> = MutableStateFlow(0)
        override fun readingsForPatrol(patrolId: String): Flow<Int> = MutableStateFlow(0)
        override fun pendingPoints(): Flow<Int> = MutableStateFlow(0)
        override fun pendingReadings(): Flow<Int> = MutableStateFlow(0)
        override suspend fun latestMovementReading(): SensorReadingEntity? = null
        override suspend fun stepsForPatrol(patrolId: String): Double = 0.0
        override suspend fun stepsForDay(startOfDay: Long, endOfDay: Long): Double = 0.0
        override suspend fun patrolPointsOrdered(patrolId: String): List<PatrolPointEntity> = emptyList()
        override suspend fun activeMovementSamplesForPatrol(patrolId: String): Int = 0
        override suspend fun movementModeCountsForPatrol(patrolId: String): List<MovementModeCount> = emptyList()
        override suspend fun movementSamplesForPatrol(patrolId: String): List<MovementSample> = emptyList()
        override suspend fun activeMovementSamplesForDay(startOfDay: Long, endOfDay: Long): Int = 0
        override suspend fun patrolIdsForDay(startOfDay: Long, endOfDay: Long): List<String> = emptyList()
        override suspend fun dailyActivity(date: String): DailyActivityEntity? = null
        override fun dailyActivityFlow(date: String): Flow<DailyActivityEntity?> = MutableStateFlow(null)
        override suspend fun upsertDailyActivity(entity: DailyActivityEntity) = Unit
        override suspend fun upsertPatrolSession(session: PatrolSessionEntity) = Unit
        override suspend fun insertSessionIfAbsent(session: PatrolSessionEntity) = Unit
        override suspend fun upsertPatrolPoints(points: List<PatrolPointEntity>) = Unit
        override suspend fun upsertSensorReadings(readings: List<SensorReadingEntity>) = Unit
        override suspend fun upsertIncidents(incidents: List<IncidentEntity>) = Unit
        override suspend fun upsertActivitySegments(segments: List<ActivitySegmentEntity>) = Unit
        override suspend fun upsertCoverageEvents(events: List<CoverageEventEntity>) = Unit
        override suspend fun upsertIntegrityLogs(logs: List<IntegrityLogEntity>) = Unit
        override suspend fun insertActivitySegments(segments: List<ActivitySegmentEntity>) = Unit
        override suspend fun insertCoverageEvents(events: List<CoverageEventEntity>) = Unit
        override suspend fun insertIntegrityLogs(logs: List<IntegrityLogEntity>) = Unit
        override suspend fun pendingActivitySegments(): List<ActivitySegmentEntity> = emptyList()
        override suspend fun pendingCoverageEvents(): List<CoverageEventEntity> = emptyList()
        override suspend fun pendingIntegrityLogs(): List<IntegrityLogEntity> = emptyList()
        override suspend fun markActivitySegmentsSynced(patrolId: String) = Unit
        override suspend fun markCoverageEventsSynced(patrolId: String) = Unit
        override suspend fun markIntegrityLogsSynced(patrolId: String) = Unit
        override suspend fun activitySegmentsForPatrol(patrolId: String): List<ActivitySegmentEntity> = emptyList()
        override suspend fun coverageEventsForPatrol(patrolId: String): List<CoverageEventEntity> = emptyList()
        override suspend fun integrityLogsForPatrol(patrolId: String): List<IntegrityLogEntity> = emptyList()
        override suspend fun deletePendingActivitySegmentsForPatrol(patrolId: String) = Unit
        override suspend fun deletePendingCoverageEventsForPatrol(patrolId: String) = Unit
        override suspend fun deletePendingIntegrityLogsForPatrol(patrolId: String) = Unit
        override suspend fun setDetectedMethod(patrolId: String, method: String?) = Unit
        override fun patrolSessionFlow(patrolId: String): Flow<PatrolSessionEntity?> = MutableStateFlow(null)
        override fun patrolPointsFlow(patrolId: String): Flow<List<PatrolPointEntity>> = MutableStateFlow(emptyList())
        override suspend fun patrolSession(patrolId: String): PatrolSessionEntity? = null
        override fun allPatrolSessions(): Flow<List<PatrolSessionEntity>> = MutableStateFlow(emptyList())
        override fun patrolSessionsByStatus(status: String): Flow<List<PatrolSessionEntity>> =
            MutableStateFlow(emptyList())

        override suspend fun updatePatrolStatus(patrolId: String, status: String) = Unit
        override suspend fun finalizeStaleActivePatrol(patrolId: String, endTime: Long) = Unit
        override suspend fun patrolStartTime(patrolId: String): Long? = null
        override suspend fun patrolEndTime(patrolId: String): Long? = null
        override suspend fun sessionsToSync(): List<PatrolSessionEntity> = emptyList()
        override suspend fun updateSessionSyncStatus(patrolId: String, status: String) = Unit
        override suspend fun deletePendingPointsForPatrol(patrolId: String) = Unit
        override suspend fun deletePendingReadingsForPatrol(patrolId: String) = Unit
        override suspend fun pendingPointRows(): List<PatrolPointEntity> = emptyList()
        override suspend fun markPointsSynced(patrolId: String) = Unit
        override suspend fun pendingReadingRows(): List<SensorReadingEntity> = emptyList()
        override suspend fun markReadingsSynced(patrolId: String) = Unit
        override suspend fun countSessions(): Int = 0
        override suspend fun countSyncedSessions(): Int = 0
        override suspend fun countPoints(): Int = 0
        override suspend fun countSyncedPoints(): Int = 0
        override suspend fun countReadings(): Int = 0
        override suspend fun countSyncedReadings(): Int = 0

        override suspend fun completePatrol(
            patrolId: String,
            endTime: Long,
            distance: Double,
            steps: Int,
            moveMin: Int,
            calories: Double,
            heartPoints: Double,
            avgSpeed: Double,
            points: Int
        ) = Unit
    }
}
