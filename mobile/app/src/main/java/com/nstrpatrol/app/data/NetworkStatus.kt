package com.nstrpatrol.app.data

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Process-wide live online/offline state, so every screen can show a "no
 * internet" indicator automatically the moment connectivity changes.
 *
 * Attached once from the activity via [attach]; before that (and on first
 * frames) it reports online, and there is no annoying false "offline" flash.
 */
object NetworkStatus {

    private val _online = MutableStateFlow(true)
    val online: StateFlow<Boolean> = _online.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var attached = false

    @Synchronized
    fun attach(context: Context) {
        if (attached) return
        attached = true
        val observer = ConnectivityObserver(context.applicationContext)
        scope.launch {
            observer.isOnline.collect { _online.value = it }
        }
    }
}