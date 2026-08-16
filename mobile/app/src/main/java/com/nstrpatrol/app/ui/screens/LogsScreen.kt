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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.nstrpatrol.app.data.db.IncidentEntity
import com.nstrpatrol.app.data.db.TelemetryDao
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
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private data class LogItem(val title: String, val time: String, val level: String)

@Composable
fun LogsScreen(
    onTabSelected: (BottomTab) -> Unit,
    timeState: TimeIntegrityState,
    dao: TelemetryDao
) {
    var incidents by remember { mutableStateOf(emptyList<IncidentEntity>()) }
    LaunchedEffect(Unit) {
        incidents = withContext(Dispatchers.IO) { dao.allIncidents() }
    }

    val totalLogs = incidents.size
    val openAlerts = incidents.count { it.status != "RESOLVED" && it.status != "REJECTED" } +
        if (timeState.tamperDetected) 1 else 0
    val syncedPct = if (incidents.isEmpty()) 100
    else (incidents.count { it.syncStatus == "SYNCED" } * 100 / incidents.size)

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

        Spacer(Modifier.height(24.dp))
        SectionHeader(text = stringResource(R.string.logs_recent_activity))
        Spacer(Modifier.height(8.dp))

        val items = buildList {
            if (timeState.tamperDetected) {
                val stamp = SimpleDateFormat("HH:mm", Locale.US).format(Date())
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
                        time = SimpleDateFormat("dd MMM, HH:mm", Locale.US).format(Date(inc.occurredAt)),
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
