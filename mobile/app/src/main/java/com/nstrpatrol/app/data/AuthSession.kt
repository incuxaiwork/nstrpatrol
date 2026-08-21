package com.nstrpatrol.app.data

import android.content.Context
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.nstrpatrol.app.data.face.FaceRecognizer
import com.nstrpatrol.app.data.map.ApiException
import com.nstrpatrol.app.data.map.BackendApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** Signed-in user profile as returned by /api/auth/login and /api/auth/me. */
data class AuthUser(
    val id: String,
    val email: String,
    val fullName: String,
    val role: String,
    val cader: String?,
    val phone: String?,
    val isAdmin: Boolean
) {
    val initial: String
        get() = fullName.trim().firstOrNull()?.uppercase() ?: "?"

    val firstName: String
        get() = fullName.trim().split(Regex("\\s+")).firstOrNull()?.takeIf { it.isNotEmpty() } ?: fullName

    val designation: String
        get() = when {
            role == "ADMIN" || isAdmin -> "Administrator"
            cader == "FRO" -> "Field Range Officer"
            cader == "DyRO" -> "Deputy Range Officer"
            cader == "FSO" -> "Forest Section Officer"
            cader == "FBO" -> "Forest Beat Officer"
            cader == "ABO" -> "Assistant Beat Officer"
            else -> "Field Officer"
        }

    companion object {
        fun fromJson(o: JSONObject?): AuthUser? {
            o ?: return null
            return AuthUser(
                id = o.optString("id"),
                email = o.optString("email"),
                fullName = o.optString("fullName"),
                role = o.optString("role", "RANGER"),
                cader = o.optString("cader").ifEmpty { null },
                phone = o.optString("phone").ifEmpty { null },
                isAdmin = o.optBoolean("isAdmin", false)
            )
        }
    }
}

/**
 * Owns the login session: access/refresh tokens and the signed-in user, persisted
 * in SharedPreferences so the session survives app restarts.
 */
class AuthSession(context: Context) {

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("nstr_auth", Context.MODE_PRIVATE)
    private val client = BackendApiClient()
    private val deviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Whether a session is stored. Call [restore] after creation to activate it. */
    fun hasSession(): Boolean = prefs.getString("accessToken", null) != null

    /** Loads a cached session (if any) into the API client. Returns true when restored. */
    fun restore(): Boolean {
        val token = prefs.getString("accessToken", null) ?: return false
        client.setAccessToken(token)
        // Re-register this handset in the background if it hasn't been done for
        // this install yet (e.g. after an app upgrade or a missed registration).
        deviceScope.launch { registerDevice() }
        return true
    }

    /** Current user from the cached session, or null when not signed in. */
    val currentUser: AuthUser?
        get() = prefs.getString("user", null)
            ?.let { runCatching { AuthUser.fromJson(JSONObject(it)) }.getOrNull() }

