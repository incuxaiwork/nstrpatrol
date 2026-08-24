package com.nstrpatrol.app.data

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import com.nstrpatrol.app.data.db.IncidentEntity
import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.data.map.ApiException
import com.nstrpatrol.app.data.map.BackendApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * Outcome of an SOS delivery attempt. The local Room record always exists by
 * the time any of these is produced (Room-first), except [Cooldown] where the
 * server refused creation and the local draft is removed again.
 */
sealed interface SosOutcome {
    /** HTTP 201 created, or 200 idempotent replay — both mean delivered. */
    data object Delivered : SosOutcome

    /** No network / transient server failure: stays PENDING, SyncManager retries. */
    data object QueuedOffline : SosOutcome

    /** 401: record kept untouched; recovers via normal re-login + sync. */
    data object AuthPending : SosOutcome

    /** 409 SOS_COOLDOWN: nothing was created server-side; draft discarded. */
    data class Cooldown(val retryAfterSeconds: Int?) : SosOutcome

    /** Permanent rejection (400/403/…): honest error, no silent retry loop. */
    data class Rejected(val message: String?) : SosOutcome
}

/** Pure SOS decision logic (no Android dependencies) so it is unit-testable. */
object SosLogic {

    /** Client-side cancellation window before an SOS is persisted/sent. */
    const val COUNTDOWN_SECONDS = 5

    fun classifySosOutcome(
        statusCode: Int,
        errorCode: String?,
        retryAfterSeconds: Int?,
        message: String?
    ): SosOutcome = when {
        statusCode in 200..299 -> SosOutcome.Delivered
        // BackendApiClient signals "cannot reach the server" with status 0.
        statusCode == 0 -> SosOutcome.QueuedOffline
        statusCode == 401 -> SosOutcome.AuthPending
        statusCode == 409 && errorCode == "SOS_COOLDOWN" ->
            SosOutcome.Cooldown(retryAfterSeconds)
        // Transient backend failure — treat like offline: keep PENDING, retry.
        statusCode >= 500 -> SosOutcome.QueuedOffline
        else -> SosOutcome.Rejected(message)
    }
}

/**
 * Builds the local SOS incident row. Stored exactly like every other field
 * report (type QUICK_CAPTURE) but flagged with details.sos = true — the same
 * marker the backend's POST /api/sos writes, so incidents uploaded later via
 * /api/sync/upload are recognized as SOS alerts by the alerts feed.
 */
fun buildSosEntity(
    patrolId: String?,
    location: Pair<Double, Double>?,
    accuracyMeters: Float? = null,
    nowMillis: Long = System.currentTimeMillis(),
    newId: String = UUID.randomUUID().toString()
): IncidentEntity = IncidentEntity(
    id = newId,
    patrolId = patrolId,
    type = "QUICK_CAPTURE",
    title = "SOS",
    description = "Emergency alert fired from ranger device",
    severity = "HIGH",
    detailsJson = JSONObject().put("sos", true).toString(),
    latitude = location?.first,
    longitude = location?.second,
    accuracy = accuracyMeters,
    photos = "[]",
    occurredAt = nowMillis,
    reportedAt = nowMillis
)

/** Direct-POST body for /api/sos. Absent GPS stays absent — never 0/0. */
fun sosRequestBody(entity: IncidentEntity): JSONObject = JSONObject().apply {
    put("id", entity.id)
    entity.patrolId?.let { put("patrolId", it) }
    entity.latitude?.let { put("latitude", it) }
    entity.longitude?.let { put("longitude", it) }
    entity.accuracy?.let { put("accuracy", it.toDouble()) }
}

/**
 * Room-first SOS delivery: persist PENDING, then attempt the immediate direct
 * POST with the SAME client-generated id. Whatever happens, the row survives
 * in Room until the server confirms (or the server explicitly refuses), so a
 * process death mid-flight loses nothing — the regular SyncManager uploads it
 * later over /api/sync/upload with the identical id (idempotent server-side).
 *
 * [postSos] performs the network call and throws [ApiException] on non-2xx;
 * injecting it keeps this function unit-testable.
 */
