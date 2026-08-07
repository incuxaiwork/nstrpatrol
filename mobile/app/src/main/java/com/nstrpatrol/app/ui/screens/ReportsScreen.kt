package com.nstrpatrol.app.ui.screens

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Pets
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.WaterDrop
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nstrpatrol.app.data.ReportedIncidents
import com.nstrpatrol.app.data.ReportedIncidents.IncidentStatus
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.components.SectionHeader
import com.nstrpatrol.app.ui.components.StatusChip
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.ChipRejected
import com.nstrpatrol.app.ui.theme.ChipResolved
import com.nstrpatrol.app.ui.theme.ChipSubmitted
import com.nstrpatrol.app.ui.theme.ChipVerified
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.IncidentRejected
import com.nstrpatrol.app.ui.theme.IncidentResolved
import com.nstrpatrol.app.ui.theme.IncidentSubmitted
import com.nstrpatrol.app.ui.theme.IncidentVerified
import com.nstrpatrol.app.ui.theme.LightForest
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary

/**
 * Report category chooser. Per the Penpot flow this page is only the category
 * grid; tapping a category opens its individual form page (which carries the
 * category fields, severity, remarks, captured details and save actions).
 * Below the grid, previously reported incidents are listed and open their
 * full report detail on tap.
 */
@Composable
fun ReportsScreen(
    onOpenCategory: (String) -> Unit,
    onOpenIncident: (String) -> Unit,
    onTabSelected: (BottomTab) -> Unit
) {
    NstrScaffold(
        title = "Reports",
        subtitle = "Select a report category",
        activeTab = BottomTab.Reports,
        onTabSelected = onTabSelected
    ) {
        Spacer(Modifier.height(12.dp))
        SectionHeader(text = "Category", color = TextPrimary)
        Spacer(Modifier.height(8.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CategoryCard(
                label = "Human Impact",
                icon = Icons.Filled.Person,
                onClick = { onOpenCategory("human_impact") },
                modifier = Modifier.weight(1f)
            )
            CategoryCard(
                label = "Animal Mortality",
                icon = Icons.Filled.Pets,
                onClick = { onOpenCategory("animal_mortality") },
                modifier = Modifier.weight(1f)
            )
            CategoryCard(
                label = "Sightings",
                icon = Icons.Filled.Visibility,
                onClick = { onOpenCategory("sighting") },
                modifier = Modifier.weight(1f)
            )
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CategoryCard(
                label = "Water Source",
                icon = Icons.Filled.WaterDrop,
                onClick = { onOpenCategory("water_source") },
                modifier = Modifier.weight(1f)
            )
            CategoryCard(label = "", icon = null, onClick = { }, modifier = Modifier.weight(1f))
            CategoryCard(label = "", icon = null, onClick = { }, modifier = Modifier.weight(1f))
        }

        Spacer(Modifier.height(24.dp))
        SectionHeader(text = "Reported incidents", color = TextPrimary)
        Spacer(Modifier.height(8.dp))
        ReportedIncidents.list.forEach { incident ->
            IncidentCard(
                incident = incident,
                onClick = { onOpenIncident(incident.id) }
            )
            Spacer(Modifier.height(8.dp))
        }
        Spacer(Modifier.height(12.dp))
    }
}

@Composable
private fun IncidentCard(
    incident: ReportedIncidents.Incident,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val (chipColor, chipBg) = incidentStatusStyle(incident.status)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
            .background(Surface)
            .clickable(onClick = onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .background(LightForest, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = categoryIcon(incident.category),
                contentDescription = incident.category,
                tint = ForestGreen,
                modifier = Modifier.size(22.dp)
            )
        }
        Spacer(Modifier.size(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = incident.category,
                color = TextPrimary,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = "${incident.type} · ${incident.date}",
                color = TextSecondary,
                fontSize = 12.sp
            )
        }
        Spacer(Modifier.size(8.dp))
        StatusChip(
            label = incident.status.label,
            chipColor = chipColor,
            chipBackground = chipBg
        )
    }
}

private fun categoryIcon(category: String): ImageVector = when (category) {
    "Human Impact" -> Icons.Filled.Person
    "Animal Mortality" -> Icons.Filled.Pets
    "Sightings" -> Icons.Filled.Visibility
    else -> Icons.Filled.WaterDrop
}

private fun incidentStatusStyle(status: IncidentStatus): Pair<Color, Color> = when (status) {
    IncidentStatus.SUBMITTED -> IncidentSubmitted to ChipSubmitted
    IncidentStatus.VERIFIED -> IncidentVerified to ChipVerified
    IncidentStatus.RESOLVED -> IncidentResolved to ChipResolved
    IncidentStatus.REJECTED -> IncidentRejected to ChipRejected
}

@Composable
private fun CategoryCard(
    label: String,
    icon: ImageVector?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .height(64.dp)
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
            .background(Surface)
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = ForestGreen,
                modifier = Modifier.size(24.dp)
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = label,
                color = TextPrimary,
                fontSize = 10.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1
            )
        }
    }
}
