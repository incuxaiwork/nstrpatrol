package com.nstrpatrol.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nstrpatrol.app.data.PatrolState
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import com.nstrpatrol.app.AppConfig
import com.nstrpatrol.app.data.IndiaTime
import com.nstrpatrol.app.data.db.MovementSample
import com.nstrpatrol.app.data.db.PatrolPointEntity
import com.nstrpatrol.app.data.db.PatrolSessionEntity
import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.data.map.BackendApiClient
import com.nstrpatrol.app.time.ActivitySummary
import com.nstrpatrol.app.time.MovementMode
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
import android.graphics.Color as AndroidColor
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.nstrpatrol.app.data.map.MbtilesServer
import kotlinx.coroutines.Dispatchers
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.RasterLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.android.style.sources.RasterSource
import org.maplibre.android.style.sources.TileSet
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
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
    var backendSession by remember { mutableStateOf<PatrolSessionEntity?>(null) }
    var backendPoints by remember { mutableStateOf(emptyList<PatrolPointEntity>()) }
    var backendStatsModes by remember { mutableStateOf(emptyList<Pair<String, Int>>()) }
    var moveMinutes by remember { mutableStateOf(0) }

    // Live GPS speed for the in-progress report: the telemetry StateFlow emits
    // on every location fix, so this recomposes the speed card in real time
    // while travelling (falls back to 0 when no fix is fresh).
    val liveSpeedKmh: Double = run {
        val graph = PatrolState.telemetryGraph(LocalContext.current)
        val t by graph.telemetry.telemetry.collectAsStateWithLifecycle()
        val gps = t.speedMps
        if (gps != null && gps >= 0.28f) (gps * 3.6).coerceAtMost(160.0) else 0.0
    }
    var estimatedSteps by remember { mutableStateOf<Int?>(null) }
    var locallyEnded by remember { mutableStateOf(false) }
    var showEndConfirm by remember { mutableStateOf(false) }
    var movementSegments by remember { mutableStateOf(emptyList<MovementSegment>()) }
    var fullscreenMap by remember { mutableStateOf(false) }

    // Reactive: the session row may not exist yet when this screen opens (the
    // start screen writes it asynchronously, and TelemetryRecorder inserts with
    // INSERT OR IGNORE), so observe it as a flow instead of a one-shot load.
    val localSession by dao.patrolSessionFlow(patrolId)
        .collectAsStateWithLifecycle(null)
    val localPoints by dao.patrolPointsFlow(patrolId)
        .collectAsStateWithLifecycle(emptyList())

    // Merged point set (local recording wins; cloud-pulled otherwise). Needed
    // by the metric effects below, so it is defined before them.
    val points = localPoints.ifEmpty { backendPoints }

    // Exact timeline of movement: consecutive same-mode samples form a segment
    // with a precise from/to time (readings are recorded once per sampling tick).
    // Keyed on the points flow so a live (in-progress) report keeps updating.
    LaunchedEffect(patrolId, points.size) {
        withContext(Dispatchers.IO) {
            val samples = dao.movementSamplesForPatrol(patrolId)
            movementSegments = buildMovementSegments(samples, AppConfig.METRICS_SAMPLE_INTERVAL_MS)
            val metrics = ActivitySummary.computeForPatrol(patrolId, dao)
            if (metrics.moveMinutes > 0) {
                moveMinutes = metrics.moveMinutes
            }
            // Mode-aware step estimate (real counter > cadence estimate for
            // foot-dominant patrols > zero). Dominance prefers local sensor
            // samples and falls back to the cloud per-mode breakdown — local
            // points/modes are absent for patrols pulled from another device.
            val localDominant = if (samples.isEmpty()) null else ActivitySummary.isVehicleDominant(dao, patrolId)
            estimatedSteps = ActivitySummary.estimateSteps(
                recordedSteps = metrics.steps,
                distanceMeters = computeReportDistance(points),
                localVehicleDominant = localDominant,
                cloudVehicleDominant = ActivitySummary.isCloudVehicleDominant(backendStatsModes)
            )
        }
    }

    LaunchedEffect(patrolId) {
        // Only fall back to the backend when there is no local record at all
        // (e.g. patrol created on another device).
        if (dao.patrolSession(patrolId) == null) {
            runCatching {
                val obj = withContext(Dispatchers.IO) { api.getJson("/api/patrols/$patrolId") }
                    ?: return@LaunchedEffect
                val stats = obj.optJSONObject("stats")
                val durationSeconds = stats?.optDouble("durationSeconds", 0.0) ?: 0.0
                moveMinutes = (durationSeconds / 60).toInt()
                // Per-mode seconds breakdown from the cloud (drives step
                // dominance for patrols recorded on another device). Assigned
                // before the points so it is ready when the metrics effect
                // re-runs on the new point count.
                backendStatsModes = stats?.optJSONArray("modes")?.let { arr ->
                    (0 until arr.length()).mapNotNull { i ->
                        val m = arr.optJSONObject(i) ?: return@mapNotNull null
                        m.optString("mode") to m.optInt("seconds")
                    }
                } ?: emptyList()
                backendSession = patrolSessionFromBackend(obj)
                backendPoints = api.getPatrolPoints(patrolId)
            }
        }
    }

    val session = localSession ?: backendSession
    val totalDistance = computeReportDistance(points)
    val s = session
    val isActive = (s?.status == "ACTIVE" || s?.status == "IN PROGRESS") && !locallyEnded

    // Steps: device-reported total, then the mode-aware estimate computed
    // above; never a blind distance/0.75 fallback.
    val calculatedSteps = estimatedSteps
        ?: if ((s?.totalSteps ?: 0) > 0) s!!.totalSteps else 0

    // Duration source of truth is the telemetry span: session start/end were
    // written by multiple components/clocks and prod has patrols whose stored
    // window (3 s) is wildly shorter than their GPS track (28 min).
    val sessionWindowMs = if (s?.startTime != null && s.endTime != null) s.endTime - s.startTime else null
    val pointsSpanMs = if (points.size >= 2) points.last().timestamp - points.first().timestamp else 0L
    val effectiveDurationMs = maxOf(sessionWindowMs ?: 0L, pointsSpanMs)

    val calculatedMoveMinutes = when {
        moveMinutes > 0 -> moveMinutes
        (s?.moveMinutes ?: 0) > 0 -> s!!.moveMinutes
        effectiveDurationMs > 0 -> {
            val sessionAvgSpeed = s?.avgSpeedKmh?.takeIf { it > 0f }
            val avgSpeed = sessionAvgSpeed
                ?: ((totalDistance / 1000.0) / (effectiveDurationMs / 3_600_000.0))
            if (avgSpeed >= 0.5 && effectiveDurationMs > 0) (effectiveDurationMs / 60_000).toInt() else 0
        }
        else -> 0
    }

    val detectedCategory = patrolMethodCategory(s?.detectedMethod)
    val expectedCategory = patrolMethodCategory(s?.patrolMethod)
    val methodMismatch = isActive &&
        detectedCategory != null &&
        expectedCategory != null &&
        detectedCategory != expectedCategory
    val detectedLabel = s?.detectedMethod ?: "Unknown"

    // Single embedded tile server shared by the inline and fullscreen maps so
    // opening fullscreen doesn't try to re-bind the same port.
    val context = LocalContext.current
    val mbtilesServer = remember { MbtilesServer(context) }
    LaunchedEffect(Unit) {
        withContext(Dispatchers.IO) { mbtilesServer.start() }
    }
    DisposableEffect(Unit) {
        onDispose { mbtilesServer.stop() }
    }

    Box {
        NstrScaffold(
        title = "Patrol Report",
        subtitle = s?.patrolType ?: "",
        onBack = onBack,
        activeTab = BottomTab.Patrol,
        onTabSelected = onTabSelected
    ) {
        Spacer(Modifier.height(12.dp))
            // Priority alert if detected movement doesn't match selected patrol method
            if (methodMismatch) {
                MovementMismatchBanner(
                    detectedLabel = detectedLabel,
                    selectedMethod = s?.patrolMethod ?: "—"
                )
            }

            if (onEndPatrol != null && isActive) {
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
            PatrolTrackMap(
                points = points,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(280.dp),
                mbtilesServer = mbtilesServer,
                onExpand = { fullscreenMap = true }
            )

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
                ReportStatCard("Steps", "$calculatedSteps", Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                ReportStatCard("Duration", formatDurationMillis(effectiveDurationMs), Modifier.weight(1f))
                ReportStatCard("Avg speed", String.format("%.1f km/h", s?.avgSpeedKmh ?: 0.0), Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                ReportStatCard("Move min", "$calculatedMoveMinutes", Modifier.weight(1f))
                // Live GPS speed while travelling; sits at 0.0 when there is
                // no fresh fix (e.g. indoors).
                ReportStatCard("Speed now", String.format("%.1f km/h", liveSpeedKmh), Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                ReportStatCard("GPS points", "${s?.pointCount ?: points.size}", Modifier.weight(1f))
                ReportStatCard("Sync status", s?.syncStatus ?: "—", Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                ReportStatCard("Detected", s?.detectedMethod ?: "—", Modifier.weight(1f))
                ReportStatCard("Avg speed", String.format("%.1f km/h", s?.avgSpeedKmh ?: 0.0), Modifier.weight(1f))
            }

            Spacer(Modifier.height(16.dp))

            // Activity rings
            SectionHeader(text = "Activity")
            Spacer(Modifier.height(8.dp))
            ActivityRings(
                steps = calculatedSteps,
                stepsGoal = 10000,
                moveMinutes = calculatedMoveMinutes,
                moveGoal = 60,
                calories = s?.caloriesEstimate ?: 0.0,
                calGoal = 500
            )

            if (movementSegments.isNotEmpty()) {
                Spacer(Modifier.height(16.dp))
                SectionHeader(text = "Movement breakdown")
                Spacer(Modifier.height(8.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
                        .background(Surface)
                        .padding(14.dp)
                ) {
                    movementSegments.forEach { segment ->
                        MovementBreakdownRow(segment)
                    }
                }
            }

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
                DetailRow("Detected movement", s?.detectedMethod ?: "—")
                DetailRow("Beat", s?.beat ?: "—")
                DetailRow("Armed status", s?.armedStatus ?: "—")
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
                    DetailRow("Start time", IndiaTime.full(s.startTime))
                    if (s.endTime != null) {
                        DetailRow("End time", IndiaTime.full(s.endTime))
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
                            // Reflect ended state immediately so the End Patrol
                            // button + mismatch banner disappear before navigation.
                            locallyEnded = true
                            onEndPatrol?.invoke()
                        }
                    ) { Text("End patrol", color = ErrorRed) }
                },
                dismissButton = {
                    TextButton(onClick = { showEndConfirm = false }) { Text("Cancel") }
                }
            )
        }

        if (fullscreenMap) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black)
            ) {
                PatrolTrackMap(
                    points = points,
                    modifier = Modifier.fillMaxSize(),
                    mbtilesServer = mbtilesServer,
                    showExpandButton = false
                )
                IconButton(
                    onClick = { fullscreenMap = false },
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(8.dp)
                        .background(Color.Black.copy(alpha = 0.5f), CircleShape)
                ) {
                    Icon(Icons.Filled.Close, contentDescription = "Close map", tint = Color.White)
                }
            }
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

@Composable
private fun MovementBreakdownRow(segment: MovementSegment) {
    val icon = when (segment.mode) {
        MovementMode.STILL -> "•"
        MovementMode.WALKING -> "🚶"
        MovementMode.RUNNING -> "🏃"
        MovementMode.CYCLING -> "🚴"
        MovementMode.VEHICLE -> "🚗"
        else -> "•"
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(text = icon, color = TextPrimary, fontSize = 14.sp)
            Spacer(Modifier.width(10.dp))
            Text(
                text = segment.mode.name.lowercase().replaceFirstChar { it.uppercase() },
                color = TextPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = formatMoveDuration(segment.durationMillis),
                color = ForestGreen,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold
            )
        }
        Row(modifier = Modifier.padding(start = 24.dp, top = 2.dp)) {
            Text(
                text = "${formatTime(segment.startTime)} → ${formatTime(segment.endTime)}",
                color = TextSecondary,
                fontSize = 12.sp
            )
        }
    }
}

