package com.nstrpatrol.app.ui.screens

import com.nstrpatrol.app.R

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.activity.ComponentActivity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.platform.LocalContext
import com.nstrpatrol.app.data.AuthUser
import com.nstrpatrol.app.i18n.SupportedLanguages
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
    onOpenGpsDiagnostics: () -> Unit = {},
    onTabSelected: (BottomTab) -> Unit,
    user: AuthUser? = null
) {
    val profileName = user?.fullName ?: SettingsData.name
    val designation = user?.designation ?: SettingsData.designation
    val context = LocalContext.current
    var showLanguagePicker by remember { mutableStateOf(false) }
    val currentCode = remember { SupportedLanguages.currentCode(context) }
    val currentLanguageLabel = remember(currentCode) {
        SupportedLanguages.options().firstOrNull { it.code == currentCode }?.displayName
            ?: "English"
    }

    NstrScaffold(
        title = stringResource(R.string.settings_title),
        subtitle = stringResource(R.string.settings_subtitle),
        activeTab = BottomTab.Settings,
        onTabSelected = onTabSelected
    ) {
        Spacer(Modifier.height(16.dp))
        SectionHeader(text = stringResource(R.string.settings_profile))
        Spacer(Modifier.height(8.dp))
        SettingRow(label = stringResource(R.string.settings_name), value = profileName)
        Spacer(Modifier.height(8.dp))
        SettingRow(label = stringResource(R.string.settings_designation), value = designation)
        if (user != null) {
            Spacer(Modifier.height(8.dp))
            SettingRow(label = stringResource(R.string.settings_email), value = user.email)
            Spacer(Modifier.height(8.dp))
            SettingRow(label = stringResource(R.string.settings_phone), value = user.phone ?: "—")
        }

        Spacer(Modifier.height(20.dp))
        SectionHeader(text = stringResource(R.string.settings_general))
        Spacer(Modifier.height(8.dp))
        SettingRow(
            label = stringResource(R.string.settings_language),
            value = currentLanguageLabel,
            onClick = { showLanguagePicker = true }
        )
        Spacer(Modifier.height(8.dp))
        SettingRow(label = stringResource(R.string.settings_sync_interval), value = SettingsData.syncInterval, onClick = {})
        Spacer(Modifier.height(8.dp))
        SettingRow(label = stringResource(R.string.settings_map_layer), value = SettingsData.mapLayer, onClick = {})

        Spacer(Modifier.height(20.dp))
        SectionHeader(text = stringResource(R.string.settings_diagnostics))
        Spacer(Modifier.height(8.dp))
        SettingRow(
            label = stringResource(R.string.settings_gps_diagnostics),
            value = stringResource(R.string.settings_gps_diagnostics_desc),
            onClick = onOpenGpsDiagnostics
        )

        Spacer(Modifier.height(20.dp))
        DangerButton(text = stringResource(R.string.settings_logout), onClick = onLogout)

        if (showLanguagePicker) {
            LanguagePickerDialog(
                currentCode = currentCode,
                onSelect = { code ->
                    SupportedLanguages.apply(context, code)
                    context.findComponentActivity()?.recreate()
                    showLanguagePicker = false
                },
                onDismiss = { showLanguagePicker = false }
            )
        }
    }
}

@Composable
private fun LanguagePickerDialog(
    currentCode: String,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val options = remember { SupportedLanguages.options() }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_language)) },
        text = {
            Column {
                options.forEach { option ->
                    val selected = option.code == currentCode
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onSelect(option.code) }
                            .padding(vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(selected = selected, onClick = { onSelect(option.code) })
                        Spacer(Modifier.width(12.dp))
                        Text(
                            text = option.displayName,
                            color = TextPrimary,
                            fontSize = 14.sp
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.action_close))
            }
        }
    )
}

@Composable
private fun SettingRow(
    label: String,
    value: String,
    onClick: (() -> Unit)? = null
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(8.dp))
            .border(1.dp, OutlineCard, androidx.compose.foundation.shape.RoundedCornerShape(8.dp))
            .background(Surface)
            .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier)
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
        if (onClick != null) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = Color(0xFFBDBDBD)
            )
        }
    }
}

private fun Context.findComponentActivity(): ComponentActivity? {
    var ctx: android.content.Context? = this
    while (ctx is ContextWrapper) {
        if (ctx is ComponentActivity) return ctx
        ctx = ctx.baseContext
    }
    return null
}
