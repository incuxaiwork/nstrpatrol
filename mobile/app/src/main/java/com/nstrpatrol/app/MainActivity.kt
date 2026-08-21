package com.nstrpatrol.app

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nstrpatrol.app.R
import com.nstrpatrol.app.data.AuthSession
import com.nstrpatrol.app.i18n.SupportedLanguages
import com.nstrpatrol.app.data.ConnectivityObserver
import com.nstrpatrol.app.data.NetworkStatus
import com.nstrpatrol.app.data.PatrolTimer
import com.nstrpatrol.app.data.PhotoStore
import com.nstrpatrol.app.data.SettingsStore
import com.nstrpatrol.app.data.SyncController
import com.nstrpatrol.app.data.SyncScheduler
import com.nstrpatrol.app.data.db.NstrDatabase
import com.nstrpatrol.app.data.map.BackendApiClient
import com.nstrpatrol.app.time.ActivitySummary
import com.nstrpatrol.app.time.GpsTelemetryManager
import com.nstrpatrol.app.time.PatrolForegroundService
import com.nstrpatrol.app.time.PatrolMetrics
import com.nstrpatrol.app.time.TelemetryRecorder
import com.nstrpatrol.app.time.TrustedTimeManager
import com.nstrpatrol.app.ui.navigation.NstrNavState
import com.nstrpatrol.app.ui.navigation.Route
import com.nstrpatrol.app.ui.screens.AllPatrolsScreen
import com.nstrpatrol.app.ui.screens.AnimalMortalityScreen
import com.nstrpatrol.app.ui.screens.CameraScreen
import com.nstrpatrol.app.ui.screens.DashboardScreen
import com.nstrpatrol.app.ui.screens.FaceSetupScreen
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val DEBUG_START_PATROL = "com.nstrpatrol.app.DEBUG_START_PATROL"
private const val DEBUG_STOP_PATROL = "com.nstrpatrol.app.DEBUG_STOP_PATROL"

class MainActivity : FragmentActivity() {
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
    val settings = remember { SettingsStore(context.applicationContext) }
    val telemetryManager = remember { GpsTelemetryManager(context.applicationContext, settings) }
    val patrolTimer = remember { PatrolTimer() }
    val database = remember { NstrDatabase.getInstance(context.applicationContext) }
    val telemetryRecorder = remember {
        TelemetryRecorder(
            appContext = context.applicationContext,
            patrolTimer = patrolTimer,
            telemetryManager = telemetryManager,
            timeManager = timeManager,
            dao = database.telemetryDao(),
            settings = settings
        )
    }
    val api: BackendApiClient = auth.apiClient()
    val syncScope = remember { CoroutineScope(SupervisorJob() + Dispatchers.IO) }
    val connectivity = remember { ConnectivityObserver(context) }

