package com.nstrpatrol.app.ui.screens

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nstrpatrol.app.data.ReportedIncidents
import com.nstrpatrol.app.data.ReportedIncidents.IncidentStatus
import com.nstrpatrol.app.ui.components.AutoCapturedPanel
import com.nstrpatrol.app.ui.components.DetailPanel
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.components.SectionHeader
import com.nstrpatrol.app.ui.components.StatusChip
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.ChipRejected
import com.nstrpatrol.app.ui.theme.ChipResolved
import com.nstrpatrol.app.ui.theme.ChipSubmitted
import com.nstrpatrol.app.ui.theme.ChipVerified
import com.nstrpatrol.app.ui.theme.IncidentRejected
import com.nstrpatrol.app.ui.theme.IncidentResolved
import com.nstrpatrol.app.ui.theme.IncidentSubmitted
import com.nstrpatrol.app.ui.theme.IncidentVerified
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.SeverityHigh
import com.nstrpatrol.app.ui.theme.SeverityLow
import com.nstrpatrol.app.ui.theme.SeverityMedium
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary

/**
 * Full read-only report for an already-reported incident, opened from the
 * "Reported incidents" list on the Reports page.
 */
@Composable
fun IncidentDetailScreen(
    incidentId: String,
    onBack: () -> Unit,
    onTabSelected: (BottomTab) -> Unit
) {
    val incident = ReportedIncidents.list.find { it.id == incidentId }

    NstrScaffold(
        title = incident?.category ?: "Report",
        subtitle = "Report details",
        onBack = onBack,
        activeTab = BottomTab.Reports,
        onTabSelected = onTabSelected
    ) {
        if (incident == null) {
            Spacer(Modifier.height(16.dp))
            Text(text = "Incident not found", color = TextSecondary, fontSize = 14.sp)
            return@NstrScaffold
        }

        val (chipColor, chipBg) = incidentStatusStyle(incident.status)
        val severityColor = when (incident.severity) {
            "High" -> SeverityHigh
            "Medium" -> SeverityMedium
            else -> SeverityLow
        }

        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatusChip(
                label = incident.status.label,
                chipColor = chipColor,
                chipBackground = chipBg
            )
            StatusChip(
                label = incident.severity,
                chipColor = severityColor,
                chipBackground = severityColor.copy(alpha = 0.12f)
            )
        }

        Spacer(Modifier.height(20.dp))
        SectionHeader(text = "Incident details", color = TextPrimary)
        Spacer(Modifier.height(8.dp))
        DetailPanel(
            rows = listOf(
                "Report ID" to incident.id,
                "Type" to incident.type,
                "Date & time" to incident.date,
                "Beat" to incident.beat,
                "Severity" to incident.severity
            )
        )

        Spacer(Modifier.height(16.dp))
        SectionHeader(text = "Remarks", color = TextPrimary)
        Spacer(Modifier.height(8.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
                .background(Surface)
                .padding(14.dp)
        ) {
            Text(
                text = incident.remarks,
                color = TextPrimary,
                fontSize = 14.sp,
                lineHeight = 20.sp
            )
        }

        Spacer(Modifier.height(16.dp))
        SectionHeader(text = "Captured", color = TextPrimary)
        Spacer(Modifier.height(8.dp))
        AutoCapturedPanel()

        Spacer(Modifier.height(24.dp))
    }
}

private fun incidentStatusStyle(status: IncidentStatus): Pair<Color, Color> = when (status) {
    IncidentStatus.SUBMITTED -> IncidentSubmitted to ChipSubmitted
    IncidentStatus.VERIFIED -> IncidentVerified to ChipVerified
    IncidentStatus.RESOLVED -> IncidentResolved to ChipResolved
    IncidentStatus.REJECTED -> IncidentRejected to ChipRejected
}
