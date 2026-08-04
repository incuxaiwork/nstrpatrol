package com.nstrpatrol.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nstrpatrol.app.data.SettingsData
import com.nstrpatrol.app.ui.components.DangerButton
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.components.SectionHeader
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.OutlineSoft
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary

@Composable
fun SettingsScreen(
    onLogout: () -> Unit,
    onTabSelected: (BottomTab) -> Unit
) {
    NstrScaffold(
        title = "Settings",
        subtitle = "Preferences",
        activeTab = BottomTab.Settings,
        onTabSelected = onTabSelected
    ) {
        Spacer(Modifier.height(16.dp))
        SectionHeader(text = "Profile")
        Spacer(Modifier.height(8.dp))
        SettingRow(label = "Name", value = SettingsData.name)
        Spacer(Modifier.height(8.dp))
        SettingRow(label = "Designation", value = SettingsData.designation)

        Spacer(Modifier.height(20.dp))
        SectionHeader(text = "General")
        Spacer(Modifier.height(8.dp))
        SettingRow(label = "Language", value = SettingsData.language)
        Spacer(Modifier.height(8.dp))
        SettingRow(label = "Sync Interval", value = SettingsData.syncInterval)
        Spacer(Modifier.height(8.dp))
        SettingRow(label = "Map Layer", value = SettingsData.mapLayer)

        Spacer(Modifier.height(20.dp))
        DangerButton(text = "LOG OUT", onClick = onLogout)
    }
}

@Composable
private fun SettingRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(8.dp))
            .border(1.dp, OutlineCard, androidx.compose.foundation.shape.RoundedCornerShape(8.dp))
            .background(Surface)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = label,
                color = TextPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium
            )
            Text(
                text = value,
                color = TextSecondary,
                fontSize = 12.sp
            )
        }
        Icon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = Color(0xFFBDBDBD)
        )
    }
}
