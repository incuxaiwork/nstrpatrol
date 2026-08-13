package com.nstrpatrol.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nstrpatrol.app.data.db.PatrolPointEntity
import com.nstrpatrol.app.data.db.PatrolSessionEntity
import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.data.map.BackendApiClient
import com.nstrpatrol.app.ui.components.ActivityRings
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.components.SectionHeader
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.ErrorRed
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.MapCanvas
import com.nstrpatrol.app.ui.theme.MapGridLine
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.OutlineSoft
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

@Composable
fun PatrolReportScreen(
    patrolId: String,
    onBack: () -> Unit,
    onTabSelected: (BottomTab) -> Unit,
    dao: TelemetryDao,
    api: BackendApiClient,
    onEndPatrol: (() -> Unit)? = null
) {
    var session by remember { mutableStateOf<PatrolSessionEntity?>(null) }
    var points by remember { mutableStateOf(emptyList<PatrolPointEntity>()) }
    var totalDistance by remember { mutableStateOf(0.0) }
    var moveMinutes by remember { mutableStateOf(0) }
    var showEndConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(patrolId) {
        val local = dao.patrolSession(patrolId)
        if (local != null) {
            session = local
            points = dao.patrolPointsOrdered(patrolId)
            totalDistance = computeReportDistance(points)
            moveMinutes = dao.activeMovementSamplesForPatrol(patrolId) * 5 / 60
        } else {
            // No local record (e.g. patrol created on another device): pull from backend.
            runCatching {
                val obj = withContext(Dispatchers.IO) { api.getJson("/api/patrols/$patrolId") } ?: return@LaunchedEffect
                val stats = obj.optJSONObject("stats")
                val distanceKm = stats?.optDouble("distanceKm", 0.0) ?: 0.0
                val durationSeconds = stats?.optDouble("durationSeconds", 0.0) ?: 0.0
                totalDistance = distanceKm * 1000
                moveMinutes = (durationSeconds / 60).toInt()
                session = patrolSessionFromBackend(obj)
                // Draw the route from server points for patrols recorded elsewhere.
                points = api.getPatrolPoints(patrolId)
                if (points.size >= 2) {
                    totalDistance = computeReportDistance(points)
                }
            }
        }
    }

    val s = session
    val dateFormat = remember { SimpleDateFormat("dd MMM yyyy, HH:mm", Locale.US) }

    NstrScaffold(
        title = "Patrol Report",
        subtitle = s?.patrolType ?: "Loading...",
        onBack = onBack,
        activeTab = BottomTab.Patrol,
        onTabSelected = onTabSelected
    ) {
        Spacer(Modifier.height(12.dp))

        Column(
            modifier = Modifier
        ) {
            if (onEndPatrol != null) {
                Button(
                    onClick = { showEndConfirm = true },
                    colors = ButtonDefaults.buttonColors(containerColor = ErrorRed),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("End Patrol", color = Color.White, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(12.dp))
            }

            // Route map
            SectionHeader(text = "Route")
            Spacer(Modifier.height(8.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(240.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(MapCanvas)
            ) {
                Canvas(modifier = Modifier.matchParentSize()) {
                    var x = 32.dp.toPx()
                    while (x < size.width) {
                        drawLine(MapGridLine, Offset(x, 0f), Offset(x, size.height), 1.dp.toPx())
                        x += 57.dp.toPx()
                    }
                    var y = 0f
                    while (y < size.height) {
                        drawLine(MapGridLine, Offset(0f, y), Offset(size.width, y), 1.dp.toPx())
                        y += 72.dp.toPx()
                    }

                    if (points.size >= 2) {
                        val path = Path()
                        val minLat = points.minOf { it.latitude }
                        val maxLat = points.maxOf { it.latitude }
                        val minLon = points.minOf { it.longitude }
                        val maxLon = points.maxOf { it.longitude }
                        val latRange = (maxLat - minLat).coerceAtLeast(0.0001)
                        val lonRange = (maxLon - minLon).coerceAtLeast(0.0001)
                        val pad = 32.dp.toPx()

                        points.forEachIndexed { index, point ->
                            val px = pad + ((point.longitude - minLon) / lonRange *
                                (size.width - pad * 2)).toFloat()
                            val py = pad + ((maxLat - point.latitude) / latRange *
                                (size.height - pad * 2)).toFloat()
                            if (index == 0) path.moveTo(px, py) else path.lineTo(px, py)
                        }
                        drawPath(path, ForestGreen, style = Stroke(width = 3.dp.toPx()))

                        // Start marker
                        val first = points.first()
                        val sx = pad + ((first.longitude - minLon) / lonRange *
                            (size.width - pad * 2)).toFloat()
                        val sy = pad + ((maxLat - first.latitude) / latRange *
                            (size.height - pad * 2)).toFloat()
                        drawCircle(Color(0xFF4CAF50), 6.dp.toPx(), Offset(sx, sy))

                        // End marker
                        val last = points.last()
                        val ex = pad + ((last.longitude - minLon) / lonRange *
                            (size.width - pad * 2)).toFloat()
                        val ey = pad + ((maxLat - last.latitude) / latRange *
                            (size.height - pad * 2)).toFloat()
                        drawCircle(ForestGreen, 8.dp.toPx(), Offset(ex, ey))
                        drawCircle(Color.White, 4.dp.toPx(), Offset(ex, ey))
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            // Summary stats
            SectionHeader(text = "Summary")
            Spacer(Modifier.height(8.dp))

            val distText = if (totalDistance >= 1000) String.format("%.1f km", totalDistance / 1000)
            else String.format("%.0f m", totalDistance)

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                ReportStatCard("Distance", distText, Modifier.weight(1f))
                ReportStatCard("Steps", "${s?.totalSteps ?: 0}", Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                ReportStatCard("Duration", formatDuration(s?.startTime, s?.endTime), Modifier.weight(1f))
                ReportStatCard("Avg speed", String.format("%.1f km/h", s?.avgSpeedKmh ?: 0.0), Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                ReportStatCard("Move min", "$moveMinutes", Modifier.weight(1f))
                ReportStatCard("GPS points", "${s?.pointCount ?: points.size}", Modifier.weight(1f))
            }

            Spacer(Modifier.height(16.dp))

            // Activity rings
            SectionHeader(text = "Activity")
            Spacer(Modifier.height(8.dp))
            ActivityRings(
                steps = s?.totalSteps ?: 0,
                stepsGoal = 10000,
                moveMinutes = moveMinutes,
                moveGoal = 60,
                calories = s?.caloriesEstimate ?: 0.0,
                calGoal = 500
            )

            Spacer(Modifier.height(16.dp))

            // Team details
            SectionHeader(text = "Team details")
            Spacer(Modifier.height(8.dp))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
                    .background(Surface)
                    .padding(14.dp)
            ) {
                DetailRow("Patrol type", s?.patrolType ?: "—")
                DetailRow("Method", s?.patrolMethod ?: "—")
                DetailRow("Beat", s?.beat ?: "—")
                DetailRow("Team leader", s?.teamLeader ?: "—")
                DetailRow("Armed status", s?.armedStatus ?: "—")
                DetailRow("Members", "${s?.memberCount ?: 0}")
            }

            if (s?.startTime != null) {
                Spacer(Modifier.height(16.dp))
                SectionHeader(text = "Timing")
                Spacer(Modifier.height(8.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
                        .background(Surface)
                        .padding(14.dp)
                ) {
                    DetailRow("Start time", dateFormat.format(Date(s.startTime)))
                    if (s.endTime != null) {
                        DetailRow("End time", dateFormat.format(Date(s.endTime)))
                    }
                    DetailRow("Sync status", s.syncStatus)
                }
            }

            Spacer(Modifier.height(24.dp))
        }

        if (showEndConfirm) {
            AlertDialog(
                onDismissRequest = { showEndConfirm = false },
                title = { Text("End patrol?") },
                text = {
                    Text(
                        "This stops live tracking and finalizes the patrol report. " +
                            "The patrol will move to Completed and sync to the server."
                    )
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            showEndConfirm = false
                            onEndPatrol?.invoke()
                        }
                    ) { Text("End patrol", color = ErrorRed) }
                },
                dismissButton = {
                    TextButton(onClick = { showEndConfirm = false }) { Text("Cancel") }
                }
            )
        }
    }
}

@Composable
private fun ReportStatCard(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
            .background(Surface)
            .padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(text = value, color = ForestGreen, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(2.dp))
        Text(text = label, color = TextSecondary, fontSize = 12.sp)
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, color = TextSecondary, fontSize = 13.sp)
        Text(text = value, color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}

private fun formatDuration(startMs: Long?, endMs: Long?): String {
    if (startMs == null) return "—"
    val end = endMs ?: System.currentTimeMillis()
    val totalSec = (end - startMs) / 1000
    val h = totalSec / 3600
    val m = (totalSec % 3600) / 60
    return if (h > 0) "${h}h ${m}m" else "${m}m"
}

private fun computeReportDistance(points: List<PatrolPointEntity>): Double {
    if (points.size < 2) return 0.0
    var total = 0.0
    for (i in 1 until points.size) {
        val p1 = points[i - 1]
        val p2 = points[i]
        val dLat = Math.toRadians(p2.latitude - p1.latitude)
        val dLon = Math.toRadians(p2.longitude - p1.longitude)
        val a = kotlin.math.sin(dLat / 2).let { it * it } +
            kotlin.math.cos(Math.toRadians(p1.latitude)) *
            kotlin.math.cos(Math.toRadians(p2.latitude)) *
            kotlin.math.sin(dLon / 2).let { it * it }
        val c = 2 * kotlin.math.atan2(kotlin.math.sqrt(a), kotlin.math.sqrt(1 - a))
        total += 6_371_000.0 * c
    }
    return total
}

/** Builds a display-only session from a backend patrol detail payload. */
private fun patrolSessionFromBackend(o: org.json.JSONObject): PatrolSessionEntity {
    val startedMs = parseIsoMillis(o.optString("startedAt"))
    val endedMs = o.optString("endedAt").takeIf { it.isNotEmpty() }?.let { parseIsoMillis(it) }
    val stats = o.optJSONObject("stats")
    val distanceKm = stats?.optDouble("distanceKm", 0.0) ?: 0.0
    val durationSeconds = stats?.optDouble("durationSeconds", 0.0) ?: 0.0
    val steps = stats?.optInt("points", 0) ?: 0
    val avgSpeed = if (durationSeconds > 0) (distanceKm / (durationSeconds / 3600.0)) else 0.0
    return PatrolSessionEntity(
        patrolId = o.optString("id"),
        startTime = startedMs,
        endTime = endedMs,
        status = o.optString("status", "COMPLETED"),
        patrolType = o.optString("type").ifEmpty { null },
        totalDistanceMeters = distanceKm * 1000,
        moveMinutes = (durationSeconds / 60).toInt(),
        totalSteps = steps,
        avgSpeedKmh = avgSpeed,
        pointCount = steps,
        syncStatus = "SYNCED"
    )
}

private fun parseIsoMillis(iso: String): Long {
    if (iso.isEmpty()) return System.currentTimeMillis()
    val patterns = listOf(
        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
        "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
        "yyyy-MM-dd'T'HH:mm:ssXXX"
    )
    for (pattern in patterns) {
        runCatching {
            val sdf = SimpleDateFormat(pattern, Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
            return sdf.parse(iso)!!.time
        }
    }
    return System.currentTimeMillis()
}
