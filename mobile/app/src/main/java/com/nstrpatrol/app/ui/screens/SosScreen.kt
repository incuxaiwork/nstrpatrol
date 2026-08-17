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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.nstrpatrol.app.data.map.BackendApiClient
import com.nstrpatrol.app.ui.components.NstrScaffold
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.nstrpatrol.app.ui.components.SectionHeader
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.ErrorRed
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary

@Composable
fun SosScreen(
    api: BackendApiClient,
    onTabSelected: (BottomTab) -> Unit
) {
    var contacts by remember { mutableStateOf(emptyList<EmergencyContact>()) }
    var loading by remember { mutableStateOf(true) }

    // Real emergency contacts come from the backend (no hardcoded list). Best-effort
    // fetch; an offline/error state just shows an empty list.
    LaunchedEffect(Unit) {
        loading = true
        try {
            val arr = withContext(Dispatchers.IO) { api.getJsonArray("/api/contacts") }
            contacts = parseContacts(arr)
        } catch (_: Exception) {
            // Keep whatever we have (empty if first load).
        } finally {
            loading = false
        }
    }

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
                if (contacts.isEmpty()) {
                    Text(
                        text = stringResource(R.string.sos_no_contacts),
                        color = TextSecondary,
                        fontSize = 13.sp
                    )
                } else {
                    contacts.forEach { contact ->
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
}

private data class EmergencyContact(val name: String, val subtitle: String)

private fun parseContacts(arr: org.json.JSONArray?): List<EmergencyContact> {
    val out = mutableListOf<EmergencyContact>()
    if (arr == null) return out
    for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i) ?: continue
        val name = o.optString("name").ifEmpty { o.optString("label") }.ifEmpty { continue }
        val subtitle = o.optString("phone").ifEmpty {
            o.optString("designation").ifEmpty { o.optString("role") }
        }
        out.add(EmergencyContact(name, subtitle.ifEmpty { "—" }))
    }
    return out
}
