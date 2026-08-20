package com.nstrpatrol.app.ui.screens

import com.nstrpatrol.app.R

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.nstrpatrol.app.data.Options
import com.nstrpatrol.app.data.PatrolTimer
import com.nstrpatrol.app.data.PhotoStore
import com.nstrpatrol.app.data.db.PatrolSessionEntity
import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.ui.components.FieldLabel
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.components.OptionSheet
import com.nstrpatrol.app.ui.components.PhotoPlaceholder
import com.nstrpatrol.app.ui.components.PrimaryButton
import com.nstrpatrol.app.ui.components.SectionHeader
import com.nstrpatrol.app.ui.components.SelectField
import com.nstrpatrol.app.ui.components.SegmentedControl
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.ErrorRed
import com.nstrpatrol.app.ui.theme.TextPrimary
import kotlinx.coroutines.launch

@Composable
fun PatrolStartScreen(
    onSave: () -> Unit,
    onBack: () -> Unit,
    onTabSelected: (BottomTab) -> Unit,
    onStartPatrol: () -> Unit,
    onOpenCamera: (String) -> Unit = {},
    patrolTimer: PatrolTimer,
    dao: TelemetryDao,
    api: com.nstrpatrol.app.data.map.BackendApiClient
) {
    var patrolType by remember { mutableStateOf<String?>(null) }
    var patrolMethod by remember { mutableStateOf<String?>(null) }
    var beat by remember { mutableStateOf<String?>(null) }
    var armed by remember { mutableStateOf("Armed") }
    var armUsed by remember { mutableStateOf<String?>(null) }
    var openSheet by remember { mutableStateOf<String?>(null) }
    var showErrors by remember { mutableStateOf(false) }
    val photoSlot = "patrol_start"
    var photoPaths by remember { mutableStateOf(PhotoStore.paths(photoSlot)) }
    Box {
        NstrScaffold(
            title = stringResource(R.string.patrol_start_title),
            subtitle = stringResource(R.string.patrol_start_subtitle),
            onBack = onBack,
            activeTab = BottomTab.Patrol,
            onTabSelected = onTabSelected
        ) {
            Spacer(Modifier.height(12.dp))
            SectionHeader(text = stringResource(R.string.patrol_start_team))
            Spacer(Modifier.height(8.dp))
            PhotoPlaceholder(
                actionText = stringResource(R.string.patrol_photo_action),
                hint = stringResource(R.string.patrol_photo_hint),
                photoPaths = photoPaths,
                onClick = { onOpenCamera(photoSlot) },
                onRemovePhoto = { path ->
                    PhotoStore.removePath(photoSlot, path)
                    photoPaths = PhotoStore.paths(photoSlot)
                }
            )

            Spacer(Modifier.height(16.dp))
            SectionHeader(text = stringResource(R.string.patrol_start_details))
            Spacer(Modifier.height(8.dp))

            FieldLabel(text = stringResource(R.string.patrol_start_patrol_type), required = true)
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = stringResource(R.string.patrol_start_patrol_type_ph),
                value = patrolType,
                isError = showErrors && patrolType == null,
                onClick = { openSheet = "patrol_type" }
            )
            if (showErrors && patrolType == null) {
                Text(stringResource(R.string.common_required), color = ErrorRed, fontSize = 11.sp)
            }

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = stringResource(R.string.patrol_start_patrol_method), required = true)
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = stringResource(R.string.patrol_start_patrol_method_ph),
                value = patrolMethod,
                isError = showErrors && patrolMethod == null,
                onClick = { openSheet = "patrol_method" }
            )
            if (showErrors && patrolMethod == null) {
                Text(stringResource(R.string.common_required), color = ErrorRed, fontSize = 11.sp)
            }

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = stringResource(R.string.patrol_start_select_beat), required = true)
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = stringResource(R.string.patrol_start_select_beat),
                value = beat,
                isError = showErrors && beat == null,
                onClick = { openSheet = "beat" }
            )
            if (showErrors && beat == null) {
                Text(stringResource(R.string.common_required), color = ErrorRed, fontSize = 11.sp)
            }

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = stringResource(R.string.patrol_start_armed_status))
            Spacer(Modifier.height(4.dp))
            SegmentedControl(
                options = listOf("Armed", "Unarmed"),
                selected = armed,
                onSelect = { armed = it },
                selectedColor = androidx.compose.ui.graphics.Color(0xFF1E4620),
                height = 32,
                containerColor = androidx.compose.ui.graphics.Color(0xFFEEEEEE)
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = stringResource(R.string.patrol_start_arm_used))
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = stringResource(R.string.patrol_start_arm_type_ph),
                value = armUsed,
                onClick = { openSheet = "arm" }
            )

            Spacer(Modifier.height(20.dp))
            PrimaryButton(text = stringResource(R.string.action_save_details), onClick = {
                showErrors = true
                if (patrolType == null || patrolMethod == null || beat == null) {
                    return@PrimaryButton
                }
                onStartPatrol()
                val pid = patrolTimer.patrolId ?: return@PrimaryButton
                // Write on a scope NOT tied to this composable: onSave() pops the
                // screen and would otherwise cancel the write before it persists,
                // leaving the session (and its team details) missing.
                CoroutineScope(Dispatchers.IO).launch {
                    dao.upsertPatrolSession(
                        PatrolSessionEntity(
                            patrolId = pid,
                            startTime = patrolTimer.trustedNow(),
                            status = "ACTIVE",
                            patrolType = patrolType,
                            patrolMethod = patrolMethod,
                            beat = beat,
                            armedStatus = armed,
                            syncStatus = "PENDING"
                        )
                    )
                    runCatching {
                        api.createPatrol(
                            org.json.JSONObject().apply {
                                put("id", pid)
                                put("type", mapPatrolType(patrolType))
                                put("name", buildPatrolName(patrolType, beat))
                            }
                        )
                    }.onSuccess { dao.updateSessionSyncStatus(pid, "SYNCED") }
                }
                onSave()
            }, textSize = 15, textWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
        }

        val sheet = openSheet
        if (sheet != null) {
            val title = when (sheet) {
                "patrol_type" -> stringResource(R.string.patrol_start_patrol_type)
                "patrol_method" -> stringResource(R.string.patrol_start_patrol_method)
                "beat" -> stringResource(R.string.patrol_start_select_beat)
                else -> stringResource(R.string.patrol_start_arm_used)
            }
            val options = when (sheet) {
                "patrol_type" -> Options.patrolTypes
                "patrol_method" -> Options.patrolMethods
                "beat" -> Options.beats
                else -> Options.armTypes
            }
            val selected = when (sheet) {
                "patrol_type" -> patrolType
                "patrol_method" -> patrolMethod
                "beat" -> beat
                else -> armUsed
            }
            val onSelected: (String) -> Unit = when (sheet) {
                "patrol_type" -> { v -> patrolType = v }
                "patrol_method" -> { v -> patrolMethod = v }
                "beat" -> { v -> beat = v }
                else -> { v -> armUsed = v }
            }
            OptionSheet(
                title = title,
                options = options,
                selected = selected,
                onSelect = { onSelected(it); openSheet = null },
                onDismiss = { openSheet = null }
            )
        }
    }
}

private fun mapPatrolType(type: String?): String = when (type) {
    "BICYCLE", "Cycle" -> "BICYCLE"
    "VEHICLE", "Motor Cycle", "Four Wheeler", "Boat", "Aerial" -> "VEHICLE"
    "STATIONARY" -> "STATIONARY"
    else -> "WALK"
}

private fun buildPatrolName(type: String?, beat: String?): String {
    val parts = listOfNotNull(type, beat).filter { it.isNotBlank() }
    return if (parts.isEmpty()) "Patrol" else parts.joinToString(" – ")
}
