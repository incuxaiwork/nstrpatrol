package com.nstrpatrol.app

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import androidx.activity.compose.BackHandler
import androidx.activity.ComponentActivity
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nstrpatrol.app.data.AuthSession
import com.nstrpatrol.app.i18n.SupportedLanguages
import com.nstrpatrol.app.data.ConnectivityObserver
import com.nstrpatrol.app.data.PatrolTimer
import com.nstrpatrol.app.data.PhotoStore
import com.nstrpatrol.app.data.SyncManager
import com.nstrpatrol.app.data.db.NstrDatabase
import com.nstrpatrol.app.data.map.BackendApiClient
import com.nstrpatrol.app.time.ActivitySummary
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
import com.nstrpatrol.app.ui.screens.PatrolReportScreen
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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val DEBUG_START_PATROL = "com.nstrpatrol.app.DEBUG_START_PATROL"
private const val DEBUG_STOP_PATROL = "com.nstrpatrol.app.DEBUG_STOP_PATROL"

class MainActivity : ComponentActivity() {
    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(SupportedLanguages.wrapContext(newBase))
    }

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
    val auth = remember { AuthSession(context) }
    val restoredSession = remember { auth.restore() }
    val savedRoute = remember { sessionStore.lastRoute()?.let(Route::fromKey) }
    val nav = rememberSaveable(saver = NavStateSaver) {
        NstrNavState(
            initial = if (restoredSession && savedRoute != null && savedRoute != Route.Login) {
                savedRoute
            } else {
                Route.Login
            }
        )
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
    val api: BackendApiClient = auth.apiClient()
    val syncScope = remember { CoroutineScope(SupervisorJob() + Dispatchers.IO) }
    val connectivity = remember { ConnectivityObserver(context) }

    /** Stops a patrol, persists final stats locally, and syncs to the backend.
     *  [patrolId] defaults to the in-memory running patrol, but can be passed
     *  explicitly (e.g. for a patrol whose timer was lost across an app restart). */
    fun stopActivePatrol(patrolId: String? = null, navigateToAllPatrols: Boolean = true) {
        val pid = patrolId ?: patrolTimer.patrolId ?: return
        // Real stop time must come from the patrol timer (start + elapsed),
        // NOT the last telemetry sample — otherwise a partial GPS trace makes
        // the patrol look like it ended after only a few minutes.
        val endTime = if (patrolTimer.patrolId == pid && patrolTimer.isRunning()) {
            patrolTimer.trustedNow()
        } else {
            System.currentTimeMillis()
        }
        if (patrolTimer.patrolId == pid) patrolTimer.stop()
        syncScope.launch {
            val dao = database.telemetryDao()
            if (dao.patrolSession(pid) != null) {
                val metrics = ActivitySummary.computeForPatrol(pid, dao)
                dao.completePatrol(
                    patrolId = pid,
                    endTime = endTime,
                    distance = metrics.distanceMeters,
                    steps = metrics.steps,
                    moveMin = metrics.moveMinutes,
                    calories = metrics.caloriesEstimate,
                    heartPoints = metrics.heartPointsEstimate,
                    avgSpeed = metrics.avgSpeedKmh,
                    points = dao.patrolPointsOrdered(pid).size
                )
            }
            // Navigate first so the UI leaves the report screen immediately...
            if (navigateToAllPatrols) {
                withContext(Dispatchers.Main) { nav.navigateTo(Route.AllPatrols) }
            }
            // ...then best-effort sync; failures must not block navigation above.
            runCatching { SyncManager.syncNow(dao, api) }
            runCatching { api.completePatrol(pid) }
        }
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
                        DEBUG_STOP_PATROL -> stopActivePatrol(navigateToAllPatrols = false)
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

    // Sync is mobile -> server only, and event-driven: flush local buffers
    // whenever connectivity is (re)gained. No polling of the network or server.
    LaunchedEffect(Unit) {
        connectivity.isOnline.collect { online ->
            if (online) syncScope.launch { SyncManager.syncNow(database.telemetryDao(), api) }
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
        Route.Login -> LoginScreen(
            onLogin = { email, password ->
                try {
                    auth.login(email, password)
                    sessionStore.saveRoute(Route.Dashboard.key)
                    null
                } catch (e: Exception) {
                    e.message ?: "Login failed"
                }
            },
            onSuccess = { nav.resetTo(Route.Dashboard) }
        )

        Route.Dashboard -> DashboardScreen(
            onOpenLogs = { nav.navigateTo(Route.Logs) },
            onStartPatrol = { nav.navigateTo(Route.PatrolStart) },
            onQuickCapture = { nav.navigateTo(Route.QuickCapture) },
            onSos = { nav.navigateTo(Route.Sos) },
            onTabSelected = nav::selectTab,
            timeState = timeState,
            patrolTimer = patrolTimer,
            dao = database.telemetryDao(),
            user = auth.currentUser,
            onOpenPatrol = { nav.navigateTo(Route.PatrolReport(it)) }
        )

        Route.Maps -> MapsScreen(
            onTabSelected = nav::selectTab,
            patrolTimer = patrolTimer,
            telemetryManager = telemetryManager,
            dao = database.telemetryDao()
        )

        Route.AllPatrols -> AllPatrolsScreen(
            onTabSelected = nav::selectTab,
            onOpenPatrol = { patrolId -> nav.navigateTo(Route.PatrolReport(patrolId)) },
            dao = database.telemetryDao(),
            api = api
        )

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
            onTabSelected = nav::selectTab,
            dao = database.telemetryDao()
        )

        Route.Settings -> SettingsScreen(
            onLogout = {
                auth.logout()
                sessionStore.clear()
                nav.resetTo(Route.Login)
            },
            onOpenGpsDiagnostics = { nav.navigateTo(Route.GpsDiagnostics) },
            onTabSelected = nav::selectTab,
            user = auth.currentUser
        )

        Route.GpsDiagnostics -> GpsDiagnosticsScreen(
            manager = telemetryManager,
            recorder = telemetryRecorder,
            timeState = timeState,
            trustedUtcNow = { timeManager.trustedUtcNow() },
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab
        )

        Route.Logs -> LogsScreen(nav::selectTab, timeState = timeState, dao = database.telemetryDao())

        Route.PatrolStart -> PatrolStartScreen(
            onSave = { nav.popBack() },
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab,
            onStartPatrol = { patrolTimer.start(timeManager.trustedUtcNow(), System.currentTimeMillis()) },
            onOpenCamera = { slot -> nav.navigateTo(Route.Camera(slot)) },
            patrolTimer = patrolTimer,
            dao = database.telemetryDao(),
            api = api
        )

        Route.HumanImpact -> HumanImpactScreen(
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab,
            onOpenCamera = { slot -> nav.navigateTo(Route.Camera(slot)) },
            patrolTimer = patrolTimer,
            dao = database.telemetryDao(),
            api = api
        )

        Route.AnimalMortality -> AnimalMortalityScreen(
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab,
            onOpenCamera = { slot -> nav.navigateTo(Route.Camera(slot)) },
            patrolTimer = patrolTimer,
            dao = database.telemetryDao(),
            api = api
        )

        Route.Sighting -> SightingScreen(
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab,
            onOpenCamera = { slot -> nav.navigateTo(Route.Camera(slot)) },
            patrolTimer = patrolTimer,
            dao = database.telemetryDao(),
            api = api
        )

        Route.WaterSource -> WaterSourceScreen(
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab,
            onOpenCamera = { slot -> nav.navigateTo(Route.Camera(slot)) },
            patrolTimer = patrolTimer,
            dao = database.telemetryDao(),
            api = api
        )

        Route.QuickCapture -> QuickCaptureScreen(
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab,
            onOpenCamera = { slot -> nav.navigateTo(Route.Camera(slot)) },
            patrolTimer = patrolTimer,
            dao = database.telemetryDao(),
            api = api
        )

        Route.Sos -> SosScreen(nav::selectTab)

        is Route.IncidentDetail -> IncidentDetailScreen(
            incidentId = (nav.current as Route.IncidentDetail).incidentId,
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab,
            dao = database.telemetryDao()
        )

        is Route.Camera -> CameraScreen(
            slot = (nav.current as Route.Camera).slot,
            onClose = { nav.popBack() },
            onCaptured = { nav.popBack() }
        )

        is Route.PatrolReport -> {
            val pr = nav.current as Route.PatrolReport
            PatrolReportScreen(
                patrolId = pr.patrolId,
                onBack = { nav.popBack() },
                onTabSelected = nav::selectTab,
                dao = database.telemetryDao(),
                api = api,
                onEndPatrol = { stopActivePatrol(pr.patrolId) }
            )
        }
        }
    }
}