/** One contiguous run of the same movement mode, with exact from/to times. */
private data class MovementSegment(
    val mode: MovementMode,
    val startTime: Long,
    val endTime: Long
) {
    val durationMillis: Long get() = (endTime - startTime).coerceAtLeast(0)
}

/**
 * Splits timestamped movement samples into contiguous same-mode segments.
 * A segment runs from its first sample until the next different mode (or the
 * last sample plus one sampling tick for the final segment), so the reported
 * intervals tile the patrol's sensor history without gaps.
 */
private fun buildMovementSegments(
    samples: List<MovementSample>,
    sampleIntervalMs: Long
): List<MovementSegment> {
    if (samples.isEmpty()) return emptyList()
    val result = mutableListOf<MovementSegment>()
    var begin = 0
    var i = 1
    while (i <= samples.size) {
        val changed = i == samples.size || samples[i].value != samples[begin].value
        if (changed) {
            val start = samples[begin].timestamp
            val last = samples[i - 1].timestamp
            val end = if (i < samples.size) {
                (samples[i].timestamp - 1).coerceAtLeast(start)
            } else {
                last + sampleIntervalMs
            }
            val mode = MovementMode.fromCode(samples[begin].value)
            if (mode != MovementMode.UNKNOWN && end > start) {
                result += MovementSegment(mode, start, end)
            }
            begin = i
        }
        i++
    }
    return result
}

