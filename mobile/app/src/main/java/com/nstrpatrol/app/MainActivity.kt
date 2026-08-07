package com.nstrpatrol.app

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nstrpatrol.app.data.PatrolTimer
import com.nstrpatrol.app.data.PhotoStore
import com.nstrpatrol.app.data.db.NstrDatabase
import com.nstrpatrol.app.time.GpsTelemetryManager
import com.nstrpatrol.app.time.TelemetryRecorder
import com.nstrpatrol.app.time.TrustedTimeManager
import com.nstrpatrol.app.ui.navigation.NstrNavState
import com.nstrpatrol.app.ui.navigation.Route
import com.nstrpatrol.app.ui.screens.AllPatrolsScreen
import com.nstrpatrol.app.ui.screens.AnimalMortalityScreen
import com.nstrpatrol.app.ui.screens.CameraScreen
import com.nstrpatrol.app.ui.screens.DashboardScreen
import com.nstrpatrol.app.ui.screens.GpsDiagnosticsScreen
import com.nstrpatrol.app.ui.screens.HumanImpactScreen
import com.nstrpatrol.app.ui.screens.IncidentDetailScreen
import com.nstrpatrol.app.ui.screens.LoginScreen
import com.nstrpatrol.app.ui.screens.LogsScreen
import com.nstrpatrol.app.ui.screens.MapsScreen
import com.nstrpatrol.app.ui.screens.PatrolStartScreen
import com.nstrpatrol.app.ui.screens.QuickCaptureScreen
import com.nstrpatrol.app.ui.screens.ReportsScreen
import com.nstrpatrol.app.ui.screens.SettingsScreen
import com.nstrpatrol.app.ui.screens.SightingScreen
import com.nstrpatrol.app.ui.screens.SosScreen
import com.nstrpatrol.app.ui.screens.WaterSourceScreen
import com.nstrpatrol.app.ui.theme.Background
import com.nstrpatrol.app.ui.theme.NstrpatrolTheme
import java.io.File

private const val DEBUG_START_PATROL = "com.nstrpatrol.app.DEBUG_START_PATROL"
private const val DEBUG_STOP_PATROL = "com.nstrpatrol.app.DEBUG_STOP_PATROL"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        PhotoStore.init(File(filesDir, "captures"))
        setContent {
            NstrpatrolTheme {
                NstrApp()
            }
        }
    }
}

/** Persists the current route so a recreated/killed app resumes where it was. */
private class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("nstr_session", Context.MODE_PRIVATE)

    fun lastRoute(): String? = prefs.getString("route", null)

    fun saveRoute(key: String) {
        prefs.edit().putString("route", key).apply()
    }

    fun clear() {
        prefs.edit().remove("route").apply()
    }
}

/** Save/restore of the navigation back stack across configuration changes. */
private val NavStateSaver = Saver<NstrNavState, java.util.ArrayList<String>>(
    save = { nav -> java.util.ArrayList(nav.backStackKeys) },
    restore = { keys -> NstrNavState.fromKeys(keys) }
)

