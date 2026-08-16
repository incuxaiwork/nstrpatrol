package com.nstrpatrol.app.ui.navigation

import com.nstrpatrol.app.R

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

    /** Read-only view of an already-reported incident opened from the Reports page. */
    data class IncidentDetail(val incidentId: String) : Route("incident_detail")

    /** Full-screen camera; [slot] is the PhotoStore key for the requesting form. */
    data class Camera(val slot: String) : Route("camera")

    /** Complete patrol report for a finished or in-progress patrol. */
    data class PatrolReport(val patrolId: String) : Route("patrol_report")

    /** Stable identifier used to persist the route across configuration changes. */
    val key: String
        get() = when (this) {
            is IncidentDetail -> "$route:$incidentId"
            is Camera -> "$route:$slot"
            is PatrolReport -> "$route:$patrolId"
            else -> route
        }

    companion object {
        /** Rebuilds a route from its [key]; returns null for unknown keys. */
        fun fromKey(key: String): Route? {
            val parts = key.split(":", limit = 2)
            return when (parts[0]) {
                "login" -> Login
                "dashboard" -> Dashboard
                "maps" -> Maps
                "all_patrols" -> AllPatrols
                "reports" -> Reports
                "settings" -> Settings
                "logs" -> Logs
                "patrol_start" -> PatrolStart
                "human_impact" -> HumanImpact
                "animal_mortality" -> AnimalMortality
                "sighting" -> Sighting
                "water_source" -> WaterSource
                "quick_capture" -> QuickCapture
                "sos" -> Sos
                "gps_diagnostics" -> GpsDiagnostics
                "incident_detail" -> if (parts.size == 2) IncidentDetail(parts[1]) else null
                "camera" -> if (parts.size == 2) Camera(parts[1]) else null
                "patrol_report" -> if (parts.size == 2) PatrolReport(parts[1]) else null
                else -> null
            }
        }
    }
}

/** Bottom navigation tabs. */
enum class BottomTab(
    val labelRes: Int,
    val route: Route
) {
    Home(R.string.nav_home, Route.Dashboard),
    Maps(R.string.nav_maps, Route.Maps),
    Patrol(R.string.nav_patrol, Route.AllPatrols),
    Reports(R.string.nav_reports, Route.Reports),
    Settings(R.string.nav_settings, Route.Settings)
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

    /** Keys of the full back stack, in order (root first). */
    val backStackKeys: List<String> get() = backStack.map { it.key }

    companion object {
        /** Rebuilds navigation state from persisted [keys] (root first). */
        fun fromKeys(keys: List<String>): NstrNavState {
            val routes = keys.mapNotNull { Route.fromKey(it) }
            if (routes.isEmpty()) return NstrNavState()
            val nav = NstrNavState(routes.first())
            routes.drop(1).forEach { nav.navigateTo(it) }
            return nav
        }
    }
}
