package com.nstrpatrol.app.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nstrpatrol.app.data.Options
import com.nstrpatrol.app.data.PatrolTimer
import com.nstrpatrol.app.data.PhotoStore
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
fun SightingScreen(
    onBack: () -> Unit,
    onTabSelected: (BottomTab) -> Unit,
    onOpenCamera: (String) -> Unit = {},
    patrolTimer: PatrolTimer,
    dao: TelemetryDao,
    api: BackendApiClient
) {
    val context = LocalContext.current
    var signType by remember { mutableStateOf<String?>(null) }
    var speciesType by remember { mutableStateOf<String?>(null) }
    var species by remember { mutableStateOf<String?>(null) }
    var ageOfTracks by remember { mutableStateOf<String?>(null) }
    var severity by remember { mutableStateOf("Low") }
    var remarks by remember { mutableStateOf("") }
    var openSheet by remember { mutableStateOf<String?>(null) }
    val photoSlot = "sighting"
    val photoPaths by remember { mutableStateOf(PhotoStore.paths(photoSlot)) }

    val titles = mapOf(
        "sign" to "Sign Type",
        "species_type" to "Species Type",
        "species" to "Species",
        "age" to "Age of Tracks and Signs"
    )
    val options = mapOf(
        "sign" to Options.signTypes,
        "species_type" to Options.speciesTypes.filterNot { it == "Domestic" },
        "species" to (speciesType?.let { Options.speciesByType[it] } ?: emptyList()),
        "age" to Options.ageOfTracks
    )

    Box {
        NstrScaffold(
            title = "Sightings",
            subtitle = "Direct and indirect sighting",
            onBack = onBack,
            activeTab = BottomTab.Patrol,
            onTabSelected = onTabSelected
        ) {
            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Sighting Photo", required = true)
            Spacer(Modifier.height(8.dp))
            PhotoPlaceholder(
                actionText = "Take photo",
                hint = "Open camera to capture the impact",
                photoPaths = photoPaths,
                onClick = { onOpenCamera(photoSlot) }
            )

            Spacer(Modifier.height(16.dp))
            SectionHeader(text = "Sighting details")
            Spacer(Modifier.height(8.dp))

            FieldLabel(text = "Sign Type", required = true)
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Sign Type",
                value = signType,
                onClick = { openSheet = "sign" }
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Species Type", required = true)
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Species Type",
                value = speciesType,
                onClick = { openSheet = "species_type" }
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Species", required = true)
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Species",
                value = species,
                onClick = { openSheet = "species" }
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Age of Tracks and Signs", required = true)
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Age of Tracks and Signs",
                value = ageOfTracks,
                onClick = { openSheet = "age" }
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Severity")
            Spacer(Modifier.height(4.dp))
            SeverityControl(selected = severity, onSelect = { severity = it })

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Remarks")
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
            AutoCapturedPanel()

            Spacer(Modifier.height(20.dp))
            PrimaryButton(text = "SAVE DETAILS", onClick = {
                submitIncident(
                    dao = dao, api = api, patrolTimer = patrolTimer, context = context,
                    type = "SIGHTING", title = species ?: "Sighting",
                    description = remarks.ifEmpty { null },
                    severity = severity,
                    details = mapOf(
                        "signType" to signType,
                        "speciesType" to speciesType,
                        "species" to species,
                        "ageOfTracks" to ageOfTracks
                    ),
                    photos = PhotoStore.paths(photoSlot)
                )
                onBack()
            }, textSize = 15, textWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
        }

        FormSheet(
            openSheet = openSheet,
            titles = titles,
            options = options,
            selected = { when (it) {
                "sign" -> signType
                "species_type" -> speciesType
                "species" -> species
                else -> ageOfTracks
            } },
            onSelected = { field, value -> when (field) {
                "sign" -> signType = value
                "species_type" -> { speciesType = value; species = null }
                "species" -> species = value
                else -> ageOfTracks = value
            } },
            onDismiss = { openSheet = null }
        )
    }
}
