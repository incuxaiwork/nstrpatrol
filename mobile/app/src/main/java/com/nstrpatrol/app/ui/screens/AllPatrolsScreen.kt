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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nstrpatrol.app.data.AuthUser
import com.nstrpatrol.app.data.map.BackendApiClient
import com.nstrpatrol.app.data.db.PatrolSessionEntity
import com.nstrpatrol.app.data.db.PatrolPointEntity
import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.data.SyncManager
import com.nstrpatrol.app.i18n.SupportedLanguages
import com.nstrpatrol.app.ui.components.DangerButton
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.components.SectionHeader
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.OutlineSoft
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary
import com.nstrpatrol.app.ui.theme.ChipCompleted
import com.nstrpatrol.app.ui.theme.ChipInProgress
import com.nstrpatrol.app.ui.theme.ChipScheduled
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.ErrorRed
import com.nstrpatrol.app.ui.theme.StatusCompleted
import com.nstrpatrol.app.ui.theme.StatusInProgress
import com.nstrpatrol.app.ui.theme.StatusScheduled

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

private const val TAG = "AllPatrolsScreen"

@Composable
fun AllPatrolsScreen(
    onTabSelected: (BottomTab) -> Unit,
    onOpenPatrol: (String) -> Unit,
    dao: TelemetryDao,
    api: BackendApiClient
) {
    var selectedFilter by remember { mutableStateOf("All") }
    var sessions by remember { mutableStateOf(emptyList<PatrolSessionEntity>()) }
    var backendEntries by remember { mutableStateOf(emptyList<PatrolEntry>()) }
    var loading by remember { mutableStateOf(false) }
    var pulling by remember { mutableStateOf(false) }
    var pullMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        kotlinx.coroutines.flow.combine(
            dao.allPatrolSessions(),
            kotlinx.coroutines.flow.flowOf(Unit)
        ) { list, _ -> list }.collect { sessions = it }
    }

    fun refreshBackend() {
        scope.launch {
            loading = true
            try {
                val arr = withContext(Dispatchers.IO) { api.getJsonArray("/api/patrols") }
                if (arr != null) {
                    Log.d(TAG, "Fetched ${arr.length()} patrols from backend")
                    backendEntries = parsePatrols(arr)
                } else {
                    Log.w(TAG, "Backend returned null – offline or auth error")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to fetch patrols", e)
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) { refreshBackend() }

    fun pullFromCloud() {
        scope.launch {
            pulling = true
            pullMessage = null
            try {
                val count = withContext(Dispatchers.IO) { SyncManager.pullFromBackend(dao, api) }
                pullMessage = "Pulled $count patrols from cloud"
                refreshBackend()
            } catch (e: Exception) {
                Log.e(TAG, "Pull from cloud failed", e)
                pullMessage = "Pull failed: ${e.message}"
            } finally {
                pulling = false
            }
        }
    }

    val localPending = sessions.filter { it.syncStatus == "PENDING" }
    val allEntries: List<DisplayPatrol> =
        localPending.map { DisplayPatrol(it.patrolId, it.patrolType ?: it.beat ?: "Patrol", it.status, it.teamLeader, formatMillis(it.startTime), DisplaySource.Local) } +
            backendEntries.map { DisplayPatrol(it.id, it.patrol.name, it.patrol.status, it.patrol.ranger, it.patrol.whenText, DisplaySource.Backend) }

    val filtered = when (selectedFilter) {
        "Active" -> allEntries.filter { it.status == "ACTIVE" || it.status == "IN PROGRESS" }
        "Completed" -> allEntries.filter { it.status == "COMPLETED" }
        else -> allEntries
    }

    val filterDefs = listOf(
        "All" to stringResource(R.string.all_patrols_filter_all),
        "Active" to stringResource(R.string.all_patrols_filter_active),
        "Completed" to stringResource(R.string.all_patrols_filter_completed)
    )
    val allCount = "${allEntries.size}"
    val activeCount = "${allEntries.count { it.status == "ACTIVE" || it.status == "IN PROGRESS" }}"
    val completedCount = "${allEntries.count { it.status == "COMPLETED" }}"

    NstrScaffold(
        title = stringResource(R.string.all_patrols_title),
        subtitle = when {
            pulling -> "Pulling from cloud..."
            loading -> stringResource(R.string.common_syncing)
            else -> stringResource(R.string.all_patrols_subtitle)
        },
        activeTab = BottomTab.Patrol,
        onTabSelected = onTabSelected
    ) {
        Spacer(Modifier.height(12.dp))

        // Pull from cloud button
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            androidx.compose.material3.Button(
                onClick = { refreshBackend() },
                enabled = !loading && !pulling,
                modifier = Modifier.weight(1f),
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                    containerColor = ForestGreen
                )
            ) {
                Text(
                    text = if (loading) "Refreshing..." else "Refresh",
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
            androidx.compose.material3.Button(
                onClick = { pullFromCloud() },
                enabled = !loading && !pulling,
                modifier = Modifier.weight(1f),
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF1565C0)
                )
            ) {
                Text(
                    text = if (pulling) "Pulling..." else "Pull from Cloud",
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }

        if (pullMessage != null) {
            Spacer(Modifier.height(4.dp))
            Text(
                text = pullMessage ?: "",
                color = if (pullMessage!!.contains("failed", true)) ErrorRed else ForestGreen,
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

        filtered.forEach { entry ->
            when (entry.source) {
                DisplaySource.Local -> {
                    val session = localPending.first { it.patrolId == entry.id }
                    SessionPatrolCard(
                        session = session,
                        onClick = { onOpenPatrol(session.patrolId) },
                        modifier = Modifier.padding(bottom = 12.dp)
                    )
                }
                DisplaySource.Backend -> {
                    val be = backendEntries.first { it.id == entry.id }
                    BackendPatrolCard(
                        patrol = be.patrol,
                        onClick = { onOpenPatrol(be.id) },
                        modifier = Modifier.padding(bottom = 12.dp)
                    )
                }
            }
        }
    }
}

private enum class DisplaySource { Local, Backend }
private data class DisplayPatrol(
    val id: String,
    val title: String,
    val status: String,
    val ranger: String?,
    val whenText: String,
    val source: DisplaySource
)
private data class Patrol(
    val name: String,
    val status: String,
    val ranger: String,
    val whenText: String,
    val distance: String,
    val target: String
)

private data class PatrolEntry(val id: String, val patrol: Patrol)

private fun parsePatrols(arr: JSONArray): List<PatrolEntry> {
    val out = mutableListOf<PatrolEntry>()
    for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i) ?: continue
        val id = o.optString("id")
        if (id.isEmpty()) continue
        val name = o.optString("name").ifEmpty { o.optString("type") }.ifEmpty { "Patrol" }
        val status = when (o.optString("status")) {
            "ACTIVE" -> "IN PROGRESS"
            "COMPLETED" -> "COMPLETED"
            else -> "SCHEDULED"
        }
        val user = o.optJSONObject("user")
        val ranger = user?.optString("fullName")?.takeIf { it.isNotEmpty() } ?: "—"
        val whenText = formatIso(o.optString("startedAt"))
        out.add(PatrolEntry(id, Patrol(name, status, ranger, whenText, "—", "")))
    }
    return out
}

@Composable
private fun SessionPatrolCard(
    session: PatrolSessionEntity,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val (chipColor, chipBg) = when (session.status) {
        "ACTIVE" -> StatusInProgress to ChipInProgress
        "COMPLETED" -> StatusCompleted to ChipCompleted
        else -> StatusScheduled to ChipScheduled
    }
    val dateFormat = remember { SimpleDateFormat("dd MMM, HH:mm", Locale.US) }
    val distText = if (session.totalDistanceMeters >= 1000)
        stringResource(R.string.patrol_km_covered, session.totalDistanceMeters / 1000) else
        stringResource(R.string.patrol_m_covered, session.totalDistanceMeters)

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
                text = session.teamLeader ?: "—",
                color = TextSecondary,
                fontSize = 13.sp,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = dateFormat.format(Date(session.startTime)),
                color = TextSecondary,
                fontSize = 12.sp
            )
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
            if (session.totalSteps > 0) {
                Text(text = stringResource(R.string.patrol_steps, session.totalSteps), color = TextSecondary, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun BackendPatrolCard(
    patrol: Patrol,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null
) {
    val (chipColor, chipBg, fillColor) = statusStyle(patrol.status)
    val progress = progressFraction(patrol.target)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(12.dp))
            .background(Surface)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(16.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = patrol.name,
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
                Text(text = patrol.status, color = chipColor, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(6.dp))
        Row {
            Text(text = patrol.ranger, color = TextSecondary, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Text(text = patrol.whenText, color = TextSecondary, fontSize = 12.sp)
        }
        Spacer(Modifier.height(8.dp))
        Row {
            Text(text = patrol.distance, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text(text = patrol.target, color = TextSecondary, fontSize = 12.sp)
        }
        Spacer(Modifier.height(10.dp))
        Box(
            modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(OutlineSoft)
        ) {
            if (progress > 0f) {
                Box(
                    modifier = Modifier.fillMaxWidth(progress).height(8.dp).background(fillColor, RoundedCornerShape(4.dp))
                )
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

private fun statusStyle(status: String): Triple<Color, Color, Color> = when (status) {
    "IN PROGRESS" -> Triple(StatusInProgress, ChipInProgress, StatusInProgress)
    "SCHEDULED" -> Triple(StatusScheduled, ChipScheduled, StatusScheduled)
    else -> Triple(StatusCompleted, ChipCompleted, StatusCompleted)
}

private fun progressFraction(target: String): Float {
    val match = Regex("\\((\\d+)%\\)").find(target) ?: return 0f
    return match.groupValues[1].toFloat() / 100f
}

private fun formatIso(iso: String): String {
    if (iso.isEmpty()) return "—"
    val sdf = SimpleDateFormat("dd MMM, HH:mm", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
    return runCatching { sdf.format(Date(parseIsoMillis(iso))) }.getOrDefault(iso.take(16))
}

private fun formatMillis(millis: Long): String {
    val sdf = SimpleDateFormat("dd MMM, HH:mm", Locale.US)
    return sdf.format(Date(millis))
}

private fun parseIsoMillis(iso: String): Long {
    val candidates = listOf(
        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
        "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
        "yyyy-MM-dd'T'HH:mm:ssXXX"
    )
    for (pattern in candidates) {
        runCatching {
            val sdf = SimpleDateFormat(pattern, Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
            return sdf.parse(iso)!!.time
        }
    }
    return System.currentTimeMillis()
}
