package com.nstrpatrol.app.ui.screens

import com.nstrpatrol.app.R

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.nstrpatrol.app.data.IndiaTime
import com.nstrpatrol.app.data.SyncManager
import com.nstrpatrol.app.data.db.PatrolPointEntity
import com.nstrpatrol.app.data.db.PatrolSessionEntity
import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.data.map.BackendApiClient
import com.nstrpatrol.app.ui.components.NstrScaffold
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.ChipCompleted
import com.nstrpatrol.app.ui.theme.ChipInProgress
import com.nstrpatrol.app.ui.theme.ChipScheduled
import com.nstrpatrol.app.ui.theme.ErrorRed
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.OutlineSoft
import com.nstrpatrol.app.ui.theme.StatusCompleted
import com.nstrpatrol.app.ui.theme.StatusInProgress
import com.nstrpatrol.app.ui.theme.StatusScheduled
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Patrol history. Fully local-first: the list is read straight from the
 * device's Room DB (every session, synced or pending) so it is populated
 * immediately without any network call. "Refresh" pushes the device's own
 * pending data to the server (sync is a device upload, never a re-fetch), and
 * "Pull from Cloud" is the only explicit action that downloads other devices'
 * patrols into the local DB.
 */
@Composable
fun AllPatrolsScreen(
    onTabSelected: (BottomTab) -> Unit,
    onOpenPatrol: (String) -> Unit,
    dao: TelemetryDao,
    api: BackendApiClient,
    deviceId: String? = null
) {
    var selectedFilter by remember { mutableStateOf("All") }
    var sessions by remember { mutableStateOf(emptyList<PatrolSessionEntity>()) }
    var syncing by remember { mutableStateOf(false) }
    var pulling by remember { mutableStateOf(false) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        dao.allPatrolSessions().collect { sessions = it }
    }

    fun refresh() {
        scope.launch {
            syncing = true
            statusMessage = null
            try {
                val summary = withContext(Dispatchers.IO) { SyncManager.syncNow(dao, api, deviceId) }
                statusMessage = when {
                    summary.error != null -> "Sync failed: ${summary.error}"
                    summary.syncedItems > 0 -> "Synced ${summary.syncedItems} items to server"
                    else -> "Device is in sync"
                }
            } catch (e: Exception) {
                statusMessage = "Sync failed: ${e.message}"
            } finally {
                syncing = false
            }
        }
    }

    fun pullFromCloud() {
        scope.launch {
            pulling = true
            statusMessage = null
            try {
                val count = withContext(Dispatchers.IO) { SyncManager.pullFromBackend(dao, api) }
                statusMessage = if (count > 0) "Pulled $count patrols down to this device"
                else "Cloud is up to date"
            } catch (e: Exception) {
                statusMessage = "Pull failed: ${e.message}"
            } finally {
                pulling = false
            }
        }
    }

    val filtered = when (selectedFilter) {
        "Active" -> sessions.filter { it.status == "ACTIVE" || it.status == "IN PROGRESS" }
        "Completed" -> sessions.filter { it.status == "COMPLETED" }
        else -> sessions
    }

    val filterDefs = listOf(
        "All" to stringResource(R.string.all_patrols_filter_all),
        "Active" to stringResource(R.string.all_patrols_filter_active),
        "Completed" to stringResource(R.string.all_patrols_filter_completed)
    )
    val allCount = "${sessions.size}"
    val activeCount = "${sessions.count { it.status == "ACTIVE" || it.status == "IN PROGRESS" }}"
    val completedCount = "${sessions.count { it.status == "COMPLETED" }}"

    NstrScaffold(
        title = stringResource(R.string.all_patrols_title),
        subtitle = when {
            pulling -> "Pulling from cloud..."
            syncing -> stringResource(R.string.common_syncing)
            else -> stringResource(R.string.all_patrols_subtitle)
        },
        activeTab = BottomTab.Patrol,
        onTabSelected = onTabSelected
    ) {
        Spacer(Modifier.height(12.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(
                onClick = { refresh() },
                enabled = !syncing && !pulling,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = ForestGreen)
            ) {
                Text(
                    text = if (syncing) "Refreshing..." else "Refresh",
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Button(
                onClick = { pullFromCloud() },
                enabled = !syncing && !pulling,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1565C0))
            ) {
                Text(
                    text = if (pulling) "Pulling..." else "Pull from Cloud",
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }

        val message = statusMessage
        if (message != null) {
            Spacer(Modifier.height(4.dp))
            Text(
                text = message,
                color = if (message.contains("failed", true)) ErrorRed else ForestGreen,
                fontSize = 12.sp
            )
        }

        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            filterDefs.forEach { (key, label) ->
                FilterChip(
                    label = label,
                    count = when (key) {
                        "All" -> allCount
                        "Active" -> activeCount
                        else -> completedCount
                    },
                    selected = key == selectedFilter,
                    onClick = { selectedFilter = key }
                )
            }
        }

        Spacer(Modifier.height(16.dp))

        if (filtered.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 32.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(stringResource(R.string.all_patrols_no_patrols), color = TextSecondary, fontSize = 14.sp)
            }
        }

        filtered.forEach { session ->
            SessionPatrolCard(
                session = session,
                dao = dao,
                onClick = { onOpenPatrol(session.patrolId) },
                modifier = Modifier.padding(bottom = 12.dp)
            )
        }
    }
}

