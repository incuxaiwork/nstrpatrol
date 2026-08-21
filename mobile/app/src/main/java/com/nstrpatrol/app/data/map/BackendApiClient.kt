package com.nstrpatrol.app.data.map

import android.util.Log
import com.nstrpatrol.app.BuildConfig
import com.nstrpatrol.app.data.db.PatrolPointEntity
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/** Raised when the backend answers a JSON request with a non-2xx status. */
class ApiException(
    val statusCode: Int,
    val errorCode: String?,
    message: String?,
    /** Server-provided retry hint (e.g. the SOS cooldown), when present. */
    val retryAfterSeconds: Int? = null
) : Exception(message ?: "HTTP $statusCode")

/**
 * Minimal HTTP client for the NSTR backend. Uses HttpURLConnection so no extra
 * dependencies are needed. Callers treat null/false as "not available" and fall
 * back to bundled assets or locally cached files. Authenticated calls use the
 * [accessToken] set by [setAccessToken]. The backend issues non-expiring access
 * tokens, so no refresh/rotation is needed.
 */
class BackendApiClient {

    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/')
    private var accessToken: String? = null

    /** Sets the bearer token used on subsequent authenticated calls. */
    fun setAccessToken(token: String?) {
        accessToken = token
    }

    /** GETs a UTF-8 text resource (e.g. GeoJSON). Returns null on any failure. */
    fun getText(path: String): String? {
        val candidates = getCandidateBaseUrls()
        for (baseUrl in candidates) {
            try {
                val conn = openUrl("$baseUrl$path", "GET")
                try {
                    accessToken?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
                    if (conn.responseCode in 200..299) {
                        activeBaseUrl = baseUrl
                        return conn.inputStream.bufferedReader().use { it.readText() }
                    }
                } finally {
                    conn.disconnect()
                }
            } catch (e: Exception) {
                Log.w("BackendApiClient", "GET $path via $baseUrl failed: ${e.message}")
            }
        }
        return null
    }

    /** Streams a binary resource (e.g. the MBTiles atlas) to [dest]. */
    fun downloadTo(path: String, dest: File): Boolean {
        dest.parentFile?.mkdirs()
        val tmp = File(dest.parentFile, dest.name + ".part")
        val candidates = getCandidateBaseUrls()
        for (baseUrl in candidates) {
            try {
                val conn = openUrl("$baseUrl$path", "GET")
                try {
                    accessToken?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
                    if (conn.responseCode in 200..299) {
                        conn.inputStream.use { input ->
                            FileOutputStream(tmp).use { output ->
                                input.copyTo(output)
                            }
                        }
                        if (tmp.renameTo(dest)) {
                            activeBaseUrl = baseUrl
                            return true
                        }
                        tmp.delete()
                    }
                } finally {
                    conn.disconnect()
                }
            } catch (e: Exception) {
                Log.w("BackendApiClient", "download $path via $baseUrl failed: ${e.message}")
            }
        }
        return false
    }

    /** GETs a JSON object. Returns null on non-2xx. */
    fun getJson(path: String): JSONObject? {
        val res = request(path, "GET", null) ?: return null
        if (res.first !in 200..299) return null
        return res.second?.let { runCatching { JSONObject(it) }.getOrNull() }
    }

    /** GETs a JSON array. Returns null on non-2xx. */
    fun getJsonArray(path: String): JSONArray? {
        val res = request(path, "GET", null) ?: return null
        if (res.first !in 200..299) return null
        return res.second?.let { runCatching { JSONArray(it) }.getOrNull() }
    }

    /** POSTs a JSON body. Throws [ApiException] on non-2xx. */
    fun postJson(path: String, body: JSONObject): JSONObject =
        requestJson(path, "POST", body)

    /** Creates a patrol on the backend, supplying a client-generated id. */
    fun createPatrol(body: JSONObject): JSONObject = postJson("/api/patrols", body)

    /** Marks a patrol COMPLETED on the backend. */
    fun completePatrol(patrolId: String, body: JSONObject = JSONObject()): JSONObject =
        postJson("/api/patrols/$patrolId/complete", body)

    /** Reports an incident on the backend. */
    fun createIncident(body: JSONObject): JSONObject = postJson("/api/incidents", body)

