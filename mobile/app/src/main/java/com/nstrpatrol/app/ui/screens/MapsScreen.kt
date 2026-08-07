package com.nstrpatrol.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
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
import com.nstrpatrol.app.data.PatrolTimer
import com.nstrpatrol.app.data.db.PatrolPointEntity
import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.time.GpsTelemetryManager
import com.nstrpatrol.app.time.MovementMode
import com.nstrpatrol.app.ui.components.ActivePatrolOverlay
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.components.SectionHeader
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.MapCanvas
import com.nstrpatrol.app.ui.theme.MapGridLine
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary
import kotlinx.coroutines.delay
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

@Composable
fun MapsScreen(
    onTabSelected: (BottomTab) -> Unit,
    patrolTimer: PatrolTimer,
    telemetryManager: GpsTelemetryManager,
    dao: TelemetryDao,
    onStopPatrol: () -> Unit
) {
    var satellite by remember { mutableStateOf(true) }
    var routes by remember { mutableStateOf(true) }
    var markers by remember { mutableStateOf(true) }

    val isRunning by patrolTimer.running.collectAsStateWithLifecycle()
    var tick by remember { mutableStateOf(0L) }
    LaunchedEffect(isRunning) {
        if (isRunning) {
            while (true) {
                tick++
                delay(5000)
            }
        }
    }
    tick // trigger recomposition

    var patrolPoints by remember { mutableStateOf(emptyList<PatrolPointEntity>()) }
    var totalDistance by remember { mutableStateOf(0.0) }
    var avgSpeed by remember { mutableStateOf(0.0) }
    var moveMinutes by remember { mutableStateOf(0) }

    LaunchedEffect(isRunning, tick) {
        val pid = patrolTimer.patrolId
        if (pid != null && isRunning) {
            patrolPoints = dao.patrolPointsOrdered(pid)
            totalDistance = computeDistance(patrolPoints)
            avgSpeed = if (patrolPoints.size >= 2) {
                val first = patrolPoints.first().timestamp
                val last = patrolPoints.last().timestamp
                val dur = (last - first) / 3_600_000.0
                if (dur > 0) (totalDistance / 1000) / dur else 0.0
            } else 0.0
            moveMinutes = dao.activeMovementSamplesForPatrol(pid) * 5 / 60
        }
    }

    val latestMovement = remember { MovementMode.UNKNOWN }
    LaunchedEffect(tick) {
        // MovementMode reading is available from dao.latestMovementReading()
    }

    NstrScaffold(
        title = "Maps",
        subtitle = if (isRunning) "Patrol in progress" else "Live patrol area",
        activeTab = BottomTab.Maps,
        onTabSelected = onTabSelected
    ) {
        Spacer(Modifier.height(16.dp))

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(360.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(MapCanvas)
        ) {
            Canvas(modifier = Modifier.matchParentSize()) {
                // Grid
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

                // Route polyline from patrol points
                if (patrolPoints.size >= 2) {
                    val path = Path()
                    val minLat = patrolPoints.minOf { it.latitude }
                    val maxLat = patrolPoints.maxOf { it.latitude }
                    val minLon = patrolPoints.minOf { it.longitude }
                    val maxLon = patrolPoints.maxOf { it.longitude }
                    val latRange = (maxLat - minLat).coerceAtLeast(0.0001)
                    val lonRange = (maxLon - minLon).coerceAtLeast(0.0001)
                    val pad = 40.dp.toPx()

                    patrolPoints.forEachIndexed { index, point ->
                        val px = pad + ((point.longitude - minLon) / lonRange *
                            (size.width - pad * 2)).toFloat()
                        val py = pad + ((maxLat - point.latitude) / latRange *
                            (size.height - pad * 2)).toFloat()
                        if (index == 0) path.moveTo(px, py) else path.lineTo(px, py)
                    }

                    drawPath(
                        path = path,
                        color = ForestGreen,
                        style = Stroke(width = 3.dp.toPx())
                    )

                    // Current position marker
                    val last = patrolPoints.last()
                    val lastPx = pad + ((last.longitude - minLon) / lonRange *
                        (size.width - pad * 2)).toFloat()
                    val lastPy = pad + ((maxLat - last.latitude) / latRange *
                        (size.height - pad * 2)).toFloat()
                    drawCircle(ForestGreen, 8.dp.toPx(), Offset(lastPx, lastPy))
                    drawCircle(Color.White, 4.dp.toPx(), Offset(lastPx, lastPy))
                } else {
                    // Placeholder location marker
                    val cx = size.width - 32.dp.toPx()
                    val cy = size.height / 2
                    drawCircle(ForestGreen, 24.dp.toPx(), Offset(cx, cy))
                }
            }
        }

        if (isRunning) {
            Spacer(Modifier.height(12.dp))
            ActivePatrolOverlay(
                distanceMeters = totalDistance,
                avgSpeedKmh = avgSpeed,
                moveMinutes = moveMinutes,
                durationFormatted = patrolTimer.elapsedFormatted(),
                currentMode = MovementMode.UNKNOWN,
                onStopPatrol = onStopPatrol
            )
        } else {
            Spacer(Modifier.height(24.dp))
            SectionHeader(text = "Map layers", color = TextSecondary)
            Spacer(Modifier.height(8.dp))

            MapLayerRow(title = "Satellite view", subtitle = null, checked = satellite, onChecked = { satellite = it })
            Spacer(Modifier.height(8.dp))
            MapLayerRow(title = "Patrol routes", subtitle = "4 active", checked = routes, onChecked = { routes = it })
            Spacer(Modifier.height(8.dp))
            MapLayerRow(title = "Sighting markers", subtitle = null, checked = markers, onChecked = { markers = it })
        }
    }
}

private fun computeDistance(points: List<PatrolPointEntity>): Double {
    if (points.size < 2) return 0.0
    var total = 0.0
    for (i in 1 until points.size) {
        val p1 = points[i - 1]
        val p2 = points[i]
        val dLat = Math.toRadians(p2.latitude - p1.latitude)
        val dLon = Math.toRadians(p2.longitude - p1.longitude)
        val a = sin(dLat / 2).let { it * it } +
            cos(Math.toRadians(p1.latitude)) *
            cos(Math.toRadians(p2.latitude)) *
            sin(dLon / 2).let { it * it }
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        total += 6_371_000.0 * c
    }
    return total
}

@Composable
private fun MapLayerRow(
    title: String,
    subtitle: String?,
    checked: Boolean,
    onChecked: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
            .background(Surface)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            color = TextPrimary,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f)
        )
        if (subtitle != null) {
            Text(text = subtitle, color = TextSecondary, fontSize = 12.sp)
            Spacer(Modifier.size(8.dp))
        }
        Switch(
            checked = checked,
            onCheckedChange = onChecked,
            colors = SwitchDefaults.colors(
                checkedTrackColor = ForestGreen,
                checkedThumbColor = Color.White,
                uncheckedThumbColor = Color(0xFFBDBDBD)
            )
        )
    }
}
