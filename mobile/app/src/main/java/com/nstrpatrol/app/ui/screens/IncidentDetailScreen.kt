package com.nstrpatrol.app.ui.screens

import com.nstrpatrol.app.R

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.nstrpatrol.app.data.IndiaTime
import com.nstrpatrol.app.data.db.IncidentStatus
import com.nstrpatrol.app.data.db.IncidentEntity
import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.ui.components.AutoCapturedPanel
import com.nstrpatrol.app.ui.components.DetailPanel
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.components.SectionHeader
import com.nstrpatrol.app.ui.components.StatusChip
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.ChipRejected
import com.nstrpatrol.app.ui.theme.ChipResolved
import com.nstrpatrol.app.ui.theme.ChipSubmitted
import com.nstrpatrol.app.ui.theme.ChipVerified
import com.nstrpatrol.app.ui.theme.IncidentRejected
import com.nstrpatrol.app.ui.theme.IncidentResolved
import com.nstrpatrol.app.ui.theme.IncidentSubmitted
import com.nstrpatrol.app.ui.theme.IncidentVerified
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.SeverityHigh
import com.nstrpatrol.app.ui.theme.SeverityLow
import com.nstrpatrol.app.ui.theme.SeverityMedium
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.Locale

/**
 * Full read-only report for an already-reported incident, opened from the
 * "Reported incidents" list on the Reports page.
 */
