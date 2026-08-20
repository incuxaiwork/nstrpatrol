package com.nstrpatrol.app.ui.screens

import com.nstrpatrol.app.R

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import com.nstrpatrol.app.data.SyncController
import com.nstrpatrol.app.data.SyncController.SyncState
import com.nstrpatrol.app.data.db.IncidentEntity
import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.data.map.BackendApiClient
import com.nstrpatrol.app.time.TimeIntegrityState
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.components.SectionHeader
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.ErrorRed
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary
import com.nstrpatrol.app.ui.theme.WarningAmber
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private data class LogItem(val title: String, val time: String, val level: String)
private data class SyncTotals(val total: Int, val synced: Int)

@Composable
fun LogsScreen(
    onTabSelected: (BottomTab) -> Unit,
    timeState: TimeIntegrityState,
    dao: TelemetryDao,
    api: BackendApiClient
) {
    var incidents by remember { mutableStateOf(emptyList<IncidentEntity>()) }
    var syncTotals by remember { mutableStateOf(SyncTotals(0, 0)) }
    val syncState by SyncController.state.collectAsState()

    suspend fun loadTotals(): SyncTotals = withContext(Dispatchers.IO) {
        val sT = dao.countSessions(); val sS = dao.countSyncedSessions()
        val pT = dao.countPoints(); val pS = dao.countSyncedPoints()
        val rT = dao.countReadings(); val rS = dao.countSyncedReadings()
        val iT = dao.countIncidents(); val iS = dao.countSyncedIncidents()
        SyncTotals(sT + pT + rT + iT, sS + pS + rS + iS)
    }

    fun triggerSync() {
        SyncController.sync(dao, api)
    }

    // Refresh the local totals/incident list once a sync finishes.
    LaunchedEffect(syncState) {
        if (syncState is SyncState.Success || syncState is SyncState.Failed) {
            incidents = withContext(Dispatchers.IO) { dao.allIncidents() }
            syncTotals = loadTotals()
        }
    }

    LaunchedEffect(Unit) {
        incidents = withContext(Dispatchers.IO) { dao.allIncidents() }
        syncTotals = loadTotals()
    }

    val totalLogs = incidents.size
    val openAlerts = incidents.count { it.status != "RESOLVED" && it.status != "REJECTED" } +
        if (timeState.tamperDetected) 1 else 0
    val syncedPct = if (syncTotals.total == 0) 0
    else (syncTotals.synced * 100 / syncTotals.total)

    NstrScaffold(
        title = stringResource(R.string.logs_title),
        subtitle = stringResource(R.string.logs_subtitle),
        activeTab = BottomTab.Patrol,
        onTabSelected = onTabSelected
    ) {
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            LogStat(value = "$totalLogs", label = stringResource(R.string.logs_total), valueColor = ForestGreen, modifier = Modifier.weight(1f))
            LogStat(
                value = "$openAlerts",
                label = stringResource(R.string.logs_open_alerts),
                valueColor = ErrorRed,
                modifier = Modifier.weight(1f)
            )
            LogStat(value = "$syncedPct%", label = stringResource(R.string.logs_synced), valueColor = ForestGreen, modifier = Modifier.weight(1f))
        }

        Spacer(Modifier.height(12.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (syncState is SyncState.Syncing) {
                LinearProgressIndicator(
                    modifier = Modifier
                        .weight(1f)
                        .height(6.dp)
                        .clip(RoundedCornerShape(3.dp)),
                    progress = { (syncState as SyncState.Syncing).progress.coerceIn(0f, 1f) },
                    color = ForestGreen,
                    trackColor = ForestGreen.copy(alpha = 0.15f)
                )
                Spacer(Modifier.width(12.dp))
            }
            Button(
                onClick = { triggerSync() },
                enabled = syncState !is SyncState.Syncing,
                colors = ButtonDefaults.buttonColors(containerColor = ForestGreen)
            ) {
                Text(
                    text = if (syncState is SyncState.Syncing) {
                        "Syncing… ${((syncState as SyncState.Syncing).progress * 100).toInt()}%"
                    } else "Sync now",
                    color = Color.White,
                    fontWeight = FontWeight.Bold
                )
            }
        }
        val syncLine = when (val s = syncState) {
            is SyncState.Failed -> "Sync failed: ${s.message}"
            is SyncState.Success -> "Sync complete — ${s.synced} record(s) uploaded"
            else -> ""
        }
        if (syncLine.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(
                text = syncLine,
                color = if (syncState is SyncState.Failed) ErrorRed else ForestGreen,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium
            )
        }

        Spacer(Modifier.height(24.dp))
        SectionHeader(text = stringResource(R.string.logs_recent_activity))
        Spacer(Modifier.height(8.dp))

        val items = buildList {
            if (timeState.tamperDetected) {
                val stamp = IndiaTime.format("HH:mm", System.currentTimeMillis())
                add(
                    LogItem(
                        title = if (timeState.gnssTimeAvailable)
                            stringResource(R.string.logs_tamper_divergence, timeState.divergenceSeconds.toString())
                        else
                            stringResource(R.string.logs_tamper_autotime),
                        time = "Now $stamp",
                        level = "alert"
                    )
                )
            }
            incidents.forEach { inc ->
                val level = when (inc.severity.uppercase()) {
                    "HIGH" -> "alert"
                    "MEDIUM" -> "warn"
                    else -> "info"
                }
                add(
                    LogItem(
                        title = "${categoryLabel(incidentCategory(inc.type))}: ${inc.title}",
                        time = IndiaTime.card(inc.occurredAt),
                        level = level
                    )
                )
            }
        }

        if (items.isEmpty()) {
            Text(
                text = stringResource(R.string.logs_no_logs),
                color = TextSecondary,
                fontSize = 13.sp,
                modifier = Modifier.padding(vertical = 16.dp)
            )
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
                .background(Surface)
        ) {
            items.forEachIndexed { index, entry ->
                if (index > 0) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(1.dp)
                            .background(Color(0xFFEEEEEE))
                    )
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp)
                        .padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        Modifier
                            .size(10.dp)
                            .background(dotColor(entry.level), CircleShape)
                    )
                    Spacer(Modifier.size(12.dp))
                    Text(
                        text = entry.title,
                        color = TextPrimary,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(Modifier.size(8.dp))
                    Text(
                        text = entry.time,
                        color = TextSecondary,
                        fontSize = 12.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun LogStat(value: String, label: String, valueColor: Color, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
            .background(Surface)
            .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = value,
            color = valueColor,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = label,
            color = TextSecondary,
            fontSize = 11.sp
        )
    }
}

private fun dotColor(level: String): Color = when (level) {
    "alert" -> ErrorRed
    "warn" -> WarningAmber
    else -> ForestGreen
}


