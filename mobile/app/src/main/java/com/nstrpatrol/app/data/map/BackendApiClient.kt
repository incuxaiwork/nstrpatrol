package com.nstrpatrol.app.data.map

import android.util.Log
import com.nstrpatrol.app.BuildConfig
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/** Raised when the backend answers a JSON request with a non-2xx status. */
class ApiException(val statusCode: Int, val errorCode: String?, message: String?) :
    Exception(message ?: "HTTP $statusCode")

/**
 * Minimal HTTP client for the NSTR backend. Uses HttpURLConnection so no extra
 * dependencies are needed. Callers treat null/false as "not available" and fall
 * back to bundled assets or locally cached files. Authenticated calls use the
 * [accessToken] set by [setAccessToken].
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
        return try {
            val conn = open(path, "GET")
            try {
                if (conn.responseCode in 200..299) {
                    conn.inputStream.bufferedReader().use { it.readText() }
                } else {
                    Log.w("BackendApiClient", "GET $path -> ${conn.responseCode}")
                    null
                }
            } finally {
                conn.disconnect()
            }
        } catch (e: Exception) {
            Log.w("BackendApiClient", "GET $path failed", e)
            null
        }
    }

    /** Streams a binary resource (e.g. the MBTiles atlas) to [dest]. */
    fun downloadTo(path: String, dest: File): Boolean {
        return try {
            dest.parentFile?.mkdirs()
            val tmp = File(dest.parentFile, dest.name + ".part")
            val conn = open(path, "GET")
            try {
                if (conn.responseCode !in 200..299) {
                    Log.w("BackendApiClient", "download $path -> ${conn.responseCode}")
                    return false
                }
                conn.inputStream.use { input ->
                    FileOutputStream(tmp).use { output ->
                        input.copyTo(output)
                    }
                }
            } finally {
                conn.disconnect()
            }
            if (tmp.renameTo(dest)) {
                true
            } else {
                tmp.delete()
                false
            }
        } catch (e: Exception) {
            Log.w("BackendApiClient", "download $path failed", e)
            false
        }
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
        if (res.second != null) {
            runCatching {
                val err = JSONObject(res.second).optJSONObject("error")
                if (err != null) {
                    errorCode = err.optString("code").ifEmpty { null }
                    message = err.optString("message").ifEmpty { null }
                }
            }
        }
        throw ApiException(res.first, errorCode, message)
    }

    /** Executes a request and returns (statusCode, responseBody) or null on transport failure. */
    private fun request(path: String, method: String, body: JSONObject?): Pair<Int, String?>? {
        return try {
            val conn = open(path, method)
            try {
                if (body != null) {
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.outputStream.use { it.write(body.toString().toByteArray()) }
                }
                accessToken?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
                val code = conn.responseCode
                val stream = if (code in 200..299) conn.inputStream else conn.errorStream
                val text = stream?.bufferedReader()?.use { it.readText() }
                Pair(code, text)
            } finally {
                conn.disconnect()
            }
        } catch (e: Exception) {
            Log.w("BackendApiClient", "$method $path failed", e)
            null
        }
    }

    private fun open(path: String, method: String): HttpURLConnection {
        return (URL("$baseUrl$path").openConnection() as HttpURLConnection).apply {
            connectTimeout = 8_000
            readTimeout = 60_000
            instanceFollowRedirects = true
            requestMethod = method
        }
    }
}
