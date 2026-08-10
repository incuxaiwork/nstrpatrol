package com.nstrpatrol.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nstrpatrol.app.data.AuthUser
import com.nstrpatrol.app.data.PatrolTimer
import com.nstrpatrol.app.data.db.DailyActivityEntity
import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.time.ActivitySummary
import com.nstrpatrol.app.time.TimeIntegrityState
import com.nstrpatrol.app.ui.components.ActivityRings
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.Background
import com.nstrpatrol.app.ui.theme.ErrorRed
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.LightForest
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.PaleForest
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun DashboardScreen(
    onOpenLogs: () -> Unit,
    onStartPatrol: () -> Unit,
    onQuickCapture: () -> Unit,
    onSos: () -> Unit,
    onTabSelected: (BottomTab) -> Unit,
    timeState: TimeIntegrityState,
    patrolTimer: PatrolTimer,
    dao: TelemetryDao,
    user: AuthUser?,
    currentPatrol: String?
) {
    var tick by remember { mutableStateOf(0L) }
    LaunchedEffect(patrolTimer.running.value) {
        if (patrolTimer.running.value) {
            while (true) {
                tick++
                kotlinx.coroutines.delay(1000)
            }
        }
    }
    val satTimeText = timeState.satelliteUtcMillis?.let {
        SimpleDateFormat("EEE, dd MMM yyyy · HH:mm:ss z", Locale.US).format(Date(it))
    }
    tick
    val durationText = if (patrolTimer.running.value) patrolTimer.elapsedFormatted() else "—"

    var dailyActivity by remember { mutableStateOf<DailyActivityEntity?>(null) }
    LaunchedEffect(tick, patrolTimer.running.value) {
        dailyActivity = ActivitySummary.computeForToday(dao)
    }

    val activity = dailyActivity

    val greetingName = user?.firstName ?: "Ranger"
    val greetingAvatar = user?.initial ?: "R"

    NstrScaffold(
        title = "Dashboard",
        subtitle = "Good day, $greetingName.",
        largeTitle = true,
        avatarText = greetingAvatar,
        activeTab = BottomTab.Home,
        onTabSelected = onTabSelected
    ) {
        Spacer(Modifier.height(16.dp))

        if (timeState.tamperDetected) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(ErrorRed.copy(alpha = 0.12f))
                    .border(1.dp, ErrorRed, RoundedCornerShape(8.dp))
                    .padding(horizontal = 14.dp, vertical = 12.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Filled.Warning,
                        contentDescription = null,
                        tint = ErrorRed,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(Modifier.size(8.dp))
                    Text(
                        text = "Time tampering detected",
                        color = ErrorRed,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    text = if (timeState.gnssTimeAvailable)
                        "Device clock differs from satellite time by ${timeState.divergenceSeconds}s."
                    else
                        "Device auto-time is off. Real time comes from GNSS satellites.",
                    color = TextPrimary,
                    fontSize = 12.sp
                )
                if (satTimeText != null) {
                    Spacer(Modifier.height(4.dp))
                    Text(text = "Satellite time: $satTimeText", color = TextSecondary, fontSize = 11.sp)
                }
            }
            Spacer(Modifier.height(12.dp))
        }

        // Assigned patrol banner
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(ForestGreen)
                .padding(horizontal = 16.dp, vertical = 14.dp)
        ) {
            Text(
                text = "ASSIGNED PATROL",
                color = PaleForest,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = currentPatrol ?: "No assigned patrol",
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(Modifier.height(12.dp))

        // Activity rings
        ActivityRings(
            steps = activity?.steps ?: 0,
            stepsGoal = 10000,
            moveMinutes = activity?.moveMinutes ?: 0,
            moveGoal = 60,
            calories = activity?.caloriesEstimate ?: 0.0,
            calGoal = 500
        )

        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatCard(
                label = "Distance",
                value = activity?.distanceMeters?.let {
                    if (it >= 1000) String.format("%.1f km", it / 1000) else String.format("%.0f m", it)
                } ?: "—",
                modifier = Modifier.weight(1f)
            )
            StatCard(
                label = "Patrol duration",
                value = durationText,
                modifier = Modifier.weight(1f)
            )
        }
        Spacer(Modifier.height(4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatCard(
                label = "Heart points",
                value = String.format("%.0f", activity?.heartPointsEstimate ?: 0.0),
                modifier = Modifier.weight(1f)
            )
            StatCard(
                label = "Patrols today",
                value = "${activity?.patrolCount ?: 0}",
                modifier = Modifier.weight(1f)
            )
        }

        Spacer(Modifier.height(12.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
                .background(Surface)
                .clickable(onClick = onOpenLogs)
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Filled.List,
                contentDescription = null,
                tint = ForestGreen,
                modifier = Modifier
                    .size(40.dp)
                    .background(LightForest, RoundedCornerShape(8.dp))
                    .padding(8.dp)
            )
            Spacer(Modifier.size(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Logs & alerts",
                    color = TextPrimary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "All field logs & alerts",
                    color = TextSecondary,
                    fontSize = 12.sp
                )
            }
        }

        Spacer(Modifier.height(24.dp))
        Text(
            text = "Quick actions",
            color = TextPrimary,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(Modifier.height(8.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            QuickActionCard(
                label = "Start Patrol",
                icon = Icons.Filled.PlayArrow,
                background = ForestGreen,
                iconTint = Color.White,
                labelColor = Color.White,
                onClick = onStartPatrol,
                modifier = Modifier.weight(1f)
            )
            QuickActionCard(
                label = "Sync Queue",
                icon = Icons.Filled.Refresh,
                background = Surface,
                iconTint = TextPrimary,
                labelColor = TextPrimary,
                onClick = { },
                modifier = Modifier.weight(1f)
            )
            QuickActionCard(
                label = "SOS",
                icon = Icons.Filled.Warning,
                background = ErrorRed,
                iconTint = Color.White,
                labelColor = Color.White,
                onClick = onSos,
                modifier = Modifier.weight(1f)
            )
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            QuickActionCard(
                label = "Quick Capture",
                icon = Icons.Filled.Home,
                background = Surface,
                iconTint = TextPrimary,
                labelColor = TextPrimary,
                onClick = onQuickCapture,
                modifier = Modifier.weight(1f)
            )
            QuickActionCard(
                label = "Future",
                icon = null,
                background = Surface,
                iconTint = TextSecondary,
                labelColor = TextSecondary,
                onClick = { },
                modifier = Modifier.weight(1f)
            )
            QuickActionCard(
                label = "Future",
                icon = null,
                background = Surface,
                iconTint = TextSecondary,
                labelColor = TextSecondary,
                onClick = { },
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun StatCard(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
            .background(Surface)
            .padding(horizontal = 12.dp, vertical = 12.dp)
    ) {
        Text(text = label, color = TextSecondary, fontSize = 12.sp)
        Spacer(Modifier.height(4.dp))
        Text(
            text = value,
            color = ForestGreen,
            fontSize = 21.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun QuickActionCard(
    label: String,
    icon: ImageVector?,
    background: Color,
    iconTint: Color,
    labelColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .height(72.dp)
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
            .background(background)
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp, horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.weight(1f))
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = iconTint,
                modifier = Modifier.size(22.dp)
            )
        }
        Spacer(Modifier.height(6.dp))
        Text(
            text = label,
            color = labelColor,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(4.dp))
    }
}
