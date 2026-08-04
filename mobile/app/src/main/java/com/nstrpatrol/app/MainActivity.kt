package com.nstrpatrol.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import com.nstrpatrol.app.ui.navigation.NstrNavState
import com.nstrpatrol.app.ui.navigation.Route
import com.nstrpatrol.app.ui.screens.AllPatrolsScreen
import com.nstrpatrol.app.ui.screens.AnimalMortalityScreen
import com.nstrpatrol.app.ui.screens.DashboardScreen
import com.nstrpatrol.app.ui.screens.HumanImpactScreen
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

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            NstrpatrolTheme {
                NstrApp()
            }
        }
    }
}

@Composable
fun NstrApp() {
    val nav = remember { NstrNavState() }

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
            onTabSelected = nav::selectTab
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
            onTabSelected = nav::selectTab
        )

        Route.Settings -> SettingsScreen(
            onLogout = { nav.resetTo(Route.Login) },
            onTabSelected = nav::selectTab
        )

        Route.Logs -> LogsScreen(nav::selectTab)

        Route.PatrolStart -> PatrolStartScreen(
            onSave = { nav.popBack() },
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab
        )

        Route.HumanImpact -> HumanImpactScreen(
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab
        )

        Route.AnimalMortality -> AnimalMortalityScreen(
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab
        )

        Route.Sighting -> SightingScreen(
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab
        )

        Route.WaterSource -> WaterSourceScreen(
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab
        )

        Route.QuickCapture -> QuickCaptureScreen(
            onBack = { nav.popBack() },
            onTabSelected = nav::selectTab
        )

        Route.Sos -> SosScreen(nav::selectTab)
        }
    }
}
