package com.nstrpatrol.app.ui.screens

import com.nstrpatrol.app.R

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.nstrpatrol.app.data.Options
import com.nstrpatrol.app.data.AuthSession
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
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.SurfaceVariant
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
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
    api: com.nstrpatrol.app.data.map.BackendApiClient,
    auth: AuthSession? = null,
    onRequireFaceSetup: () -> Unit = {}
) {
    var patrolType by remember { mutableStateOf<String?>(null) }
    var patrolMethod by remember { mutableStateOf<String?>(null) }
    var beat by remember { mutableStateOf<String?>(null) }
    var armed by remember { mutableStateOf("Armed") }
    var armUsed by remember { mutableStateOf<String?>(null) }
    var openSheet by remember { mutableStateOf<String?>(null) }
    var showErrors by remember { mutableStateOf(false) }
    var faceVerified by remember { mutableStateOf(false) }
    var faceError by remember { mutableStateOf<String?>(null) }
    var faceScanning by remember { mutableStateOf(false) }
    var faceMatching by remember { mutableStateOf(false) }
    var faceMatchScore by remember { mutableStateOf<Float?>(null) }
    val photoSlot = "patrol_start"
    var photoPaths by remember { mutableStateOf(PhotoStore.paths(photoSlot)) }
    val scope = rememberCoroutineScope()

    val context = LocalContext.current

    // This officer must finish one-time face setup on this handset before patrolling.
    // DISABLED FOR BETA (face recognition moved to feature/facerecognization):
    // LaunchedEffect(Unit) {
    //     if (auth != null && !auth.faceSetupDoneLocally()) {
    //         onRequireFaceSetup()
    //     }
    // }

    // Live-selfie match: compares the captured frame against this officer's
    // enrolled reference embedding. Identity is proven purely by face match —
    // no device fingerprint / PIN prompt is involved.
    fun onSelfieCaptured(file: java.io.File) {
        scope.launch {
            faceMatching = true
            faceError = null
            try {
                val live = com.nstrpatrol.app.data.face.FaceRecognizer.embed(context, file)
                file.delete()
                val reference = auth?.faceReference()
                when {
                    live == null ->
                        faceError = "No clear face detected. Try again in better light."
                    reference == null ->
                        faceError = "No face reference found on this device. Complete face setup first."
                    else -> {
                        val score = com.nstrpatrol.app.data.face.FaceRecognizer.similarity(live, reference)
                        if (score >= com.nstrpatrol.app.data.face.FaceRecognizer.MATCH_THRESHOLD) {
                            faceMatchScore = score
                            faceVerified = true
                            faceScanning = false
                        } else {
                            faceError = "This face does not match your enrolled reference. Only the officer who set up this device can start the patrol."
                        }
                    }
                }
            } catch (e: Exception) {
                faceError = "Face check failed: ${e.message}"
            } finally {
                faceMatching = false
            }
        }
    }

    Box {
        NstrScaffold(
            title = stringResource(R.string.patrol_start_title),
            subtitle = stringResource(R.string.patrol_start_subtitle),
            onBack = onBack,
            activeTab = BottomTab.Patrol,
            onTabSelected = onTabSelected
        ) {
            // Photo capture section (disabled for beta)
            // Spacer(Modifier.height(12.dp))
            // SectionHeader(text = stringResource(R.string.patrol_start_team))
            // Spacer(Modifier.height(8.dp))
            // PhotoPlaceholder(
            //     actionText = stringResource(R.string.patrol_photo_action),
            //     hint = stringResource(R.string.patrol_photo_hint),
            //     photoPaths = photoPaths,
            //     onClick = { onOpenCamera(photoSlot) },
            //     onRemovePhoto = { path ->
            //         PhotoStore.removePath(photoSlot, path)
            //         photoPaths = PhotoStore.paths(photoSlot)
            //     }
            // )

            // DISABLED FOR BETA (face recognition moved to feature/facerecognization):
            // Spacer(Modifier.height(12.dp))
            // SectionHeader(text = "Officer verification")
            // Spacer(Modifier.height(8.dp))
            // if (faceScanning) {
            //     com.nstrpatrol.app.ui.components.FaceScanCard(
            //         buttonLabel = "Scan my face",
            //         hint = "Look straight at the front camera. Your face is matched against your enrolled reference on this device.",
            //         busy = faceMatching,
            //         error = faceError,
            //         persistentFile = false,
            //         onCaptured = { onSelfieCaptured(it) }
            //     )
            //     Spacer(Modifier.height(6.dp))
            //     Text(
            //         text = "Cancel",
            //         color = TextSecondary,
            //         fontSize = 12.sp,
            //         modifier = Modifier
            //             .clickable { faceScanning = false; faceError = null }
            //             .padding(vertical = 4.dp)
            //     )
            // } else {
            //     FaceVerificationCard(
            //         verified = faceVerified,
            //         error = faceError,
            //         onVerify = {
            //             faceError = null
            //             faceScanning = true
            //         }
            //     )
            // }
            // if (showErrors && !faceVerified) {
            //     Spacer(Modifier.height(4.dp))
            //     Text(
            //         text = "Verify your face before starting the patrol.",
            //         color = ErrorRed, fontSize = 11.sp
            //     )
            // }

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
                onSelect = {
                    armed = it
                    if (it == "Unarmed") armUsed = null
                },
                selectedColor = androidx.compose.ui.graphics.Color(0xFF1E4620),
                height = 32,
                containerColor = androidx.compose.ui.graphics.Color(0xFFEEEEEE)
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = stringResource(R.string.patrol_start_arm_used))
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = stringResource(R.string.patrol_start_arm_type_ph),
                value = if (armed == "Armed") armUsed else null,
                enabled = armed == "Armed",
                onClick = { openSheet = "arm" }
            )

            Spacer(Modifier.height(20.dp))
            PrimaryButton(text = stringResource(R.string.action_start_patrol), onClick = {
                showErrors = true
                if (patrolType == null || patrolMethod == null || beat == null) {
                    return@PrimaryButton
                }
                // DISABLED FOR BETA (face recognition moved to feature/facerecognization):
                // if (!faceVerified) {
                //     faceError = "Verify your face before starting the patrol."
                //     return@PrimaryButton
                // }
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
                            faceVerified = faceVerified,
                            syncStatus = "PENDING"
                        )
                    )
                    runCatching {
                        api.createPatrol(
                            org.json.JSONObject().apply {
                                put("id", pid)
                                put("type", mapPatrolType(patrolType))
                                put("name", buildPatrolName(patrolType, beat))
                                put("faceVerified", faceVerified)
                                if (faceMatchScore != null) put("faceMatchScore", faceMatchScore!!.toDouble())
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
                else -> if (armed == "Armed") armUsed else null
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

/**
 * Compact card that shows the officer-identity verification state and opens the
 * face scanner. Gets a confirmed state only after the live selfie matches the
 * officer's enrolled reference; otherwise it shows the current status/error.
 */
@Composable
private fun FaceVerificationCard(
    verified: Boolean,
    error: String?,
    onVerify: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (verified) ForestGreen.copy(alpha = 0.08f) else Surface)
            .border(1.dp, if (verified) ForestGreen.copy(alpha = 0.5f) else if (error != null) ErrorRed.copy(alpha = 0.5f) else Color(0xFFDDDDDD), RoundedCornerShape(8.dp))
            .clickable(enabled = !verified, onClick = onVerify)
            .padding(horizontal = 14.dp, vertical = 12.dp)
    ) {
        Row {
            Column(Modifier.weight(1f)) {
                Text(
                    text = if (verified) "Face verified — identity confirmed" else "Verify officer identity",
                    color = if (verified) ForestGreen else TextPrimary,
                    fontSize = 13.sp,
                    fontWeight = if (verified) FontWeight.SemiBold else FontWeight.Medium
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = if (verified)
                        "Your live selfie matched your enrolled reference on this device."
                    else
                        "Tap to scan your face. Your selfie is matched against your enrolled reference before the patrol starts.",
                    color = TextSecondary,
                    fontSize = 11.sp
                )
            }
            if (!verified && error == null) {
                Box(
                    modifier = Modifier
                        .background(ForestGreen, RoundedCornerShape(6.dp))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    Text(
                        text = "Scan face",
                        color = Color.White,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
        if (error != null && !verified) {
            Spacer(Modifier.height(8.dp))
            Text(text = error, color = ErrorRed, fontSize = 11.sp)
        }
    }
}

private fun mapPatrolType(type: String?): String = when (type) {
    "BICYCLE", "Cycle" -> "BICYCLE"
    "VEHICLE", "Motor Cycle", "Four Wheeler", "Boat", "Aerial" -> "VEHICLE"
    "STATIONARY" -> "STATIONARY"
    "COMBING SURVEILLANCE" -> "COMBING"
    "GENERAL DUTIES" -> "GENERAL"
    else -> "WALK"
}

private fun buildPatrolName(type: String?, beat: String?): String {
    val parts = listOfNotNull(type, beat).filter { it.isNotBlank() }
    return if (parts.isEmpty()) "Patrol" else parts.joinToString(" – ")
}