    /** Fetches a patrol's recorded points for route rendering (server-only patrols). */
    fun getPatrolPoints(patrolId: String): List<PatrolPointEntity> {
        val arr = getJsonArray("/api/patrols/$patrolId/points") ?: return emptyList()
        val out = ArrayList<PatrolPointEntity>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            out.add(
                PatrolPointEntity(
                    id = "",
                    patrolId = patrolId,
                    latitude = o.optDouble("lat", 0.0),
                    longitude = o.optDouble("lng", 0.0),
                    altitude = if (!o.isNull("altitude")) o.optDouble("altitude") else null,
                    speed = if (!o.isNull("speed")) o.optDouble("speed").toFloat() else null,
                    accuracy = null,
                    bearing = null,
                    timestamp = parseIsoMillis(o.optString("t")),
                    syncStatus = "SYNCED"
                )
            )
        }
        return out
    }

    private fun parseIsoMillis(iso: String): Long {
        if (iso.isEmpty()) return 0L
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
        return 0L
    }

    /** PATCHes a JSON body. Throws [ApiException] on non-2xx. */
    fun patchJson(path: String, body: JSONObject): JSONObject =
        requestJson(path, "PATCH", body)

    private fun requestJson(path: String, method: String, body: JSONObject): JSONObject {
        val res = request(path, method, body)
            ?: throw ApiException(0, "network", "Cannot reach the server")
        if (res.first in 200..299) {
            return res.second?.let { runCatching { JSONObject(it) }.getOrNull() } ?: JSONObject()
        }
        var errorCode: String? = null
        var message: String? = null
        var retryAfterSeconds: Int? = null
        if (res.second != null) {
            Log.w("BackendApiClient", "HTTP ${res.first} $path body: ${res.second?.take(500)}")
            runCatching {
                val root = JSONObject(res.second)
                val err = root.optJSONObject("error")
                if (err != null) {
                    errorCode = err.optString("code").ifEmpty { null }
                    message = err.optString("message").ifEmpty { null }
                } else {
                    // Some endpoints return the code as a plain string field,
                    // e.g. {"error":"SOS_COOLDOWN","retryAfterSeconds":42}.
                    errorCode = root.optString("error").ifEmpty { null }
                    message = root.optString("message").ifEmpty { null }
                }
                if (root.has("retryAfterSeconds")) {
                    val secs = root.optInt("retryAfterSeconds")
                    if (secs > 0) retryAfterSeconds = secs
                }
            }
        }
        throw ApiException(res.first, errorCode, message, retryAfterSeconds)
    }

    @Volatile
    private var activeBaseUrl: String? = null

    private fun getCandidateBaseUrls(): List<String> {
        val configured = BuildConfig.API_BASE_URL.trimEnd('/')
        return listOfNotNull(
            activeBaseUrl,
            configured,
            "http://10.0.2.2:3000",
            "http://127.0.0.1:3000"
        ).distinct()
    }

    /** Executes a request and returns (statusCode, responseBody) or null on transport failure. */
    private fun request(path: String, method: String, body: JSONObject?): Pair<Int, String?>? {
        for (baseUrl in getCandidateBaseUrls()) {
            try {
                val conn = openUrl("$baseUrl$path", method)
                try {
                    accessToken?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
                    if (body != null) {
                        conn.doOutput = true
                        conn.setRequestProperty("Content-Type", "application/json")
                        conn.outputStream.use { it.write(body.toString().toByteArray()) }
                    }
                    val code = conn.responseCode
                    val stream = if (code in 200..299) conn.inputStream else conn.errorStream
                    val text = stream?.bufferedReader()?.use { it.readText() }
                    activeBaseUrl = baseUrl
                    return Pair(code, text)
                } finally {
                    conn.disconnect()
                }
            } catch (e: Exception) {
                Log.w("BackendApiClient", "$method $path via $baseUrl failed: ${e.message}")
            }
        }
        return null
    }

    private fun openUrl(fullUrl: String, method: String): HttpURLConnection {
        return (URL(fullUrl).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 120_000
            instanceFollowRedirects = true
            requestMethod = method
        }
    }
}
