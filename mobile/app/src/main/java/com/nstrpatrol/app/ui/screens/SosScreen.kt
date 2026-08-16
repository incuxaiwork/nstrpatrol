package com.nstrpatrol.app.ui.screens

import com.nstrpatrol.app.R

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.nstrpatrol.app.data.Contacts
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.components.SectionHeader
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.ErrorRed
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary

@Composable
fun SosScreen(onTabSelected: (BottomTab) -> Unit) {
    NstrScaffold(
        title = stringResource(R.string.sos_title),
        subtitle = stringResource(R.string.sos_subtitle),
        activeTab = BottomTab.Home,
        onTabSelected = onTabSelected
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(16.dp))
            Box(
                modifier = Modifier
                    .size(220.dp)
                    .background(ErrorRed, CircleShape)
                    .clickable { },
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "SOS",
                    color = Color.White,
                    fontSize = 40.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            Spacer(Modifier.height(16.dp))
            Text(
                text = stringResource(R.string.sos_tap),
                color = TextSecondary,
                fontSize = 13.sp,
                textAlign = TextAlign.Center
            )

            Spacer(Modifier.height(24.dp))
            Column(modifier = Modifier.fillMaxWidth()) {
                SectionHeader(text = stringResource(R.string.sos_emergency_contacts))
                Spacer(Modifier.height(8.dp))
                Contacts.list.forEach { contact ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
                            .background(Surface)
                            .padding(horizontal = 14.dp)
                    ) {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = contact.name,
                            color = TextPrimary,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            text = contact.subtitle,
                            color = TextSecondary,
                            fontSize = 12.sp
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
    }
}
