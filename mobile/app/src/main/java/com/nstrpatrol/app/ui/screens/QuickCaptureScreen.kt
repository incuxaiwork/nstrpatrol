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
import com.nstrpatrol.app.ui.components.FieldLabel
import com.nstrpatrol.app.ui.components.FormSheet
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.components.PhotoPlaceholder
import com.nstrpatrol.app.ui.components.PrimaryButton
import com.nstrpatrol.app.ui.components.RemarksField
import com.nstrpatrol.app.ui.components.SelectField
import com.nstrpatrol.app.ui.navigation.BottomTab

@Composable
fun QuickCaptureScreen(
    onBack: () -> Unit,
    onTabSelected: (BottomTab) -> Unit
) {
    var signType by remember { mutableStateOf<String?>(null) }
    var remarks by remember { mutableStateOf("") }
    var openSheet by remember { mutableStateOf<String?>(null) }

    Box {
        NstrScaffold(
            title = "Quick Capture",
            subtitle = "Quick observation capture",
            onBack = onBack,
            activeTab = BottomTab.Home,
            onTabSelected = onTabSelected
        ) {
            Spacer(Modifier.height(12.dp))
            PhotoPlaceholder(actionText = "Take photo", hint = "Capture a photo of the sign")

            Spacer(Modifier.height(16.dp))
            FieldLabel(text = "Sign Type")
            Spacer(Modifier.height(4.dp))
            SelectField(
                placeholder = "Select Sign Type",
                value = signType,
                onClick = { openSheet = "sign" }
            )

            Spacer(Modifier.height(16.dp))
            FieldLabel(text = "Remarks")
            Spacer(Modifier.height(4.dp))
            RemarksField(
                value = remarks,
                onValueChange = { remarks = it },
                placeholder = "Enter Any Remarks Here",
                height = 100
            )

            Spacer(Modifier.height(20.dp))
            PrimaryButton(text = "SAVE DETAILS", onClick = onBack, textSize = 15, textWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
        }

        FormSheet(
            openSheet = openSheet,
            titles = mapOf("sign" to "Sign Type"),
            options = mapOf("sign" to Options.signTypes),
            selected = { signType },
            onSelected = { _, value -> signType = value },
            onDismiss = { openSheet = null }
        )
    }
}