    /**
     * Authenticates against the backend (POST /api/auth/login), stores the
     * session, registers this device, and returns the signed-in user.
     * Throws on wrong credentials / network failure.
     */
    suspend fun login(email: String, password: String): AuthUser = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("email", email.trim())
            .put("password", password)
        val res = client.postJson("/api/auth/login", body)
        val accessToken = res.optString("accessToken")
        val refreshToken = res.optString("refreshToken")
        val user = AuthUser.fromJson(res.optJSONObject("user"))
            ?: throw ApiException(0, "bad_response", "Unexpected server response")
        val userJson = res.optJSONObject("user")?.toString().orEmpty()
        prefs.edit()
            .putString("accessToken", accessToken)
            .putString("refreshToken", refreshToken)
            .putString("user", userJson)
            .apply()
        client.setAccessToken(accessToken)
        deviceScope.launch { registerDevice() }
        user
    }

    /** Stable identity for this handset (ANDROID_ID, else build fingerprint). */
    fun deviceId(): String =
        Settings.Secure.getString(appContext.contentResolver, Settings.Secure.ANDROID_ID)
            ?: Build.FINGERPRINT

    /** Synchronous check: has THIS officer finished face setup on THIS device? */
    fun faceSetupDoneLocally(): Boolean =
        prefs.getString("faceSetupDoneFor", null) == deviceId()

    /**
     * Whether this officer still has to set up face verification on this handset
     * before they can start patrols. The backend is authoritative (its Device row
     * records the last officer who verified; a new phone or a different officer
     * on the same phone means setup again). Offline, trust the local record.
     */
    suspend fun needsFaceSetup(): Boolean = withContext(Dispatchers.IO) {
        val id = deviceId()
        val locallyDone = prefs.getString("faceSetupDoneFor", null) == id
        val backend = deviceVerifiedOnBackend()
        when (backend) {
            true -> {
                // Confirmed on the server by this same officer — record it locally.
                if (!locallyDone) prefs.edit().putString("faceSetupDoneFor", id).apply()
                false
            }
            false -> true
            null -> !locallyDone // offline: only a known-good local record lets us skip
        }
    }

    /** Queries the backend for this handset's verification state for the signed-in user. */
    private suspend fun deviceVerifiedOnBackend(): Boolean? = withContext(Dispatchers.IO) {
        val id = deviceId()
        val arr = runCatching { client.myDevices() }.getOrNull() ?: return@withContext null
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (o.optString("deviceId") != id) continue
            val verifiedBy = o.optString("verifiedByUserId").ifEmpty { null }
            val verifiedAt = o.optString("faceVerifiedAt").ifEmpty { null }
            // The device is verified only when the CURRENT officer verified it.
            return@withContext verifiedAt != null && verifiedBy == currentUser?.id
        }
        null // this handset isn't registered yet
    }

    /** Uploads the reference selfie link and marks this handset verified on the backend. */
    suspend fun markDeviceFaceVerified(
        photoKey: String?,
        mode: String,
        embedding: FloatArray? = null,
        matchScore: Float? = null
    ) = withContext(Dispatchers.IO) {
        val id = deviceId()
        client.verifyDeviceFace(id, photoKey, mode, embedding, matchScore)
        if (embedding != null) cacheFaceReference(embedding)
        prefs.edit().putString("faceSetupDoneFor", id).apply()
    }

    /** Caches this device's reference face embedding locally (per handset). */
    fun cacheFaceReference(embedding: FloatArray) {
        prefs.edit()
            .putString("faceRefEmbeddingFor", deviceId())
            .putString("faceRefEmbedding", com.nstrpatrol.app.data.face.FaceRecognizer.encode(embedding))
            .apply()
    }

    /**
     * The officer's reference face embedding for THIS handset: the local cache when
     * present, otherwise restored from the backend Device row (e.g. after reinstall).
     * Null when no reference exists yet.
     */
    suspend fun faceReference(): FloatArray? = withContext(Dispatchers.IO) {
        val id = deviceId()
        if (prefs.getString("faceRefEmbeddingFor", null) == id) {
            FaceRecognizer.decode(prefs.getString("faceRefEmbedding", null))?.let { return@withContext it }
        }
        // Fall back to the server copy for this handset.
        val arr = runCatching { client.myDevices() }.getOrNull() ?: return@withContext null
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (o.optString("deviceId") != id) continue
            val ref = FaceRecognizer.decode(o.optString("faceEmbedding").ifEmpty { null })
            if (ref != null) cacheFaceReference(ref)
            return@withContext ref
        }
        null
    }

    /** Ensures this handset's Device row exists before face-verification is recorded. */
    suspend fun ensureDeviceRegistered() = withContext(Dispatchers.IO) {
        val id = deviceId()
        if (prefs.getString("deviceRegisteredFor", null) == id) return@withContext
        registerNow()
        prefs.edit().putString("deviceRegisteredFor", id).apply()
    }

    /** Registers this handset with the backend so patrols can be assigned to it. */
    private fun registerDevice() {
        val id = deviceId()
        // Already registered for this install — don't re-POST on every login.
        if (prefs.getString("deviceRegisteredFor", null) == id) return
        runCatching { registerNow() }
            .onSuccess { prefs.edit().putString("deviceRegisteredFor", id).apply() }
            .onFailure { t ->
                // Best-effort, but surface it so failures aren't invisible.
                Log.w("AuthSession", "device registration failed: ${t.message}")
            }
    }

    private fun registerNow() {
        val body = JSONObject()
            .put("deviceId", deviceId())
            .put("deviceName", "NSTR Patrol")
            .put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}")
        client.postJson("/api/devices", body)
    }

    /** Currently assigned patrol name (first ACTIVE/AUTO assignment), best-effort. */
    suspend fun currentPatrolName(): String? = withContext(Dispatchers.IO) {
        if (!hasSession()) return@withContext null
        val arr = runCatching { client.getJsonArray("/api/patrols?assignedTo=me") }.getOrNull()
            ?: return@withContext null
        var fallback: String? = null
        for (i in 0 until arr.length()) {
            val p = arr.optJSONObject(i) ?: continue
            val status = p.optString("status")
            val name = p.optString("name")
            if (name.isEmpty()) continue
            if (status == "ACTIVE") return@withContext name
            if (status == "ASSIGNED" && fallback == null) fallback = name
        }
        fallback
    }

    /** Clears the stored session and the bearer token. */
    fun logout() {
        prefs.edit().clear().apply()
        client.setAccessToken(null)
    }

    /** The authenticated API client used for backend calls (patrol/telemetry sync). */
    fun apiClient(): BackendApiClient = client
}