@Composable
fun IncidentDetailScreen(
    incidentId: String,
    onBack: () -> Unit,
    onTabSelected: (BottomTab) -> Unit,
    dao: TelemetryDao
) {
    var incident by remember { mutableStateOf<IncidentEntity?>(null) }
    LaunchedEffect(incidentId) {
        incident = withContext(Dispatchers.IO) { dao.incidentById(incidentId) }
    }

    val category = incident?.let { incidentCategory(it.type) } ?: "Report"
    NstrScaffold(
        title = categoryLabel(category),
        subtitle = stringResource(R.string.incident_detail_subtitle),
        onBack = onBack,
        activeTab = BottomTab.Reports,
        onTabSelected = onTabSelected
    ) {
        if (incident == null) {
            Spacer(Modifier.height(16.dp))
            Text(text = stringResource(R.string.incident_not_found), color = TextSecondary, fontSize = 14.sp)
            return@NstrScaffold
        }

        val (chipColor, chipBg) = incidentStatusStyle(statusOf(incident!!.status))
        val severity = incident!!.severity
        val severityColor = when (severity.uppercase()) {
            "HIGH" -> SeverityHigh
            "MEDIUM" -> SeverityMedium
            else -> SeverityLow
        }
        val context = androidx.compose.ui.platform.LocalContext.current
        val currentUser = remember { com.nstrpatrol.app.data.AuthSession(context).currentUser }

        val beat = incident!!.detailsJson
            ?.let { runCatching { JSONObject(it).optString("beat").ifEmpty { null } }.getOrNull() }
            ?: "NSTR Main Beat"
        val officer = incident!!.detailsJson
            ?.let { runCatching { JSONObject(it).optString("officer_name").ifEmpty { null } }.getOrNull() }
            ?: currentUser?.fullName
            ?: "Forest Officer"
        val badge = incident!!.detailsJson
            ?.let { runCatching { JSONObject(it).optString("badge_no").ifEmpty { null } }.getOrNull() }
            ?: currentUser?.email
            ?: currentUser?.cader
            ?: "ranger@nstrpatrol.gov.in"
        val accuracyText = incident!!.accuracy?.let { String.format(Locale.US, "%.1f m", it) }
            ?: "4.2 m"
        val gpsText = if (incident!!.latitude != null && incident!!.longitude != null)
            String.format(Locale.US, "%.4f° N, %.4f° E", incident!!.latitude, incident!!.longitude)
        else "16.3194° N, 80.4384° E"
        val timeText = IndiaTime.panel(incident!!.occurredAt)

        val parsedDetails = remember(incident?.detailsJson) {
            val raw = incident?.detailsJson ?: return@remember emptyList<Pair<String, String>>()
            runCatching {
                val obj = JSONObject(raw)
                val list = mutableListOf<Pair<String, String>>()
                val keys = obj.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    if (key == "beat" || key == "photos" || key == "officer_name" || key == "badge_no") continue
                    val value = obj.optString(key)
                    if (value.isNotEmpty() && value != "null") {
                        val formattedKey = key
                            .replace("_", " ")
                            .replace("-", " ")
                            .split(" ")
                            .joinToString(" ") { word -> word.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.US) else it.toString() } }
                        list.add(formattedKey to value)
                    }
                }
                list
            }.getOrDefault(emptyList())
        }

        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatusChip(
                label = statusOf(incident!!.status).label,
                chipColor = chipColor,
                chipBackground = chipBg
            )
            StatusChip(
                label = severity,
                chipColor = severityColor,
                chipBackground = severityColor.copy(alpha = 0.12f)
            )
        }

        Spacer(Modifier.height(20.dp))
        SectionHeader(text = stringResource(R.string.incident_details), color = TextPrimary)
        Spacer(Modifier.height(8.dp))

        val baseRows = listOf(
            stringResource(R.string.incident_report_id) to incident!!.id,
            stringResource(R.string.incident_type) to incident!!.title,
            stringResource(R.string.incident_date_time) to timeText,
            stringResource(R.string.incident_beat) to (beat ?: "—"),
            stringResource(R.string.incident_severity) to severity
        )

        DetailPanel(
            rows = baseRows + parsedDetails
        )

        Spacer(Modifier.height(16.dp))
        SectionHeader(text = stringResource(R.string.incident_remarks), color = TextPrimary)
        Spacer(Modifier.height(8.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
                .background(Surface)
                .padding(14.dp)
        ) {
            Text(
                text = incident!!.description ?: "—",
                color = TextPrimary,
                fontSize = 14.sp,
                lineHeight = 20.sp
            )
        }

        val photoPaths = remember(incident?.photos) {
            val raw = incident?.photos ?: return@remember emptyList<String>()
            if (raw.trim().startsWith("[")) {
                runCatching {
                    val arr = org.json.JSONArray(raw)
                    (0 until arr.length()).mapNotNull { arr.optString(it).ifEmpty { null } }
                }.getOrDefault(emptyList())
            } else {
                raw.split(",").map { it.trim() }.filter { it.isNotEmpty() }
            }
        }

        var selectedPhotoPath by remember { mutableStateOf<String?>(null) }

        if (photoPaths.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            SectionHeader(text = "Photos (${photoPaths.size})", color = TextPrimary)
            Spacer(Modifier.height(8.dp))
            androidx.compose.foundation.lazy.LazyRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(photoPaths.size) { idx ->
                    val path = photoPaths[idx]
                    val bitmap = com.nstrpatrol.app.data.rememberAsyncBitmap(path)
                    if (bitmap != null) {
                        androidx.compose.foundation.Image(
                            bitmap = bitmap,
                            contentDescription = "Incident Photo",
                            modifier = Modifier
                                .size(110.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
                                .clickable { selectedPhotoPath = path },
                            contentScale = androidx.compose.ui.layout.ContentScale.Crop
                        )
                    }
                }
            }
        }

        selectedPhotoPath?.let { path ->
            com.nstrpatrol.app.ui.components.FullScreenImageViewerDialog(
                photoPath = path,
                onDismiss = { selectedPhotoPath = null }
            )
        }

        Spacer(Modifier.height(16.dp))
        SectionHeader(text = stringResource(R.string.incident_captured), color = TextPrimary)
        Spacer(Modifier.height(8.dp))
        AutoCapturedPanel(
            gps = gpsText,
            timestamp = timeText,
            officer = officer,
            badge = badge,
            beat = beat,
            accuracy = accuracyText,
            saved = if (incident!!.syncStatus == "PENDING") stringResource(R.string.common_offline) else stringResource(R.string.logs_synced)
        )

        Spacer(Modifier.height(24.dp))
    }
}

private fun incidentStatusStyle(status: IncidentStatus): Pair<Color, Color> = when (status) {
    IncidentStatus.SUBMITTED -> IncidentSubmitted to ChipSubmitted
    IncidentStatus.VERIFIED -> IncidentVerified to ChipVerified
    IncidentStatus.RESOLVED -> IncidentResolved to ChipResolved
    IncidentStatus.REJECTED -> IncidentRejected to ChipRejected
}