private fun formatTime(millis: Long): String = IndiaTime.clock(millis)

private fun formatMoveDuration(millis: Long): String {
    val totalSec = millis / 1000
    val h = totalSec / 3600
    val m = (totalSec % 3600) / 60
    val s = totalSec % 60
    return when {
        h > 0 -> "${h}h ${m}m"
        m > 0 -> "${m}m ${s}s"
        else -> "${s}s"
    }
}

private fun formatDuration(startMs: Long?, endMs: Long?): String {
    if (startMs == null) return "—"
    val end = endMs ?: System.currentTimeMillis()
    return formatDurationMillis(end - startMs)
}

private fun formatDurationMillis(durationMs: Long): String {
    if (durationMs <= 0L) return "—"
    val totalSec = durationMs / 1000
    val h = totalSec / 3600
    val m = (totalSec % 3600) / 60
    return if (h > 0) "${h}h ${m}m" else "${m}m"
}

/**
 * Maps a patrol method or detected movement label to a coarse transport
 * category used to detect mismatches. Returns null for methods we can't
 * confidently compare (e.g. Boat / Elephant / Horse / Camel / Aerial).
 */
private fun patrolMethodCategory(method: String?): String? {
    if (method.isNullOrBlank()) return null
    return when (method.trim().lowercase()) {
        "foot" -> "FOOT"
        "cycle" -> "CYCLE"
        "motor cycle", "four wheeler" -> "VEHICLE"
        "walking", "running" -> "FOOT"
        "cycling" -> "CYCLE"
        "vehicle" -> "VEHICLE"
        else -> null
    }
}