@Composable
fun NstrApp() {
    val context = LocalContext.current
    val sessionStore = remember { SessionStore(context) }
    val savedRoute = remember { sessionStore.lastRoute()?.let(Route::fromKey) }
    val nav = rememberSaveable(saver = NavStateSaver) {
        NstrNavState(initial = savedRoute ?: Route.Login)
    }
    LaunchedEffect(nav.current) {
        sessionStore.saveRoute(nav.current.key)
    }
    val timeManager = remember { TrustedTimeManager(context.applicationContext) }
    val telemetryManager = remember { GpsTelemetryManager(context.applicationContext) }
    val patrolTimer = remember { PatrolTimer() }
    val database = remember { NstrDatabase.getInstance(context.applicationContext) }
    val telemetryRecorder = remember {
        TelemetryRecorder(
            appContext = context.applicationContext,
            patrolTimer = patrolTimer,
            telemetryManager = telemetryManager,
            timeManager = timeManager,
            dao = database.telemetryDao()
        )
    }
    val timeState by timeManager.state.collectAsStateWithLifecycle()

    val activityRecognitionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> telemetryRecorder.onPermissionResult(granted) }
    LaunchedEffect(patrolTimer.running.value) {
        if (patrolTimer.running.value && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            !telemetryRecorder.hasActivityRecognitionPermission()
        ) {
            activityRecognitionLauncher.launch(Manifest.permission.ACTIVITY_RECOGNITION)
        }
    }

    if (BuildConfig.DEBUG) {
        val patrolBroadcast = remember {
            object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    when (intent?.action) {
                        DEBUG_START_PATROL ->
                            patrolTimer.start(timeManager.trustedUtcNow(), System.currentTimeMillis())
                        DEBUG_STOP_PATROL -> patrolTimer.stop()
                    }
                }
            }
        }
        DisposableEffect(Unit) {
            val filter = IntentFilter().apply {
                addAction(DEBUG_START_PATROL)
                addAction(DEBUG_STOP_PATROL)
            }
            ContextCompat.registerReceiver(
                context,
                patrolBroadcast,
                filter,
                ContextCompat.RECEIVER_EXPORTED
            )
            onDispose { context.unregisterReceiver(patrolBroadcast) }
        }
    }

    BackHandler(enabled = nav.canGoBack) {
        nav.popBack()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .safeDrawingPadding()
    ) {
        when (nav.current) {
        Route.Login -> LoginScreen(onLogin = { nav.resetTo(Route.Dashboard) })

        Route.Dashboard -> DashboardScreen(
            onOpenLogs = { nav.navigateTo(Route.Logs) },    
            onStartPatrol = { nav.navigateTo(Route.PatrolStart) },
            onQuickCapture = { nav.navigateTo(Route.QuickCapture) },
            onSos = { nav.navigateTo(Route.Sos) },
            onTabSelected = nav::selectTab,
            timeState = timeState,
            patrolTimer = patrolTimer
        )

        Route.Maps -> MapsScreen(nav::selectTab)

        Route.AllPatrols -> AllPatrolsScreen(nav::selectTab)

        Route.Reports -> ReportsScreen(
            onOpenCategory = { category ->
                when (category) {
                    "human_impact" -> nav.navigateTo(Route.HumanImpact)
                    "animal_mortality" -> nav.navigateTo(Route.AnimalMortality)
                    "sighting" -> nav.navigateTo(Route.Sighting)
                    "water_source" -> nav.navigateTo(Route.WaterSource)
                }
            },
            onOpenIncident = { incidentId -> nav.navigateTo(Route.IncidentDetail(incidentId)) },
            onTabSelected = nav::selectTab
        )

        Route.Settings -> SettingsScreen(
            onLogout = {
                sessionStore.clear()
                nav.resetTo(Route.Login)
            },
            onOpenGpsDiagnostics = { nav.navigateTo(Route.GpsDiagnostics) },
            onTabSelected = nav::selectTab
        )

        Route.GpsDiagnostics -> GpsDiagnosticsScreen(
            manager = telemetryManager,
            recorder = telemetryRecorder,
            timeState = timeState,
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab
        )

        Route.Logs -> LogsScreen(nav::selectTab, timeState = timeState)

        Route.PatrolStart -> PatrolStartScreen(
            onSave = { patrolTimer.start(timeManager.trustedUtcNow(), System.currentTimeMillis()); nav.popBack() },
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab,
            onOpenCamera = { slot -> nav.navigateTo(Route.Camera(slot)) }
        )

        Route.HumanImpact -> HumanImpactScreen(
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab,
            onOpenCamera = { slot -> nav.navigateTo(Route.Camera(slot)) }
        )

        Route.AnimalMortality -> AnimalMortalityScreen(
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab,
            onOpenCamera = { slot -> nav.navigateTo(Route.Camera(slot)) }
        )

        Route.Sighting -> SightingScreen(
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab,
            onOpenCamera = { slot -> nav.navigateTo(Route.Camera(slot)) }
        )

        Route.WaterSource -> WaterSourceScreen(
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab,
            onOpenCamera = { slot -> nav.navigateTo(Route.Camera(slot)) }
        )

        Route.QuickCapture -> QuickCaptureScreen(
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab,
            onOpenCamera = { slot -> nav.navigateTo(Route.Camera(slot)) }
        )

        Route.Sos -> SosScreen(nav::selectTab)

        is Route.IncidentDetail -> IncidentDetailScreen(
            incidentId = (nav.current as Route.IncidentDetail).incidentId,
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab
        )

        is Route.Camera -> CameraScreen(
            slot = (nav.current as Route.Camera).slot,
            onClose = { nav.popBack() },
            onCaptured = { nav.popBack() }
        )
        }
    }
}
