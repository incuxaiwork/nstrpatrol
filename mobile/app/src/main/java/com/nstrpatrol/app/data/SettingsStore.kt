package com.nstrpatrol.app.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Persisted user preferences.
 *
 * The sync mode drives the event-based auto-sync wired in [MainActivity]: when it
 * is [MODE_AUTO] the app flushes local buffers to the backend whenever
 * connectivity is (re)gained (via [ConnectivityObserver]), with no polling.
 * When [MODE_MANUAL] auto-sync is disabled and data only leaves the device on an
 * explicit user action (e.g. stopping a patrol).
 */
class SettingsStore(context: Context) {

    private val prefs =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val _syncMode =
        MutableStateFlow(prefs.getString(KEY_SYNC_MODE, DEFAULT_SYNC_MODE) ?: DEFAULT_SYNC_MODE)
    val syncMode: StateFlow<String> = _syncMode.asStateFlow()

    fun setSyncMode(mode: String) {
        val next = if (mode == MODE_AUTO) MODE_AUTO else MODE_MANUAL
        prefs.edit().putString(KEY_SYNC_MODE, next).apply()
        _syncMode.value = next
    }

    companion object {
        private const val PREFS_NAME = "nstr_settings"
        const val KEY_SYNC_MODE = "sync_mode"
        const val DEFAULT_SYNC_MODE = "Auto"
        const val MODE_AUTO = "Auto"
        const val MODE_MANUAL = "Manual"
    }
}
