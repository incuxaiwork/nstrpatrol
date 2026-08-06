package com.nstrpatrol.app.ui.navigation

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/** All routes reachable in the app. */
sealed class Route(val route: String) {
    data object Login : Route("login")
    data object Dashboard : Route("dashboard")
    data object Maps : Route("maps")
    data object AllPatrols : Route("all_patrols")
    data object Reports : Route("reports")
    data object Settings : Route("settings")
    data object Logs : Route("logs")
    data object PatrolStart : Route("patrol_start")
    data object HumanImpact : Route("human_impact")
    data object AnimalMortality : Route("animal_mortality")
    data object Sighting : Route("sighting")
    data object WaterSource : Route("water_source")
    data object QuickCapture : Route("quick_capture")
    data object Sos : Route("sos")
    data object GpsDiagnostics : Route("gps_diagnostics")

    /** Full-screen camera; [slot] is the PhotoStore key for the requesting form. */
    data class Camera(val slot: String) : Route("camera")
}

/** Bottom navigation tabs. */
enum class BottomTab(
    val label: String,
    val route: Route
) {
    Home("Home", Route.Dashboard),
    Maps("Maps", Route.Maps),
    Patrol("Patrol", Route.AllPatrols),
    Reports("Reports", Route.Reports),
    Settings("Settings", Route.Settings)
}

/**
 * Minimal back-stack based navigator. Tab selection replaces the stack with the
 * tab root; sub-flows push onto the stack so the system back button returns to
 * the previous screen.
 */
class NstrNavState(initial: Route = Route.Login) {

    var current: Route by mutableStateOf(initial)
        private set

    private val backStack = ArrayDeque<Route>().apply { add(initial) }

    val canGoBack: Boolean get() = backStack.size > 1

    fun navigateTo(route: Route) {
        if (route == current) return
        backStack.addLast(route)
        current = route
    }

    fun selectTab(tab: BottomTab) {
        if (tab.route == current) return
        backStack.clear()
        backStack.addLast(tab.route)
        current = tab.route
    }

    /** Clears history and starts fresh from [route] (login/logout transitions). */
    fun resetTo(route: Route) {
        backStack.clear()
        backStack.addLast(route)
        current = route
    }

    fun popBack(): Boolean {
        if (backStack.size <= 1) return false
        backStack.removeLast()
        current = backStack.last()
        return true
    }
}
