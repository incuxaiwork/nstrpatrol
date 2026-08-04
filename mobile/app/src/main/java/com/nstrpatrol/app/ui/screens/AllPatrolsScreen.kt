package com.nstrpatrol.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import com.nstrpatrol.app.data.Patrols
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.ChipCompleted
import com.nstrpatrol.app.ui.theme.ChipInProgress
import com.nstrpatrol.app.ui.theme.ChipScheduled
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.OutlineSoft
import com.nstrpatrol.app.ui.theme.StatusCompleted
import com.nstrpatrol.app.ui.theme.StatusInProgress
import com.nstrpatrol.app.ui.theme.StatusScheduled
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary

@Composable
fun AllPatrolsScreen(onTabSelected: (BottomTab) -> Unit) {
    var selectedFilter by remember { mutableStateOf("All") }
    val filters = listOf(
        "All" to "12",
        "Active" to "1",
        "Completed" to "9",
        "Scheduled" to "2"
    )

    NstrScaffold(
        title = "All Patrols",
        subtitle = "Ranger station log records",
        activeTab = BottomTab.Patrol,
        onTabSelected = onTabSelected
    ) {
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
            filters.forEach { (label, count) ->
                FilterChip(
                    label = label,
                    count = count,
                    selected = label == selectedFilter,
                    onClick = { selectedFilter = label }
                )
            }
        }

        Spacer(Modifier.height(16.dp))
        Patrols.list.forEach { patrol ->
            PatrolCard(
                patrol = patrol,
                modifier = Modifier.padding(bottom = 12.dp)
            )
        }
    }
}

@Composable
private fun FilterChip(
    label: String,
    count: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(18.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(18.dp))
            .background(if (selected) ForestGreen else Surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            color = if (selected) Color.White else TextPrimary,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(Modifier.width(6.dp))
        Box(
            modifier = Modifier
                .size(20.dp)
                .background(
                    if (selected) Color.White else Color(0xFFE0E0E0),
                    RoundedCornerShape(10.dp)
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = count,
                color = if (selected) ForestGreen else TextSecondary,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun PatrolCard(patrol: Patrols.Patrol, modifier: Modifier = Modifier) {
    val (chipColor, chipBg, fillColor) = statusStyle(patrol.status)
    val progress = progressFraction(patrol.target)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(12.dp))
            .background(Surface)
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
                Text(
                    text = patrol.status,
                    color = chipColor,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
        Spacer(Modifier.height(6.dp))
        Row {
            Text(
                text = patrol.ranger,
                color = TextSecondary,
                fontSize = 13.sp,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = patrol.whenText,
                color = TextSecondary,
                fontSize = 12.sp
            )
        }
        Spacer(Modifier.height(8.dp))
        Row {
            Text(
                text = patrol.distance,
                color = TextPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = patrol.target,
                color = TextSecondary,
                fontSize = 12.sp
            )
        }
        Spacer(Modifier.height(10.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(OutlineSoft)
        ) {
            if (progress > 0f) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(progress)
                        .height(8.dp)
                        .background(fillColor, RoundedCornerShape(4.dp))
                )
            }
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
