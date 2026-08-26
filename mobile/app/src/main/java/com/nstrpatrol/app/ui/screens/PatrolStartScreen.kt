package com.nstrpatrol.app.ui.screens

import com.nstrpatrol.app.R

import android.Manifest
import android.content.pm.PackageManager
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
import androidx.core.content.ContextCompat
import com.nstrpatrol.app.data.Options
import com.nstrpatrol.app.data.AuthSession
import com.nstrpatrol.app.data.PatrolTimer
import com.nstrpatrol.app.data.PhotoStore
import com.nstrpatrol.app.data.lastKnownLocation
import com.nstrpatrol.app.data.db.PatrolSessionEntity
import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.ui.components.FieldLabel
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.components.OptionSheet
import com.nstrpatrol.app.ui.components.PrimaryButton
import com.nstrpatrol.app.ui.components.SectionHeader
import com.nstrpatrol.app.ui.components.SelectField
import com.nstrpatrol.app.ui.components.SegmentedControl
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.ErrorRed
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.Surface
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
    var armed by remember { mutableStateOf("Armed") }
    var armUsed by remember { mutableStateOf<String?>(null) }
    var openSheet by remember { mutableStateOf<String?>(null) }
    var showErrors by remember { mutableStateOf(false) }
    var faceVerified by remember { mutableStateOf(false) }
    var faceMatchScore by remember { mutableStateOf<Float?>(null) }
    val scope = rememberCoroutineScope()

    val context = LocalContext.current
    val user = remember { auth?.currentUser }

    // Beat is auto-assigned from the user's profile — no dropdown selection.
    val assignedBeat = user?.beatName
    val assignedRange = user?.rangeName
    val beat = assignedBeat  // FBO/ABO: their specific beat; FRO/DyRO/FSO: null (range-level)

    // Location validation state
    var locationChecking by remember { mutableStateOf(false) }
    var locationValid by remember { mutableStateOf<Boolean?>(null) }
    var locationMessage by remember { mutableStateOf<String?>(null) }

    // Validate location on screen entry
    LaunchedEffect(Unit) {
        // Must have location permission to proceed
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            locationMessage = "Location permission required. Grant permission and try again."
            locationValid = false
            return@LaunchedEffect
        }

        locationChecking = true
        try {
            val loc = lastKnownLocation(context)
            if (loc == null) {
                locationMessage = "Unable to get GPS location. Ensure GPS is enabled and you are outdoors."
                locationValid = false
                locationChecking = false
                return@LaunchedEffect
            }
            val result = api.validateLocation(loc.latitude, loc.longitude, assignedBeat, assignedRange)
            val valid = result.optBoolean("valid", false)
            val reason = result.optString("reason", "")
            val msg = result.optString("message", "")
            locationValid = valid
            locationMessage = when {
                valid && reason == "inside_beat" -> "Location verified: You are inside your assigned beat ($assignedBeat)"
                valid && reason == "inside_range" -> "Location verified: You are inside your assigned range ($assignedRange)"
                valid && reason == "no_assignment" -> "No beat/range assignment to validate."
                !valid && reason == "outside_beat" -> "You are OUTSIDE your assigned beat ($assignedBeat). Move to your beat area to start patrol."
                !valid && reason == "outside_range" -> "You are OUTSIDE your assigned range ($assignedRange). Move to your range area to start patrol."
                !valid && reason == "beat_not_found" -> msg.ifEmpty { "Assigned beat not found in GIS data." }
                !valid && reason == "range_not_found" -> msg.ifEmpty { "Assigned range not found in GIS data." }
                else -> msg.ifEmpty { "Location validation failed." }
            }
        } catch (e: Exception) {
            locationMessage = "Location check failed: ${e.message}. Ensure you have network."
            locationValid = false
        } finally {
            locationChecking = false
        }
    }

    // Live-selfie match
    fun onSelfieCaptured(file: java.io.File) {
        scope.launch {
            try {
                val live = com.nstrpatrol.app.data.face.FaceRecognizer.embed(context, file)
                file.delete()
                val reference = auth?.faceReference()
                if (live != null && reference != null) {
                    val score = com.nstrpatrol.app.data.face.FaceRecognizer.similarity(live, reference)
                    if (score >= com.nstrpatrol.app.data.face.FaceRecognizer.MATCH_THRESHOLD) {
                        faceMatchScore = score
                        faceVerified = true
                    }
                }
            } catch (_: Exception) {}
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
            Spacer(Modifier.height(16.dp))
            SectionHeader(text = stringResource(R.string.patrol_start_details))
            Spacer(Modifier.height(8.dp))

            // ── Assigned Beat / Range display ──────────────────────────────
            if (assignedBeat != null) {
                // FBO/ABO: show assigned beat
                Spacer(Modifier.height(8.dp))
                FieldLabel(text = "Assigned Beat")
                Spacer(Modifier.height(4.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(ForestGreen.copy(alpha = 0.08f), RoundedCornerShape(8.dp))
                        .border(1.dp, ForestGreen.copy(alpha = 0.5f), RoundedCornerShape(8.dp))
                        .padding(horizontal = 14.dp, vertical = 12.dp)
                ) {
                    Column {
                        Text(
                            text = assignedBeat,
                            color = ForestGreen,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        if (user?.section != null) {
                            Text(
                                text = "Section: ${user.section}",
                                color = TextSecondary,
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            } else if (assignedRange != null) {
                // FRO/DyRO/FSO: show assigned range
                Spacer(Modifier.height(8.dp))
                FieldLabel(text = "Assigned Range")
                Spacer(Modifier.height(4.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(ForestGreen.copy(alpha = 0.08f), RoundedCornerShape(8.dp))
                        .border(1.dp, ForestGreen.copy(alpha = 0.5f), RoundedCornerShape(8.dp))
                        .padding(horizontal = 14.dp, vertical = 12.dp)
                ) {
                    Text(
                        text = assignedRange,
                        color = ForestGreen,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            } else {
                // Admin / unassigned
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "No beat/range assignment. You can patrol anywhere.",
                    color = TextSecondary,
                    fontSize = 12.sp
                )
            }

            // ── Location validation status ─────────────────────────────────
            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Location Status")
            Spacer(Modifier.height(4.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        when {
                            locationChecking -> Color(0xFFFFF8E1)
                            locationValid == true -> ForestGreen.copy(alpha = 0.08f)
                            locationValid == false -> ErrorRed.copy(alpha = 0.08f)
                            else -> Surface
                        },
                        RoundedCornerShape(8.dp)
                    )
                    .border(
                        1.dp,
                        when {
                            locationChecking -> Color(0xFFFFB300)
                            locationValid == true -> ForestGreen.copy(alpha = 0.5f)
                            locationValid == false -> ErrorRed.copy(alpha = 0.5f)
                            else -> Color(0xFFDDDDDD)
                        },
                        RoundedCornerShape(8.dp)
                    )
                    .padding(horizontal = 14.dp, vertical = 12.dp)
            ) {
                Column {
                    Text(
                        text = when {
                            locationChecking -> "Checking your location..."
                            locationValid == true -> "Location verified"
                            locationValid == false -> "Outside designated area"
                            else -> "Waiting for GPS..."
                        },
                        color = when {
                            locationChecking -> Color(0xFFE65100)
                            locationValid == true -> ForestGreen
                            locationValid == false -> ErrorRed
                            else -> TextSecondary
                        },
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    if (locationMessage != null) {
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = locationMessage!!,
                            color = TextSecondary,
                            fontSize = 11.sp
                        )
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
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
                if (patrolType == null || patrolMethod == null) {
                    return@PrimaryButton
                }
                // Block patrol if location is not validated or outside designated area
                if (locationValid != true) {
                    locationMessage = locationMessage ?: "You must be in your designated area to start patrol."
                    return@PrimaryButton
                }
                onStartPatrol()
                val pid = patrolTimer.patrolId ?: return@PrimaryButton
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
                else -> stringResource(R.string.patrol_start_arm_used)
            }
            val options = when (sheet) {
                "patrol_type" -> Options.patrolTypes
                "patrol_method" -> Options.patrolMethods
                else -> Options.armTypes
            }
            val selected = when (sheet) {
                "patrol_type" -> patrolType
                "patrol_method" -> patrolMethod
                else -> if (armed == "Armed") armUsed else null
            }
            val onSelected: (String) -> Unit = when (sheet) {
                "patrol_type" -> { v -> patrolType = v }
                "patrol_method" -> { v -> patrolMethod = v }
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
    "COMBING SURVEILLANCE" -> "COMBING"
    "GENERAL DUTIES" -> "GENERAL"
    else -> "WALK"
}

private fun buildPatrolName(type: String?, beat: String?): String {
    val parts = listOfNotNull(type, beat).filter { it.isNotBlank() }
    return if (parts.isEmpty()) "Patrol" else parts.joinToString(" – ")
}