    // Schedule background sync: every 30 min while online + an immediate
    // network-gated sync so data flows as soon as connectivity returns.
    LaunchedEffect(Unit) {
        NetworkStatus.attach(context.applicationContext)
        SyncScheduler.schedule(context.applicationContext)
        // Recover orphaned ACTIVE sessions: the in-memory patrol timer is lost
        // when the process is killed (force-stop, crash, reboot), so any session
        // still ACTIVE in Room at startup can no longer be "in progress" — stop it
        // showing as a live patrol and let its recorded points sync as completed.
        withContext(Dispatchers.IO) {
            val dao = database.telemetryDao()
            dao.patrolSessionsByStatus("ACTIVE").first().forEach { s ->
                val lastTs = dao.patrolPointsOrdered(s.patrolId).lastOrNull()?.timestamp
                dao.finalizeStaleActivePatrol(s.patrolId, lastTs ?: s.startTime)
            }
        }
    }

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
        if (patrolTimer.patrolId == pid) {
            patrolTimer.stop()
            PatrolForegroundService.stop(context)
        }
        syncScope.launch {
            val dao = database.telemetryDao()
            // Finalize the local session FIRST and unconditionally: metric
            // computation must never block the status flip, otherwise an ended
            // patrol stays "ACTIVE / in progress" forever.
            val metrics = runCatching { ActivitySummary.computeForPatrol(pid, dao) }
                .getOrElse { PatrolMetrics() }
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
            // Navigate first so the UI leaves the report screen immediately...
            if (navigateToAllPatrols) {
                withContext(Dispatchers.Main) { nav.navigateTo(Route.AllPatrols) }
            }
            // ...then best-effort sync; failures must not block navigation above.
            SyncController.sync(dao, api)
            runCatching { api.completePatrol(pid) }
        }
    }
    val timeState by timeManager.state.collectAsStateWithLifecycle()

    val activityRecognitionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> telemetryRecorder.onPermissionResult(granted) }
    val notificationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { }
    // The FGS is declared with foregroundServiceType="location". On Android
    // 14/15 that start throws SecurityException unless ACCESS_FINE_LOCATION is
    // runtime-granted first, so a patrol start requires it before we fire the
    // service — otherwise a fresh install would crash the app at patrol start.
    var pendingPatrolAfterLocationGrant by rememberSaveable { mutableStateOf(false) }

    /** Kicks off the actual patrol once location permission is available. */
    fun beginPatrol() {
        patrolTimer.start(timeManager.trustedUtcNow(), System.currentTimeMillis())
        PatrolForegroundService.start(context)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    val locationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (pendingPatrolAfterLocationGrant) {
            pendingPatrolAfterLocationGrant = false
            if (granted) beginPatrol()
        }
    }
    LaunchedEffect(patrolTimer.running.value) {
        if (patrolTimer.running.value && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            !telemetryRecorder.hasActivityRecognitionPermission()
        ) {
            activityRecognitionLauncher.launch(Manifest.permission.ACTIVITY_RECOGNITION)
        }
    }

    /** Starts a patrol: timer + keep-alive foreground service + notifications. */
    fun startPatrolNow() {
        // The app tracks exactly one active patrol at a time; a second start
        // would fork a stray ACTIVE session that never gets completed.
        if (patrolTimer.isRunning()) return
        if (ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            pendingPatrolAfterLocationGrant = true
            locationLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
            return
        }
        beginPatrol()
    }

    if (BuildConfig.DEBUG) {
        val patrolBroadcast = remember {
            object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    when (intent?.action) {
                        DEBUG_START_PATROL -> startPatrolNow()
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
    // whenever connectivity is (re)gained (via ConnectivityObserver's network
    // callback — no polling). Gated by the user's sync setting: only runs in
    // Auto mode. Flipping Manual -> Auto also triggers an immediate sync.
    LaunchedEffect(Unit) {
        combine(connectivity.isOnline, settings.syncMode) { online, mode ->
            online && mode == SettingsStore.MODE_AUTO
        }.collect { shouldSync ->
            if (shouldSync) {
                SyncController.sync(database.telemetryDao(), api)
            }
        }
    }

    // While a patrol is running, push its growing PENDING data to the backend
    // on a rolling cadence. Connectivity toggles / the 30-min WorkManager are
    // too rare on a multi-hour patrol, so without this the backend stays hours
    // out of date (and the "sync queue" looks stuck).
    LaunchedEffect(patrolTimer.running.value) {
        while (patrolTimer.running.value) {
            if (NetworkStatus.online.value && settings.syncMode.value == SettingsStore.MODE_AUTO) {
                SyncController.sync(database.telemetryDao(), api)
            }
            delay(3 * 60 * 1000L)
        }
    }

    BackHandler(enabled = nav.canGoBack) {
        nav.popBack()
    }

    // Whether the device currently has internet; drives sync-then-close on exit.
    val isOnline by combine(connectivity.isOnline, settings.syncMode) { online, _ -> online }
        .collectAsStateWithLifecycle(initialValue = false)

    // Guards the app from being closed while a patrol is on the go.
    var isExiting by remember { mutableStateOf(false) }

    // Root back (no screen to pop): never close during a patrol — background the
    // app instead so tracking/telemetry keeps running. Otherwise sync-then-close
    // when online, close immediately when offline (sync resumes later via WorkManager).
    val activity = context as? android.app.Activity
    BackHandler(enabled = !nav.canGoBack) {
        if (patrolTimer.isRunning()) {
            @Suppress("DEPRECATION")
            activity?.moveTaskToBack(true)
            return@BackHandler
        }
        if (isExiting) return@BackHandler
        if (isOnline) {
            isExiting = true
            syncScope.launch {
                SyncController.sync(database.telemetryDao(), api)
                SyncController.state.first {
                    it is SyncController.SyncState.Success || it is SyncController.SyncState.Failed
                }
                activity?.finish()
            }
        } else {
            activity?.finish()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .safeDrawingPadding()
    ) {
        when (nav.current) {
        Route.Login -> {
            var needsSetup by remember { mutableStateOf(false) }
            LoginScreen(
                onLogin = { email, password ->
                    try {
                        auth.login(email, password)
                        needsSetup = auth.needsFaceSetup()
                        sessionStore.saveRoute(
                            if (needsSetup) Route.FaceSetup.key else Route.Dashboard.key
                        )
                        null
                    } catch (e: Exception) {
                        e.message ?: "Login failed"
                    }
                },
                onSuccess = {
                    nav.resetTo(if (needsSetup) Route.FaceSetup else Route.Dashboard)
                }
            )
        }

        Route.FaceSetup -> FaceSetupScreen(
            onDone = {
                sessionStore.saveRoute(Route.Dashboard.key)
                nav.resetTo(Route.Dashboard)
            },
            auth = auth,
            api = api
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
            movement = telemetryRecorder.movement,
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
            settings = settings,
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

        Route.Logs -> LogsScreen(nav::selectTab, timeState = timeState, dao = database.telemetryDao(), api = api)

        Route.PatrolStart -> PatrolStartScreen(
            onSave = { nav.popBack() },
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab,
            onStartPatrol = { startPatrolNow() },
            onOpenCamera = { slot -> nav.navigateTo(Route.Camera(slot)) },
            patrolTimer = patrolTimer,
            dao = database.telemetryDao(),
            api = api,
            auth = auth,
            onRequireFaceSetup = { nav.navigateTo(Route.FaceSetup) }
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

        Route.Sos -> SosScreen(
            api = api,
            dao = database.telemetryDao(),
            patrolTimer = patrolTimer,
            onTabSelected = nav::selectTab
        )

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

        if (isExiting) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.6f)),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Color.White)
                    Spacer(Modifier.height(16.dp))
                    Text(
                        text = stringResource(R.string.exit_sync_message),
                        color = Color.White
                    )
                }
            }
        }
    }
}