@Composable
private fun MovementMismatchBanner(detectedLabel: String, selectedMethod: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(ErrorRed.copy(alpha = 0.12f))
            .border(1.dp, ErrorRed, RoundedCornerShape(8.dp))
            .padding(12.dp)
    ) {
        Text(
            text = "Movement mismatch",
            color = ErrorRed,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = "Detected movement is \"$detectedLabel\" but the selected patrol method is \"$selectedMethod\".",
            color = TextPrimary,
            fontSize = 13.sp
        )
    }
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
    val pointCount = stats?.optInt("points", 0) ?: 0
    val totalSteps = stats?.optInt("steps", 0) ?: 0
    val detectedMethod = o.optString("detectedMethod").ifEmpty { "STILL" }
    val avgSpeed = if (durationSeconds > 0) (distanceKm / (durationSeconds / 3600.0)) else 0.0
    return PatrolSessionEntity(
        patrolId = o.optString("id"),
        startTime = startedMs,
        endTime = endedMs,
        status = o.optString("status", "COMPLETED"),
        patrolType = o.optString("type").ifEmpty { null },
        detectedMethod = detectedMethod,
        totalDistanceMeters = distanceKm * 1000,
        moveMinutes = (durationSeconds / 60).toInt(),
        totalSteps = totalSteps,
        avgSpeedKmh = Math.round(avgSpeed * 10.0) / 10.0,
        pointCount = pointCount,
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

/**
 * Renders the patrol route on a real MapLibre map with a selectable basemap
 * (offline MBTiles atlas / online street / online satellite). The whole track
 * is framed with padding and drawn on top of the basemap. Falls back to a
 * grid canvas if MapLibre fails to initialise.
 */
@Composable
private fun PatrolTrackMap(
    points: List<PatrolPointEntity>,
    modifier: Modifier = Modifier,
    mbtilesServer: MbtilesServer,
    onExpand: (() -> Unit)? = null,
    showExpandButton: Boolean = true
) {
    var baseMap by remember { mutableStateOf(1) }

    val density = LocalDensity.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var mapRef by remember { mutableStateOf<MapLibreMap?>(null) }
    var mapInitError by remember { mutableStateOf(false) }
    var styleReady by remember { mutableStateOf(false) }
    var mapView by remember { mutableStateOf<MapView?>(null) }

    // Keep the line + camera in sync with collected points.
    LaunchedEffect(points, mapRef, styleReady) {
        val map = mapRef ?: return@LaunchedEffect
        map.style?.getSourceAs<GeoJsonSource>("patrol-track-source")
            ?.setGeoJson(buildPatrolTrackPointGeoJson(points))
        map.style?.getSourceAs<GeoJsonSource>("patrol-track-line-source")
            ?.setGeoJson(buildPatrolTrackLineGeoJson(points))
        val paddingPx = with(density) { 56.dp.toPx() }.toInt()
        fitCameraToTrack(map, points, paddingPx)
    }

    // Apply the user-selected basemap once the style is ready.
    LaunchedEffect(baseMap, styleReady) {
        applyBaseMapLayer(mapRef, baseMap)
    }

    Box(modifier = modifier) {
        if (!mapInitError) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    try {
                        MapLibre.getInstance(ctx)
                    } catch (_: Exception) {
                        mapInitError = true
                    }
                    val mv = MapView(ctx)
                    mv.onCreate(null)
                    mapView = mv
                    mv.getMapAsync { map ->
                        mapRef = map
                        map.uiSettings.apply {
                            isZoomGesturesEnabled = true
                            isScrollGesturesEnabled = true
                            isRotateGesturesEnabled = true
                            isTiltGesturesEnabled = true
                            isDoubleTapGesturesEnabled = true
                            isQuickZoomGesturesEnabled = true
                        }
                        val tileUrl = mbtilesServer.tileUrlFormat
                        val tileSet = TileSet("2.1.0", tileUrl)
                        tileSet.minZoom = 1f
                        tileSet.maxZoom = 14f
                        val rasterSource = RasterSource("mbtiles-raster-source", tileSet, 256)

                        val streetTileSet = TileSet(
                            "2.1.0",
                            "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                        )
                        streetTileSet.minZoom = 1f
                        streetTileSet.maxZoom = 19f
                        val streetSource = RasterSource("street-raster-source", streetTileSet, 256)

                        val satelliteTileSet = TileSet(
                            "2.1.0",
                            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        )
                        satelliteTileSet.minZoom = 1f
                        satelliteTileSet.maxZoom = 19f
                        val satelliteSource = RasterSource("satellite-raster-source", satelliteTileSet, 256)

                        val styleJson = "{\"version\":8,\"name\":\"NSTR\",\"sources\":{},\"layers\":[{\"id\":\"background\",\"type\":\"background\",\"paint\":{\"background-color\":\"#e8eaed\"}}]}"
                        map.setStyle(Style.Builder().fromJson(styleJson)) { style ->
                            // Offline atlas is the bottom basemap.
                            style.addSource(rasterSource)
                            style.addLayer(RasterLayer("mbtiles-raster-layer", "mbtiles-raster-source"))
                            // Street + satellite sit above it, toggled by the user.
                            style.addSource(streetSource)
                            style.addLayer(RasterLayer("street-raster-layer", "street-raster-source"))
                            style.addSource(satelliteSource)
                            style.addLayer(RasterLayer("satellite-raster-layer", "satellite-raster-source"))
                            // The patrol track is always rendered on top.
                            style.addSource(GeoJsonSource("patrol-track-source", EMPTY_FC))
                            style.addSource(GeoJsonSource("patrol-track-line-source", EMPTY_FC))
                            // White casing makes the line visible on both light
                            // (street/offline) and dark (satellite) basemaps.
                            style.addLayer(
                                LineLayer("patrol-track-case-layer", "patrol-track-line-source").apply {
                                    setProperties(
                                        PropertyFactory.lineColor(AndroidColor.parseColor("#FFFFFF")),
                                        PropertyFactory.lineWidth(9f),
                                        PropertyFactory.lineOpacity(0.9f),
                                        PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
                                        PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND)
                                    )
                                }
                            )
                            style.addLayer(
                                LineLayer("patrol-track-line-layer", "patrol-track-line-source").apply {
                                    setProperties(
                                        PropertyFactory.lineColor(AndroidColor.parseColor("#2E7BF6")),
                                        PropertyFactory.lineWidth(5f),
                                        PropertyFactory.lineOpacity(0.95f),
                                        PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
                                        PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND)
                                    )
                                }
                            )
                            style.addLayer(
                                CircleLayer("patrol-track-point-layer", "patrol-track-source").apply {
                                    setProperties(
                                        PropertyFactory.circleColor(AndroidColor.parseColor("#2E7BF6")),
                                        PropertyFactory.circleRadius(5f),
                                        PropertyFactory.circleStrokeColor(AndroidColor.parseColor("#FFFFFF")),
                                        PropertyFactory.circleStrokeWidth(2f)
                                    )
                                }
                            )
                            applyBaseMapLayer(mapRef, baseMap)
                            // Draw the track immediately (and again every time
                            // points change via the LaunchedEffect below).
                            map.style?.getSourceAs<GeoJsonSource>("patrol-track-source")
                                ?.setGeoJson(buildPatrolTrackPointGeoJson(points))
                            map.style?.getSourceAs<GeoJsonSource>("patrol-track-line-source")
                                ?.setGeoJson(buildPatrolTrackLineGeoJson(points))
                            styleReady = true
                        }
                    }
                    mv
                },
                update = { }
            )

            // Basemap selector overlay (top-right)
            Row(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(8.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                BasemapChip("Offline", selected = baseMap == 0, onClick = { baseMap = 0 })
                BasemapChip("Street", selected = baseMap == 1, onClick = { baseMap = 1 })
                BasemapChip("Satellite", selected = baseMap == 2, onClick = { baseMap = 2 })
            }

            // Expand-to-fullscreen button (top-left)
            if (showExpandButton && onExpand != null) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(8.dp)
                        .clip(CircleShape)
                        .background(Surface.copy(alpha = 0.92f))
                        .border(1.dp, OutlineCard, CircleShape)
                        .clickable(onClick = onExpand)
                        .size(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Filled.Fullscreen,
                        contentDescription = "Expand map",
                        tint = TextPrimary,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        } else {
            Canvas(modifier = Modifier.fillMaxSize()) {
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
            }
        }
    }

    // Forward the screen lifecycle to the MapView so GL rendering starts/
    // stops correctly (without this the map can render blank/brown).
    DisposableEffect(lifecycleOwner, mapView) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> mapView?.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView?.onPause()
                Lifecycle.Event.ON_DESTROY -> mapView?.onDestroy()
                else -> { }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }
}