@Composable
private fun SessionPatrolCard(
    session: PatrolSessionEntity,
    dao: TelemetryDao,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val (chipColor, chipBg) = when (session.status) {
        "ACTIVE" -> StatusInProgress to ChipInProgress
        "COMPLETED" -> StatusCompleted to ChipCompleted
        else -> StatusScheduled to ChipScheduled
    }
    var displayDistance by remember(session.patrolId, session.totalDistanceMeters, session.pointCount) {
        mutableStateOf(session.totalDistanceMeters)
    }
    LaunchedEffect(session.patrolId, session.totalDistanceMeters, session.pointCount) {
        // Live fallback: stored totalDistanceMeters is 0 for ACTIVE patrols and for
        // stale finalized sessions (pointCount only). Compute from actual GPS points
        // so the card never shows 0 m when a track exists.
        val needsLive = session.status == "ACTIVE" || session.totalDistanceMeters == 0.0
        if (needsLive) {
            val points = withContext(Dispatchers.IO) { dao.patrolPointsOrdered(session.patrolId) }
            val live = haversineDistance(points)
            if (live > 0) displayDistance = maxOf(displayDistance, live)
        }
    }
    val distText = if (displayDistance >= 1000)
        stringResource(R.string.patrol_km_covered, displayDistance / 1000) else
        stringResource(R.string.patrol_m_covered, displayDistance)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(12.dp))
            .background(Surface)
            .clickable(onClick = onClick)
            .padding(16.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = session.patrolType ?: session.beat ?: stringResource(R.string.patrol_default),
                color = TextPrimary,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f)
            )
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .border(1.dp, chipColor.copy(alpha = 0.35f), RoundedCornerShape(4.dp))
                    .background(chipBg)
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            ) {
                Text(text = session.status, color = chipColor, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(6.dp))
        Row {
            Text(
                text = when {
                    session.endTime != null && session.endTime > session.startTime ->
                        IndiaTime.card(session.startTime) + "  →  " + IndiaTime.card(session.endTime)
                    else -> IndiaTime.card(session.startTime)
                },
                color = TextSecondary,
                fontSize = 12.sp,
                modifier = Modifier.weight(1f)
            )
            if (session.syncStatus == "PENDING") {
                Text(
                    text = "pending sync",
                    color = ForestGreen,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Row {
            Text(
                text = distText,
                color = TextPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f)
            )
            val steps = if (session.totalSteps > 0) session.totalSteps
            else if (displayDistance > 0) (displayDistance / 0.75).toInt()
            else 0
            if (steps > 0) {
                Text(text = stringResource(R.string.patrol_steps, steps), color = TextSecondary, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun FilterChip(label: String, count: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(18.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(18.dp))
            .background(if (selected) ForestGreen else Surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(text = label, color = if (selected) Color.White else TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.width(6.dp))
        Box(
            modifier = Modifier.size(20.dp).background(if (selected) Color.White else Color(0xFFE0E0E0), RoundedCornerShape(10.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text(text = count, color = if (selected) ForestGreen else TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
    }
}

private const val EARTH_RADIUS_M = 6_371_000.0

private fun haversineDistance(points: List<PatrolPointEntity>): Double {
    if (points.size < 2) return 0.0
    var total = 0.0
    for (i in 1 until points.size) {
        val p1 = points[i - 1]
        val p2 = points[i]
        val dist = singleHaversine(p1.latitude, p1.longitude, p2.latitude, p2.longitude)
        val dt = p2.timestamp - p1.timestamp
        val speedKmh = if (dt > 0) (dist / 1000.0) / (dt / 3_600_000.0) else 0.0
        if (dist < 3.0 && speedKmh < 1.0) continue
        if (dist < 5.0 && speedKmh < 0.5) continue
        val acc = minOf(p1.accuracy ?: Float.MAX_VALUE, p2.accuracy ?: Float.MAX_VALUE).toDouble()
        if (dist < acc * 0.5 && speedKmh < 2.0 && dist < 8.0) continue
        total += dist
    }
    return total
}

private fun singleHaversine(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val dLat = Math.toRadians(lat2 - lat1)
    val dLon = Math.toRadians(lon2 - lon1)
    val a = sin(dLat / 2).pow(2) + cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2)
    val c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return EARTH_RADIUS_M * c
}