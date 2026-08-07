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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nstrpatrol.app.data.Options
import com.nstrpatrol.app.data.PhotoStore
import com.nstrpatrol.app.ui.components.AutoCapturedPanel
import com.nstrpatrol.app.ui.components.FieldLabel
import com.nstrpatrol.app.ui.components.FormSheet
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.components.PhotoPlaceholder
import com.nstrpatrol.app.ui.components.PrimaryButton
import com.nstrpatrol.app.ui.components.RadioRow
import com.nstrpatrol.app.ui.components.RemarksField
import com.nstrpatrol.app.ui.components.SectionHeader
import com.nstrpatrol.app.ui.components.SelectField
import com.nstrpatrol.app.ui.components.SeverityControl
import com.nstrpatrol.app.ui.navigation.BottomTab

@Composable
fun WaterSourceScreen(
    onBack: () -> Unit,
    onTabSelected: (BottomTab) -> Unit,
    onOpenCamera: (String) -> Unit = {}
) {
    var sourceType by remember { mutableStateOf<String?>(null) }
    var dry by remember { mutableStateOf("Yes") }
    var percent by remember { mutableStateOf<String?>(null) }
    var quality by remember { mutableStateOf<String?>(null) }
    var humanPresence by remember { mutableStateOf("Yes") }
    var humanSign by remember { mutableStateOf<String?>(null) }
    var animalPresence by remember { mutableStateOf("Yes") }
    var animalSign by remember { mutableStateOf<String?>(null) }
    var speciesType by remember { mutableStateOf<String?>(null) }
    var species by remember { mutableStateOf<String?>(null) }
    var severity by remember { mutableStateOf("Low") }
    var remarks by remember { mutableStateOf("") }
    var openSheet by remember { mutableStateOf<String?>(null) }
    val photoSlot = "water_source"
    val photoPaths by remember { mutableStateOf(PhotoStore.paths(photoSlot)) }

    val titles = mapOf(
        "source_type" to "Water Source Type",
        "percent" to "Percent Filled (%)",
        "quality" to "Quality",
        "human_sign" to "Human Sign Observed",
        "animal_sign" to "Animal Sign Observed",
        "species_type" to "Species Type",
        "species" to "Species"
    )
    val options = mapOf(
        "source_type" to Options.waterSourceTypes,
        "percent" to (10..100 step 10).map { "$it%" },
        "quality" to Options.waterQuality,
        "human_sign" to Options.humanSigns,
        "animal_sign" to Options.animalSigns,
        "species_type" to Options.speciesTypes,
        "species" to (speciesType?.let { Options.speciesByType[it] } ?: emptyList())
    )

    Box {
        NstrScaffold(
            title = "Water Source",
            subtitle = "Water source details",
            onBack = onBack,
            activeTab = BottomTab.Patrol,
            onTabSelected = onTabSelected
        ) {
            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Water Source Photo", required = true)
            Spacer(Modifier.height(8.dp))
            PhotoPlaceholder(
                actionText = "Take photo",
                hint = "Open camera to capture the impact",
                photoPaths = photoPaths,
                onClick = { onOpenCamera(photoSlot) }
            )

            Spacer(Modifier.height(16.dp))
            SectionHeader(text = "Water source")
            Spacer(Modifier.height(8.dp))

            FieldLabel(text = "Water Source Type", required = true)
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Water Source Type",
                value = sourceType,
                onClick = { openSheet = "source_type" }
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Dry", required = true)
            Spacer(Modifier.height(4.dp))
            RadioRow(label = "Dry", selected = dry, onSelect = { dry = it })

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Percent Filled (%)", required = true)
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Enter Percentage",
                value = percent,
                onClick = { openSheet = "percent" }
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Quality", required = true)
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Quality",
                value = quality,
                onClick = { openSheet = "quality" }
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Unwanted Human Presence", required = true)
            Spacer(Modifier.height(4.dp))
            RadioRow(label = "Human Presence", selected = humanPresence, onSelect = { humanPresence = it })

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Human Sign Observed", required = true)
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Human Sign",
                value = humanSign,
                onClick = { openSheet = "human_sign" }
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Animal Presence", required = true)
            Spacer(Modifier.height(4.dp))
            RadioRow(label = "Animal Presence", selected = animalPresence, onSelect = { animalPresence = it })

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Animal Sign Observed", required = true)
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Animal Sign",
                value = animalSign,
                onClick = { openSheet = "animal_sign" }
            )

            Spacer(Modifier.height(16.dp))
            SectionHeader(text = "Species")
            Spacer(Modifier.height(8.dp))

            FieldLabel(text = "Species Type")
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Species Type",
                value = speciesType,
                onClick = { openSheet = "species_type" }
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Species")
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Species",
                value = species,
                onClick = { openSheet = "species" }
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
            PrimaryButton(text = "SAVE DETAILS", onClick = onBack, textSize = 15, textWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
        }

        FormSheet(
            openSheet = openSheet,
            titles = titles,
            options = options,
            selected = { when (it) {
                "source_type" -> sourceType
                "percent" -> percent
                "quality" -> quality
                "human_sign" -> humanSign
                "animal_sign" -> animalSign
                "species_type" -> speciesType
                else -> species
            } },
            onSelected = { field, value -> when (field) {
                "source_type" -> sourceType = value
                "percent" -> percent = value
                "quality" -> quality = value
                "human_sign" -> humanSign = value
                "animal_sign" -> animalSign = value
                "species_type" -> { speciesType = value; species = null }
                else -> species = value
            } },
            onDismiss = { openSheet = null }
        )
    }
}
