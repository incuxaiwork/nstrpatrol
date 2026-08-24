package com.nstrpatrol.app.data

import android.util.Log
import com.nstrpatrol.app.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.net.HttpURLConnection
import java.net.URL

/**
 * Polls GET /api/health/ping so the app knows when the *server* is reachable,
 * not just when the device has internet. NetworkStatus tells us the radio is
 * up; this tells us the backend is up (cold-start, 503, DNS).
 *
 * When [reachable] flips false→true and syncMode==Auto, MainActivity's
 * combine() triggers [SyncController.sync] automatically — no user action.
 * Only the lightweight /ping (no DB check, no auth) is polled.
 */
object ServerHealthMonitor {

    private const val TAG = "ServerHealthMonitor"
    private const val PING_PATH = "/api/health/ping"
    private const val POLL_MS = 15_000L
    private const val TIMEOUT_MS = 4_000

    @Volatile
    private var activeBaseUrl: String? = null

    private val _reachable = MutableStateFlow(false)
    val reachable: StateFlow<Boolean> = _reachable.asStateFlow()

    private val _lastCheckedAt = MutableStateFlow(0L)
    val lastCheckedAt: StateFlow<Long> = _lastCheckedAt.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var attached = false

    @Synchronized
    fun attach(context: android.content.Context, pollIntervalMs: Long = POLL_MS) {
        if (attached) return
        attached = true
        val app = context.applicationContext
        val observer = ConnectivityObserver(app)

        // Immediate probe on connectivity flip — don't wait for the interval.
        scope.launch {
            observer.isOnline.collect { online ->
                if (!online) {
                    _reachable.value = false
                    _lastCheckedAt.value = System.currentTimeMillis()
                } else {
                    val ok = doPing()
                    _reachable.value = ok
                    _lastCheckedAt.value = System.currentTimeMillis()
                    Log.i(TAG, "connectivity→online, ping reachable=$ok")
                }
            }
        }

        // Regular poll loop — fast so a waking server is used within seconds.
        scope.launch {
            // Prime immediately (observer also probes, but this covers already-online case).
            delay(500)
            while (true) {
                // Only hit the network when OS says we have internet; otherwise mark down.
                val online = NetworkStatus.online.value
                if (online) {
                    val ok = doPing()
                    if (_reachable.value != ok) Log.i(TAG, "poll reachable=$ok")
                    _reachable.value = ok
                    _lastCheckedAt.value = System.currentTimeMillis()
                } else {
                    _reachable.value = false
                }
                delay(pollIntervalMs)
            }
        }
    }

    /** One-shot check — also used by SyncWorker as a cheap gate before pushing. */
    fun isReachableNow(): Boolean = _reachable.value

    suspend fun checkNow(): Boolean {
        val ok = doPing()
        _reachable.value = ok
        _lastCheckedAt.value = System.currentTimeMillis()
        return ok
    }

    private fun getCandidateBaseUrls(): List<String> {
        val configured = BuildConfig.API_BASE_URL.trimEnd('/')
        return listOfNotNull(
            activeBaseUrl,
            configured,
            "http://10.0.2.2:3000",
            "http://127.0.0.1:3000"
        ).distinct()
    }

    private fun doPing(): Boolean {
        for (base in getCandidateBaseUrls()) {
            var conn: HttpURLConnection? = null
            try {
                conn = (URL("$base$PING_PATH").openConnection() as HttpURLConnection).apply {
                    connectTimeout = TIMEOUT_MS
                    readTimeout = TIMEOUT_MS
                    requestMethod = "GET"
                    instanceFollowRedirects = true
                    // No auth header — /ping is public (health.ts:7)
                }
                val code = conn.responseCode
                if (code in 200..299) {
                    activeBaseUrl = base
                    return true
                }
            } catch (e: Exception) {
                Log.d(TAG, "ping $base failed: ${e.message}")
            } finally {
                conn?.disconnect()
            }
        }
        return false
    }
}
