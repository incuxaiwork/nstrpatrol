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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Pets
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.WaterDrop
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nstrpatrol.app.data.AutoDetails
import com.nstrpatrol.app.data.PhotoStore
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.components.PhotoPlaceholder
import com.nstrpatrol.app.ui.components.PrimaryButton
import com.nstrpatrol.app.ui.components.RemarksField
import com.nstrpatrol.app.ui.components.SectionHeader
import com.nstrpatrol.app.ui.components.SecondaryButton
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.LightForest
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.SeverityHigh
import com.nstrpatrol.app.ui.theme.SeverityLow
import com.nstrpatrol.app.ui.theme.SeverityMedium
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary

@Composable
fun ReportsScreen(
    onOpenCategory: (String) -> Unit,
    onTabSelected: (BottomTab) -> Unit,
    onOpenCamera: (String) -> Unit = {}
) {
    var severity by remember { mutableStateOf("Low") }
    var description by remember { mutableStateOf("") }
    val photoSlot = "reports"
    val photoPath by remember { mutableStateOf(PhotoStore.path(photoSlot)) }

    NstrScaffold(
        title = "Reports",
        subtitle = "Record a new field observation",
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
                selected = true,
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

        Spacer(Modifier.height(20.dp))
        SectionHeader(text = "Report details", color = TextPrimary)
        Spacer(Modifier.height(8.dp))
        Text(
            text = "Severity",
            color = TextSecondary,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium
        )
        Spacer(Modifier.height(8.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(38.dp)
                .clip(RoundedCornerShape(8.dp))
                .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
                .background(Surface)
                .padding(2.dp)
        ) {
            val colors = mapOf("Low" to SeverityLow, "Medium" to SeverityMedium, "High" to SeverityHigh)
            listOf("Low", "Medium", "High").forEach { option ->
                val isSelected = option == severity
                val color = colors.getValue(option)
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(30.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (isSelected) color else color.copy(alpha = 0.12f))
                        .then(
                            if (isSelected) Modifier.border(1.5.dp, color, RoundedCornerShape(6.dp))
                            else Modifier
                        )
                        .clickable { severity = option },
                    contentAlignment = Alignment.Center
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (isSelected) {
                            Icon(
                                imageVector = Icons.Filled.Check,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(Modifier.width(4.dp))
                        }
                        Text(
                            text = option,
                            color = if (isSelected) Color.White else color,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(16.dp))
        Text(
            text = "Description",
            color = TextSecondary,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium
        )
        Spacer(Modifier.height(8.dp))
        RemarksField(
            value = description,
            onValueChange = { description = it },
            placeholder = "Describe the observation in detail...",
            height = 88
        )

        Spacer(Modifier.height(16.dp))
        Text(
            text = "Add photo",
            color = TextSecondary,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium
        )
        Spacer(Modifier.height(8.dp))
        PhotoPlaceholder(
            actionText = "Tap to add photos",
            hint = "Open camera to capture the observation",
            photoPath = photoPath,
            onClick = { onOpenCamera(photoSlot) }
        )

        Spacer(Modifier.height(20.dp))
        SectionHeader(text = "Auto-captured details", color = TextSecondary)
        Spacer(Modifier.height(8.dp))

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
                .background(Surface)
        ) {
            AutoDetailRow(label = "GPS coordinates", value = AutoDetails.gps)
            AutoDetailRow(label = "Timestamp", value = AutoDetails.timestamp)
            AutoDetailRow(label = "Officer", value = AutoDetails.officer)
            AutoDetailRow(label = "Badge", value = AutoDetails.badge)
            AutoDetailRow(label = "Beat", value = AutoDetails.beat)
            AutoDetailRow(label = "GPS accuracy", value = AutoDetails.accuracy)
            AutoDetailRow(label = "Saved", value = AutoDetails.saved)
        }

        Spacer(Modifier.height(20.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SecondaryButton(text = "Save Draft", onClick = { }, modifier = Modifier.weight(1f))
            PrimaryButton(text = "Submit Report", onClick = { }, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun CategoryCard(
    label: String,
    icon: ImageVector?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    selected: Boolean = false
) {
    Column(
        modifier = modifier
            .height(64.dp)
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, if (selected) ForestGreen else OutlineCard, RoundedCornerShape(8.dp))
            .background(if (selected) LightForest else Surface)
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

@Composable
private fun AutoDetailRow(label: String, value: String) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 10.dp)
        ) {
            Text(
                text = label,
                color = TextSecondary,
                fontSize = 12.sp,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = value,
                color = TextPrimary,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium
            )
        }
        Box(
            Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(Color(0xFFEEEEEE))
        )
    }
}
