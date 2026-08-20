package com.nstrpatrol.app.ui.screens

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
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nstrpatrol.app.data.Options
import com.nstrpatrol.app.data.PatrolTimer
import com.nstrpatrol.app.data.IndiaTime
import com.nstrpatrol.app.data.PhotoStore
import com.nstrpatrol.app.data.capturedLocationText
import com.nstrpatrol.app.data.submitIncident
import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.data.map.BackendApiClient
import com.nstrpatrol.app.ui.components.AutoCapturedPanel
import com.nstrpatrol.app.ui.components.FieldLabel
import com.nstrpatrol.app.ui.components.FormSheet
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.components.PhotoPlaceholder
import com.nstrpatrol.app.ui.components.PrimaryButton
import com.nstrpatrol.app.ui.components.RemarksField
import com.nstrpatrol.app.ui.components.SectionHeader
import com.nstrpatrol.app.ui.components.SelectField
import com.nstrpatrol.app.ui.components.SeverityControl
import com.nstrpatrol.app.ui.navigation.BottomTab

@Composable
fun HumanImpactScreen(
    onBack: () -> Unit,
    onTabSelected: (BottomTab) -> Unit,
    onOpenCamera: (String) -> Unit = {},
    patrolTimer: PatrolTimer,
    dao: TelemetryDao,
    api: BackendApiClient
) {
    val context = LocalContext.current
    var impactType by remember { mutableStateOf<String?>(null) }
    var actionTaken by remember { mutableStateOf<String?>(null) }
    var timeElapsed by remember { mutableStateOf<String?>(null) }
    var severity by remember { mutableStateOf("Low") }
    var remarks by remember { mutableStateOf("") }
    var openSheet by remember { mutableStateOf<String?>(null) }
    val photoSlot = "human_impact"
    var photoPaths by remember { mutableStateOf(PhotoStore.paths(photoSlot)) }
    val capturedGps = remember { capturedLocationText(context) }
    val capturedTime = IndiaTime.panel(System.currentTimeMillis())

    val titles = mapOf(
        "impact" to "Human Impact Type",
        "action" to "Action Taken",
        "time" to "Time Elapsed"
    )
    val options = mapOf(
        "impact" to Options.humanImpactTypes,
        "action" to Options.actionTaken,
        "time" to (1..10).map { "$it Day" + if (it > 1) "s" else "" }
    )

    Box {
        NstrScaffold(
            title = "Human Impact",
            subtitle = "Report human impact details",
            onBack = onBack,
            activeTab = BottomTab.Patrol,
            onTabSelected = onTabSelected
        ) {
            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Human Impact Photo", required = true)
            Spacer(Modifier.height(8.dp))
            PhotoPlaceholder(
                actionText = "Take photo",
                hint = "Open camera to capture the impact",
                photoPaths = photoPaths,
                onClick = { onOpenCamera(photoSlot) },
                onRemovePhoto = { path ->
                    PhotoStore.removePath(photoSlot, path)
                    photoPaths = PhotoStore.paths(photoSlot)
                }
            )

            Spacer(Modifier.height(16.dp))
            SectionHeader(text = "Impact details")
            Spacer(Modifier.height(8.dp))

            FieldLabel(text = "Human Impact Type", required = true)
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Human Impact",
                value = impactType,
                onClick = { openSheet = "impact" }
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Action Taken", required = true)
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Action Taken",
                value = actionTaken,
                onClick = { openSheet = "action" }
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Severity")
            Spacer(Modifier.height(4.dp))
            SeverityControl(selected = severity, onSelect = { severity = it })

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Time Elapsed (optional)")
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Days",
                value = timeElapsed,
                onClick = { openSheet = "time" }
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Remarks (optional)")
            Spacer(Modifier.height(4.dp))
            RemarksField(
                value = remarks,
                onValueChange = { remarks = it },
                placeholder = "Enter Any Remarks Here",
                height = 100
            )

            Spacer(Modifier.height(16.dp))
            SectionHeader(text = "Captured")
            Spacer(Modifier.height(8.dp))
            AutoCapturedPanel(gps = capturedGps, timestamp = capturedTime)

            Spacer(Modifier.height(20.dp))
            PrimaryButton(
                text = "SUBMIT INFORMATION",
                onClick = {
                    submitIncident(
                        dao = dao, api = api, patrolTimer = patrolTimer, context = context,
                        type = "HUMAN_IMPACT", title = impactType ?: "Human Impact",
                        description = remarks.ifEmpty { null },
                        severity = severity,
                        details = mapOf(
                            "impactType" to impactType,
                            "actionTaken" to actionTaken,
                            "timeElapsed" to timeElapsed
                        ),
                        photos = PhotoStore.paths(photoSlot)
                    )
                    onBack()
                },
                textSize = 15,
                textWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(8.dp))
        }

        FormSheet(
            openSheet = openSheet,
            titles = titles,
            options = options,
            selected = { when (it) {
                "impact" -> impactType
                "action" -> actionTaken
                else -> timeElapsed
            } },
            onSelected = { field, value -> when (field) {
                "impact" -> impactType = value
                "action" -> actionTaken = value
                else -> timeElapsed = value
            } },
            onDismiss = { openSheet = null }
        )
    }
}