@Composable
private fun BasemapChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(
                if (selected) ForestGreen else Surface.copy(alpha = 0.92f)
            )
            .border(1.dp, if (selected) ForestGreen else OutlineCard, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp)
    ) {
        Text(
            text = label,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = if (selected) Color.White else TextPrimary
        )
    }
}

private fun applyBaseMapLayer(map: MapLibreMap?, baseMap: Int) {
    val style = map?.style ?: return
    val offline = if (baseMap == 0) Property.VISIBLE else Property.NONE
    val street = if (baseMap == 1) Property.VISIBLE else Property.NONE
    val satellite = if (baseMap == 2) Property.VISIBLE else Property.NONE
    style.getLayer("mbtiles-raster-layer")?.setProperties(PropertyFactory.visibility(offline))
    style.getLayer("street-raster-layer")?.setProperties(PropertyFactory.visibility(street))
    style.getLayer("satellite-raster-layer")?.setProperties(PropertyFactory.visibility(satellite))
}

/**
 * Fits the camera so the whole track is visible with padding, so the route is
 * never clipped or hidden behind a zoomed-in-tile ("browned-out") view.
 */
private fun fitCameraToTrack(map: MapLibreMap, points: List<PatrolPointEntity>, paddingPx: Int) {
    try {
        when {
            points.size >= 2 -> {
                val builder = LatLngBounds.Builder()
                points.forEach { builder.include(LatLng(it.latitude, it.longitude)) }
                val bounds = builder.build()
                map.easeCamera(CameraUpdateFactory.newLatLngBounds(bounds, paddingPx), 400)
            }
            points.size == 1 -> {
                map.moveCamera(
                    CameraUpdateFactory.newLatLngZoom(
                        LatLng(points.first().latitude, points.first().longitude),
                        15.0
                    )
                )
            }
            else -> {
                map.moveCamera(
                    CameraUpdateFactory.newLatLngZoom(LatLng(15.92, 79.15), 11.8)
                )
            }
        }
    } catch (_: Exception) {
    }
}

private const val EMPTY_FC = "{\"type\":\"FeatureCollection\",\"features\":[]}"
