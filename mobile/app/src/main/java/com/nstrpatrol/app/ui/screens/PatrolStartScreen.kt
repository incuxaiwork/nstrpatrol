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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
import com.nstrpatrol.app.ui.components.Stepper
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.SurfaceMuted
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary
import kotlinx.coroutines.launch

@Composable
fun PatrolStartScreen(
    onSave: () -> Unit,
    onBack: () -> Unit,
    onTabSelected: (BottomTab) -> Unit,
    onOpenCamera: (String) -> Unit = {},
    patrolTimer: PatrolTimer,
    dao: TelemetryDao
) {
    var patrolType by remember { mutableStateOf<String?>(null) }
    var patrolMethod by remember { mutableStateOf<String?>(null) }
    var beat by remember { mutableStateOf<String?>(null) }
    var memberName by remember { mutableStateOf<String?>(null) }
    var teamLeader by remember { mutableStateOf<String?>(null) }
    var armed by remember { mutableStateOf("Armed") }
    var armUsed by remember { mutableStateOf<String?>(null) }
    var memberCount by remember { mutableIntStateOf(0) }
    var openSheet by remember { mutableStateOf<String?>(null) }
    val photoSlot = "patrol_start"
    val photoPaths by remember { mutableStateOf(PhotoStore.paths(photoSlot)) }
    val scope = rememberCoroutineScope()

    Box {
        NstrScaffold(
            title = "Start Patrol",
            subtitle = "Patrolling team details",
            onBack = onBack,
            activeTab = BottomTab.Patrol,
            onTabSelected = onTabSelected
        ) {
            Spacer(Modifier.height(12.dp))
            SectionHeader(text = "Patrol team")
            Spacer(Modifier.height(8.dp))
            PhotoPlaceholder(
                actionText = "Take photo",
                hint = "Add a photo of your patrolling team",
                photoPaths = photoPaths,
                onClick = { onOpenCamera(photoSlot) }
            )

            Spacer(Modifier.height(16.dp))
            SectionHeader(text = "Patrol details")
            Spacer(Modifier.height(8.dp))

            FieldLabel(text = "Patrol Type")
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Patrol Type",
                value = patrolType,
                onClick = { openSheet = "patrol_type" }
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Patrol Method")
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Patrol Method",
                value = patrolMethod,
                onClick = { openSheet = "patrol_method" }
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Select Beat")
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Beat",
                value = beat,
                onClick = { openSheet = "beat" }
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Member Name")
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Member Name",
                value = memberName,
                onClick = { openSheet = "member" }
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Designation")
            Spacer(Modifier.height(4.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
                    .background(SurfaceMuted)
                    .padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "—",
                    color = TextSecondary,
                    fontSize = 14.sp
                )
            }

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Select Team Leader")
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Choose team member",
                value = teamLeader,
                onClick = { openSheet = "team_leader" }
            )

            Spacer(Modifier.height(12.dp))
            FieldLabel(text = "Armed Status")
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
            FieldLabel(text = "Arm Used")
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Arm Type",
                value = armUsed,
                onClick = { openSheet = "arm" }
            )

            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(androidx.compose.ui.graphics.Color.White)
                    .padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Total Members Added",
                    color = TextPrimary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.weight(1f)
                )
                Stepper(
                    value = memberCount,
                    onMinus = { if (memberCount > 0) memberCount-- },
                    onPlus = { memberCount++ }
                )
            }

            Spacer(Modifier.height(20.dp))
            PrimaryButton(text = "SAVE DETAILS", onClick = {
                val pid = patrolTimer.patrolId
                if (pid != null) {
                    scope.launch {
                        dao.upsertPatrolSession(
                            PatrolSessionEntity(
                                patrolId = pid,
                                startTime = patrolTimer.trustedNow(),
                                patrolType = patrolType,
                                patrolMethod = patrolMethod,
                                beat = beat,
                                teamLeader = teamLeader,
                                armedStatus = armed,
                                memberCount = memberCount
                            )
                        )
                    }
                }
                onSave()
            }, textSize = 15, textWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
        }

        val sheet = openSheet
        if (sheet != null) {
            val title = when (sheet) {
                "patrol_type" -> "Patrol Type"
                "patrol_method" -> "Patrol Method"
                "beat" -> "Select Beat"
                "member" -> "Member Name"
                "team_leader" -> "Team Leader"
                else -> "Arm Used"
            }
            val options = when (sheet) {
                "patrol_type" -> Options.patrolTypes
                "patrol_method" -> Options.patrolMethods
                "beat" -> Options.beats
                "member" -> Options.memberNames
                "team_leader" -> Options.teamLeaders
                else -> Options.armTypes
            }
            val selected = when (sheet) {
                "patrol_type" -> patrolType
                "patrol_method" -> patrolMethod
                "beat" -> beat
                "member" -> memberName
                "team_leader" -> teamLeader
                else -> armUsed
            }
            val onSelected: (String) -> Unit = when (sheet) {
                "patrol_type" -> { v -> patrolType = v }
                "patrol_method" -> { v -> patrolMethod = v }
                "beat" -> { v -> beat = v }
                "member" -> { v -> memberName = v }
                "team_leader" -> { v -> teamLeader = v }
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
