package com.nstrpatrol.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
import com.nstrpatrol.app.ui.components.SegmentedControl
import com.nstrpatrol.app.ui.components.SeverityControl
import com.nstrpatrol.app.ui.components.Stepper
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextSecondary

@Composable
fun AnimalMortalityScreen(
    onBack: () -> Unit,
    onTabSelected: (BottomTab) -> Unit,
    onOpenCamera: (String) -> Unit = {},
    patrolTimer: PatrolTimer,
    dao: TelemetryDao,
    api: BackendApiClient
) {
    val context = LocalContext.current
    var speciesType by remember { mutableStateOf<String?>(null) }
    var species by remember { mutableStateOf<String?>(null) }
    var causeOfDeath by remember { mutableStateOf<String?>(null) }
    var carcassState by remember { mutableStateOf<String?>(null) }
    var severity by remember { mutableStateOf("Low") }
    var remarks by remember { mutableStateOf("") }
    var sex by remember { mutableStateOf("MALE") }
    var adultMale by remember { mutableIntStateOf(0) }
    var subAdultMale by remember { mutableIntStateOf(0) }
    var youngMale by remember { mutableIntStateOf(0) }
    var openSheet by remember { mutableStateOf<String?>(null) }
    val photoSlot = "animal_mortality"
    val photoPaths by remember { mutableStateOf(PhotoStore.paths(photoSlot)) }

    val titles = mapOf(
        "species_type" to "Species Type",
        "species" to "Species",
        "cause" to "Probable Cause of Death",
        "carcass" to "Carcass State"
    )
    val options = mapOf(
        "species_type" to Options.speciesTypes,
        "species" to (speciesType?.let { Options.speciesByType[it] } ?: emptyList()),
        "cause" to Options.causeOfDeath,
        "carcass" to Options.carcassState
    )

    Box {
        NstrScaffold(
            title = "Animal Mortality",
            subtitle = "Animal mortality details",
            onBack = onBack,
            activeTab = BottomTab.Patrol,
            onTabSelected = onTabSelected
        ) {
            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Animal Photo", required = true)
            Spacer(Modifier.height(8.dp))
            PhotoPlaceholder(
                actionText = "Take photo",
                hint = "Open camera to capture the impact",
                photoPaths = photoPaths,
                onClick = { onOpenCamera(photoSlot) }
            )

            Spacer(Modifier.height(16.dp))
            SectionHeader(text = "Animal details")
            Spacer(Modifier.height(8.dp))

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

            Spacer(Modifier.height(16.dp))
            SectionHeader(text = "Carcass details")
            Spacer(Modifier.height(8.dp))

            FieldLabel(text = "Probable Cause of Death", required = true)
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Cause of Death",
                value = causeOfDeath,
                onClick = { openSheet = "cause" }
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Carcass State", required = true)
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Carcass State",
                value = carcassState,
                onClick = { openSheet = "carcass" }
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Severity")
            Spacer(Modifier.height(4.dp))
            SeverityControl(selected = severity, onSelect = { severity = it })

            Spacer(Modifier.height(16.dp))
            SectionHeader(text = "Count details")
            Spacer(Modifier.height(8.dp))

            Text(
                text = "Sex Selection",
                color = TextSecondary,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium
            )
            Spacer(Modifier.height(8.dp))
            SegmentedControl(
                options = listOf("MALE", "FEMALE", "UNKNOWN"),
                selected = sex,
                onSelect = { sex = it },
                selectedColor = Color(0xFF1E4620),
                height = 32,
                containerColor = Color(0xFFEEEEEE)
            )

            Spacer(Modifier.height(12.dp))
            CountRow(label = "Male Count Details", value = adultMale, onMinus = { if (adultMale > 0) adultMale-- }, onPlus = { adultMale++ })
            Spacer(Modifier.height(8.dp))
            CountRow(label = "Sub Adult Male Count Details", value = subAdultMale, onMinus = { if (subAdultMale > 0) subAdultMale-- }, onPlus = { subAdultMale++ })
            Spacer(Modifier.height(8.dp))
            CountRow(label = "Young Male Count Details", value = youngMale, onMinus = { if (youngMale > 0) youngMale-- }, onPlus = { youngMale++ })

            Spacer(Modifier.height(16.dp))
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
                    type = "ANIMAL_MORTALITY", title = species ?: "Animal Mortality",
                    description = remarks.ifEmpty { null },
                    severity = severity,
                    details = mapOf(
                        "speciesType" to speciesType,
                        "species" to species,
                        "causeOfDeath" to causeOfDeath,
                        "carcassState" to carcassState,
                        "sex" to sex,
                        "adultMale" to adultMale,
                        "subAdultMale" to subAdultMale,
                        "youngMale" to youngMale
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
                "species_type" -> speciesType
                "species" -> species
                "cause" -> causeOfDeath
                else -> carcassState
            } },
            onSelected = { field, value -> when (field) {
                "species_type" -> { speciesType = value; species = null }
                "species" -> species = value
                "cause" -> causeOfDeath = value
                else -> carcassState = value
            } },
            onDismiss = { openSheet = null }
        )
    }
}

@Composable
private fun CountRow(
    label: String,
    value: Int,
    onMinus: () -> Unit,
    onPlus: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
            .background(Surface)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            color = TextSecondary,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.weight(1f)
        )
        Stepper(value = value, onMinus = onMinus, onPlus = onPlus)
    }
}
