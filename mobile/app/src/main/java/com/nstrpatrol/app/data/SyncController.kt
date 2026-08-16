package com.nstrpatrol.app.data

import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.data.map.BackendApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * App-wide sync coordinator. Lives for the process lifetime (its scope is not
 * tied to any screen), so a sync started from anywhere keeps running even if
 * the user navigates away — and every screen can observe [state] to show
 * progress/result. Manual and automatic syncs both go through here.
 */
object SyncController {

    sealed interface SyncState {
        data object Idle : SyncState
        /** Actively uploading; [progress] is 0f..1f of pending items done. */
        data class Syncing(val progress: Float) : SyncState
        data class Success(val synced: Int) : SyncState
        data class Failed(val message: String) : SyncState
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _state = MutableStateFlow<SyncState>(SyncState.Idle)
    val state: StateFlow<SyncState> = _state

    fun sync(dao: TelemetryDao, api: BackendApiClient) {
        if (_state.value is SyncState.Syncing) return
        scope.launch {
            _state.value = SyncState.Syncing(0f)
            val result = runCatching {
                SyncManager.syncNow(dao, api) { progress ->
                    _state.value = SyncState.Syncing(progress.coerceIn(0f, 1f))
                }
            }
            val next: SyncState = result.fold(
                onSuccess = { sum ->
                    if (sum.failedItems > 0 || sum.error != null) {
                        SyncState.Failed(sum.error ?: "${sum.failedItems} item(s) failed to sync")
                    } else {
                        SyncState.Success(sum.syncedItems)
                    }
                },
                onFailure = { SyncState.Failed(it.message ?: "Sync failed") }
            )
            _state.value = next
            // Clear the terminal state after a short while so the bar doesn't
            // linger forever (a new sync resets it anyway).
            if (next is SyncState.Success || next is SyncState.Failed) {
                launch {
                    delay(5000)
                    if (_state.value == next) _state.value = SyncState.Idle
                }
            }
        }
    }
}