suspend fun deliverSos(
    dao: TelemetryDao,
    entity: IncidentEntity,
    postSos: (JSONObject) -> JSONObject
): SosOutcome {
    dao.insertIncident(entity)
    val outcome = try {
        postSos(sosRequestBody(entity))
        SosOutcome.Delivered
    } catch (e: ApiException) {
        SosLogic.classifySosOutcome(e.statusCode, e.errorCode, e.retryAfterSeconds, e.message)
    } catch (_: Exception) {
        SosOutcome.QueuedOffline
    }
    when (outcome) {
        is SosOutcome.Delivered -> dao.markIncidentSynced(entity.id)
        // Server refused creation (cooldown): discard the draft so the queued
        // sync cannot silently raise a second SOS once the window expires.
        is SosOutcome.Cooldown -> dao.deleteIncident(entity.id)
        // Permanent rejection: keep the row for inspection but stop retrying,
        // matching the existing convention for permanently failed patrols.
        is SosOutcome.Rejected -> dao.markIncidentSynced(entity.id)
        else -> Unit
    }
    return outcome
}

/**
 * Fire-and-forget SOS submission for click handlers: captures GPS, persists,
 * attempts the direct POST, kicks a sync when queued, and reports the outcome
 * on the main thread.
 */
@SuppressLint("MissingPermission")
fun sendSos(
    dao: TelemetryDao,
    api: BackendApiClient,
    patrolId: String?,
    context: Context,
    onOutcome: (SosOutcome) -> Unit
) {
    val location = lastKnownLocation(context)
    val entity = buildSosEntity(
        patrolId = patrolId,
        location = location?.let { it.latitude to it.longitude },
        accuracyMeters = location?.accuracy
    )
    CoroutineScope(Dispatchers.IO).launch {
        val outcome = try {
            deliverSos(dao, entity) { api.postJson("/api/sos", it) }
        } catch (_: Exception) {
            // deliverSos handles all network failures itself, so an escape here
            // means local persistence failed (e.g. disk full). Never claim the
            // alert was saved/queued when it was not.
            SosOutcome.Rejected("Could not save the emergency alert on this device")
        }
        if (outcome is SosOutcome.QueuedOffline) {
            runCatching { SyncController.sync(dao, api) }
        }
        Handler(Looper.getMainLooper()).post { onOutcome(outcome) }
    }
}

/** An emergency contact as returned by GET /api/sos/contacts. */
data class EmergencyContact(
    val id: String,
    val fullName: String,
    val phone: String?,
    val role: String,
    val cader: String?
) {
    /** Only real phone numbers are dialable — never fabricated. */
    val dialable: Boolean get() = !phone.isNullOrBlank()

    /** Role/cader line shown under the name. */
    val designation: String
        get() = listOf(cader, role)
            .filterNotNull()
            .filter { it.isNotBlank() }
            .distinct()
            .joinToString(" · ")
            .ifEmpty { "Staff" }
}

/** Parses GET /api/sos/contacts ([{id, fullName, phone, role, cader}]). */
fun parseEmergencyContacts(jsonText: String?): List<EmergencyContact> {
    if (jsonText.isNullOrBlank()) return emptyList()
    val arr = runCatching { JSONArray(jsonText) }.getOrNull() ?: return emptyList()
    val out = mutableListOf<EmergencyContact>()
    for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i) ?: continue
        val name = o.optString("fullName").trim()
        if (name.isEmpty()) continue
        out.add(
            EmergencyContact(
                id = o.optString("id"),
                fullName = name,
                phone = if (o.isNull("phone")) null else o.optString("phone").trim().ifEmpty { null },
                role = o.optString("role"),
                cader = o.optString("cader").ifEmpty { null }
            )
        )
    }
    return out
}
