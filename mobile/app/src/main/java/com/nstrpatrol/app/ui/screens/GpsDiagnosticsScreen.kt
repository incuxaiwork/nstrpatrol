package com.nstrpatrol.app.ui.screens

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nstrpatrol.app.BuildConfig
import com.nstrpatrol.app.time.GnssConstellation
import com.nstrpatrol.app.time.GnssSatellite
import com.nstrpatrol.app.time.GpsTelemetry
import com.nstrpatrol.app.time.GpsTelemetryManager
import com.nstrpatrol.app.time.ModeSource
import com.nstrpatrol.app.time.MovementMode
import com.nstrpatrol.app.time.TelemetryRecorder
import com.nstrpatrol.app.time.TimeIntegrityState
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.LightForest
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

enum class GpsBannerState(val title: String, val color: Color, val icon: ImageVector) {
    Ready("GPS Ready", Color(0xFF2E7D32), Icons.Filled.CheckCircle),
    Searching("Searching for Satellites", Color(0xFFFF8F00), Icons.Filled.Refresh),
    Weak("Weak GPS Signal", Color(0xFFE65100), Icons.Filled.Warning),
    Disabled("Location Disabled", Color(0xFFB3261E), Icons.Filled.Warning),
    Permission("Permission Required", Color(0xFFB3261E), Icons.Filled.Info)
}

@Composable
fun GpsDiagnosticsScreen(
    manager: GpsTelemetryManager,
    recorder: TelemetryRecorder,
    timeState: TimeIntegrityState,
    onBack: () -> Unit,
    onTabSelected: (BottomTab) -> Unit
) {
    val context = LocalContext.current
    val telemetry by manager.telemetry.collectAsStateWithLifecycle()

    var hasPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasPermission = granted
        manager.onPermissionResult(granted)
    }
    LaunchedEffect(Unit) {
        if (!hasPermission) permissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
    }

    var reportVisible by remember { mutableStateOf(false) }

    // 1-second tick so device-clock displays stay live even without a fix.
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1000)
            now = System.currentTimeMillis()
        }
    }

    val bannerState = when {
        !hasPermission && !telemetry.permissionGranted -> GpsBannerState.Permission
        !telemetry.enabled -> GpsBannerState.Disabled
        !telemetry.hasFix -> GpsBannerState.Searching
        (telemetry.horizontalAccuracyMeters ?: Float.MAX_VALUE) > 25f -> GpsBannerState.Weak
        else -> GpsBannerState.Ready
    }

    NstrScaffold(
        title = "GPS Diagnostics",
        subtitle = "GNSS Status & Sensor Verification",
        onBack = onBack,
        activeTab = BottomTab.Settings,
        onTabSelected = onTabSelected
    ) {
        Spacer(Modifier.height(12.dp))

        LiveStatusBanner(state = bannerState, telemetry = telemetry, timeState = timeState)

        Spacer(Modifier.height(16.dp))

        GpsHealthScoreCard(telemetry = telemetry, timeState = timeState)

        Spacer(Modifier.height(16.dp))

        GpsAccuracyCard(telemetry = telemetry)

        Spacer(Modifier.height(16.dp))

        CurrentLocationCard(context = context, telemetry = telemetry, currentDeviceTime = now)

        Spacer(Modifier.height(16.dp))

        SatelliteInformationCard(telemetry = telemetry)

        Spacer(Modifier.height(16.dp))

        GnssConstellationsCard(telemetry = telemetry)

        Spacer(Modifier.height(16.dp))

        SignalStrengthCard(telemetry = telemetry)

        Spacer(Modifier.height(16.dp))

        LiveCompassCard(telemetry = telemetry)

        Spacer(Modifier.height(16.dp))

        MovementModeCard(recorder = recorder)

        Spacer(Modifier.height(16.dp))

        AccuracyCircleMapVisualizer(telemetry = telemetry)

        Spacer(Modifier.height(16.dp))

        GpsStatusChecklistCard(telemetry = telemetry, timeState = timeState)

        Spacer(Modifier.height(16.dp))

        DeviceInformationCard(context = context)

        Spacer(Modifier.height(20.dp))

        Button(
            onClick = { reportVisible = !reportVisible },
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
            shape = RoundedCornerShape(10.dp)
        ) {
            Icon(Icons.Filled.Info, contentDescription = null, tint = Color.White)
            Spacer(Modifier.width(8.dp))
            Text(
                text = if (reportVisible) "HIDE DIAGNOSTIC REPORT" else "GENERATE DIAGNOSTIC REPORT",
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
        }

        AnimatedVisibility(visible = reportVisible) {
            Column {
                Spacer(Modifier.height(12.dp))
                DiagnosticReportCard(context = context, telemetry = telemetry, timeState = timeState)
            }
        }
    }
}

// -----------------------------------------------------------------------------
// Derived values & formatting helpers
// -----------------------------------------------------------------------------
private fun computeSignalQuality(telemetry: GpsTelemetry): Int =
    telemetry.avgCn0?.let { ((it - 20f) / 25f * 100f).coerceIn(0f, 100f).toInt() } ?: 0

private fun computeSatelliteAvailability(telemetry: GpsTelemetry): Int {
    val visible = telemetry.visibleSatellites
    return if (visible == 0) 0 else (telemetry.usedInFix.toFloat() / visible * 100f).toInt()
}

private fun computeTimeSync(timeState: TimeIntegrityState): Int {
    if (timeState.gnssTimeAvailable) {
        return (100 - (timeState.divergenceSeconds.coerceAtMost(60) * 100) / 60).toInt().coerceIn(0, 100)
    }
    return if (timeState.autoTimeEnabled) 60 else 25
}

private fun computeSensorFusion(telemetry: GpsTelemetry): Int {
    val acc = telemetry.horizontalAccuracyMeters
    return if (acc == null) 40 else (100 - (acc / 25f * 40f)).toInt().coerceIn(0, 100)
}

private fun computeHealthScore(telemetry: GpsTelemetry, timeState: TimeIntegrityState): Int =
    (computeSignalQuality(telemetry) + computeSatelliteAvailability(telemetry) +
        computeTimeSync(timeState) + computeSensorFusion(telemetry)) / 4

private fun healthLabel(score: Int): String = when {
    score >= 80 -> "System Optimal"
    score >= 50 -> "Degraded"
    else -> "Poor"
}

private fun accuracyLabel(accuracyMeters: Float?): String = when {
    accuracyMeters == null -> "No Fix"
    accuracyMeters <= 3f -> "Excellent"
    accuracyMeters <= 8f -> "Good"
    accuracyMeters <= 25f -> "Fair"
    else -> "Poor"
}

private fun accuracyStatusColor(accuracyMeters: Float?): Color = when {
    accuracyMeters == null -> TextSecondary
    accuracyMeters <= 3f -> Color(0xFF2E7D32)
    accuracyMeters <= 8f -> Color(0xFF2E7D32)
    accuracyMeters <= 25f -> Color(0xFFE65100)
    else -> Color(0xFFB3261E)
}

private fun formatLatitude(value: Double): String =
    String.format(Locale.US, "%.6f° %s", abs(value), if (value >= 0) "N" else "S")

private fun formatLongitude(value: Double): String =
    String.format(Locale.US, "%.6f° %s", abs(value), if (value >= 0) "E" else "W")

private fun formatOne(value: Float?): String = value?.let { String.format(Locale.US, "%.1f", it) } ?: "--"

private fun speedKmh(speedMps: Float?): String =
    speedMps?.let { String.format(Locale.US, "%.1f km/h", it * 3.6f) } ?: "--"

private fun degreesToCardinal(degrees: Float): String {
    val dirs = arrayOf("N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW")
    return dirs[(((degrees % 360f) + 360f) % 360f / 22.5f).toInt()]
}

private val utcFormat: SimpleDateFormat =
    SimpleDateFormat("EEE, dd MMM yyyy · HH:mm:ss 'UTC'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

private val hhmmFormat: SimpleDateFormat = SimpleDateFormat("hh:mm:ss a", Locale.US)

// -----------------------------------------------------------------------------
// 1. LIVE STATUS BANNER
// -----------------------------------------------------------------------------
@Composable
private fun LiveStatusBanner(
    state: GpsBannerState,
    telemetry: GpsTelemetry,
    timeState: TimeIntegrityState
) {
    val subtitle = when (state) {
        GpsBannerState.Ready ->
            "${telemetry.fixModeLabel} Locked · ${telemetry.usedInFix} sats in use · ±${formatOne(telemetry.horizontalAccuracyMeters)}m accuracy"
        GpsBannerState.Searching ->
            if (telemetry.visibleSatellites > 0)
                "Acquiring GNSS Signals... ${telemetry.visibleSatellites} satellites visible"
            else
                "Acquiring GNSS Signals..."
        GpsBannerState.Weak ->
            "Accuracy ±${formatOne(telemetry.horizontalAccuracyMeters)}m · Move to Open Sky"
        GpsBannerState.Disabled ->
            "Turn on Location Services in Android Settings"
        GpsBannerState.Permission ->
            "Fine Location Permission needed for Patrol Tracking"
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = state.color.copy(alpha = 0.12f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, state.color)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(state.color, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(state.icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = state.title,
                    fontWeight = FontWeight.Bold,
                    color = state.color,
                    fontSize = 16.sp
                )
                Text(
                    text = subtitle,
                    color = TextSecondary,
                    fontSize = 12.sp
                )
            }
        }
    }
}

// -----------------------------------------------------------------------------
// 2. GPS HEALTH SCORE CARD
// -----------------------------------------------------------------------------
@Composable
private fun GpsHealthScoreCard(telemetry: GpsTelemetry, timeState: TimeIntegrityState) {
    val signalQuality = computeSignalQuality(telemetry)
    val satAvailability = computeSatelliteAvailability(telemetry)
    val timeSync = computeTimeSync(timeState)
    val sensorFusion = computeSensorFusion(telemetry)
    val health = computeHealthScore(telemetry, timeState)

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, OutlineCard)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("GPS Health Score", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = TextPrimary)
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color(0xFFE8F5E9))
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Text(healthLabel(health), color = Color(0xFF2E7D32), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }

            Spacer(Modifier.height(16.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier.size(90.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Canvas(modifier = Modifier.fillMaxSize()) {
                        drawCircle(
                            color = Color(0xFFEEEEEE),
                            style = Stroke(width = 10.dp.toPx())
                        )
                        drawArc(
                            color = ForestGreen,
                            startAngle = -90f,
                            sweepAngle = 360f * (health / 100f),
                            useCenter = false,
                            style = Stroke(width = 10.dp.toPx(), cap = StrokeCap.Round)
                        )
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("$health%", fontWeight = FontWeight.Bold, fontSize = 20.sp, color = TextPrimary)
                        Text(healthLabel(health), fontSize = 10.sp, color = ForestGreen, fontWeight = FontWeight.SemiBold)
                    }
                }

                Spacer(Modifier.width(20.dp))

                Column(modifier = Modifier.weight(1f)) {
                    HealthSubItem("Signal Quality", signalQuality, ForestGreen)
                    Spacer(Modifier.height(6.dp))
                    HealthSubItem("Satellite Availability", satAvailability, ForestGreen)
                    Spacer(Modifier.height(6.dp))
                    HealthSubItem("Time Sync (GNSS)", timeSync, ForestGreen)
                    Spacer(Modifier.height(6.dp))
                    HealthSubItem("Sensor Fusion", sensorFusion, ForestGreen)
                }
            }
        }
    }
}

@Composable
private fun HealthSubItem(name: String, percentage: Int, color: Color) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(name, fontSize = 11.sp, color = TextSecondary)
            Text("$percentage%", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
        }
        Spacer(Modifier.height(2.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(Color(0xFFEEEEEE))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(percentage / 100f)
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(color)
            )
        }
    }
}

// -----------------------------------------------------------------------------
// 3. GPS ACCURACY CARD
// -----------------------------------------------------------------------------
@Composable
private fun GpsAccuracyCard(telemetry: GpsTelemetry) {
    val accuracy = telemetry.horizontalAccuracyMeters
    val label = accuracyLabel(accuracy)
    val color = accuracyStatusColor(accuracy)

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, OutlineCard)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Horizontal Accuracy", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = TextPrimary)
            Spacer(Modifier.height(14.dp))

            Box(
                modifier = Modifier
                    .size(110.dp)
                    .background(LightForest, CircleShape)
                    .border(3.dp, color, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = if (accuracy != null) "${formatOne(accuracy)} m" else "-- m",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = color
                    )
                    Text(
                        text = if (accuracy != null) "± ${formatOne(accuracy * 0.15f)}m drift" else "No fix yet",
                        fontSize = 11.sp,
                        color = TextSecondary
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Status: ", fontSize = 13.sp, color = TextSecondary)
                Text(
                    text = label,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = color
                )
                Spacer(Modifier.width(8.dp))
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(color, CircleShape)
                )
            }
        }
    }
}

// -----------------------------------------------------------------------------
// 4. CURRENT LOCATION CARD
// -----------------------------------------------------------------------------
@Composable
private fun CurrentLocationCard(
    context: Context,
    telemetry: GpsTelemetry,
    currentDeviceTime: Long
) {
    val satUtc = telemetry.satelliteUtcMillis
    val fixTime = telemetry.fixTimeMillis
    val headerTime = satUtc?.let { hhmmFormat.format(Date(it)) } ?: hhmmFormat.format(Date(currentDeviceTime))
    val coordinateText = if (telemetry.latitude != null && telemetry.longitude != null) {
        String.format(Locale.US, "%.6f, %.6f", telemetry.latitude, telemetry.longitude)
    } else {
        "No fix available"
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, OutlineCard)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.LocationOn, contentDescription = null, tint = ForestGreen)
                    Spacer(Modifier.width(6.dp))
                    Text("Live Coordinates", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = TextPrimary)
                }
                Text(headerTime, fontSize = 11.sp, color = TextSecondary)
            }

            Spacer(Modifier.height(12.dp))

            LocationGridRow(
                "Latitude",
                telemetry.latitude?.let { formatLatitude(it) } ?: "--",
                "Longitude",
                telemetry.longitude?.let { formatLongitude(it) } ?: "--"
            )
            Spacer(Modifier.height(8.dp))
            LocationGridRow(
                "Altitude",
                telemetry.altitudeMeters?.let { String.format(Locale.US, "%.1f m (MSL)", it) } ?: "--",
                "H. Accuracy",
                "± ${formatOne(telemetry.horizontalAccuracyMeters)} m"
            )
            Spacer(Modifier.height(8.dp))
            LocationGridRow(
                "V. Accuracy",
                "± ${formatOne(telemetry.verticalAccuracyMeters)} m",
                "Speed",
                speedKmh(telemetry.speedMps)
            )
            Spacer(Modifier.height(8.dp))
            LocationGridRow(
                "Bearing",
                telemetry.bearingDegrees?.let { "${it.toInt()}° ${degreesToCardinal(it)}" } ?: "--",
                "Provider",
                telemetry.provider?.let { providerLabel(it) } ?: "Waiting for fix"
            )

            Spacer(Modifier.height(12.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(LightForest.copy(alpha = 0.5f), RoundedCornerShape(8.dp))
                    .padding(horizontal = 12.dp, vertical = 10.dp)
            ) {
                Column {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Satellite UTC Time", fontSize = 11.sp, color = TextSecondary)
                        Text(
                            text = satUtc?.let { utcFormat.format(Date(it)) } ?: "Unavailable",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = TextPrimary
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Fix Mode", fontSize = 11.sp, color = TextSecondary)
                        Text(
                            text = telemetry.fixModeLabel,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = if (telemetry.hasFix) Color(0xFF2E7D32) else TextSecondary
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Fix Timestamp (from satellite)", fontSize = 11.sp, color = TextSecondary)
                        Text(
                            text = fixTime?.let { hhmmFormat.format(Date(it)) } ?: "--",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = TextPrimary
                        )
                    }
                }
            }

            Spacer(Modifier.height(14.dp))

            OutlinedButton(
                onClick = {
                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    val clip = ClipData.newPlainText("Coordinates", coordinateText)
                    clipboard.setPrimaryClip(clip)
                    Toast.makeText(context, "Coordinates copied: $coordinateText", Toast.LENGTH_SHORT).show()
                },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, ForestGreen)
            ) {
                Icon(Icons.Filled.ContentCopy, contentDescription = null, tint = ForestGreen, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text("COPY COORDINATES", color = ForestGreen, fontWeight = FontWeight.Bold, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun LocationGridRow(label1: String, val1: String, label2: String, val2: String) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.weight(1f)) {
            Text(label1, fontSize = 11.sp, color = TextSecondary)
            Text(val1, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(label2, fontSize = 11.sp, color = TextSecondary)
            Text(val2, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
        }
    }
}

private fun providerLabel(provider: String): String = when (provider) {
    "gps" -> "GPS (Satellite)"
    "network" -> "Network (Wi-Fi/Cell)"
    "fused" -> "Fused (GPS + Network)"
    else -> provider
}

// -----------------------------------------------------------------------------
// 5. SATELLITE INFORMATION CARD
// -----------------------------------------------------------------------------
@Composable
private fun SatelliteInformationCard(telemetry: GpsTelemetry) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, OutlineCard)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("GNSS Satellite Summary", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = TextPrimary)
            Spacer(Modifier.height(14.dp))

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                StatBadge("${telemetry.visibleSatellites}", "Visible", ForestGreen)
                StatBadge("${telemetry.usedInFix}", "In Use", ForestGreen)
                StatBadge(formatOne(telemetry.avgCn0), "Avg dB-Hz", Color(0xFF1565C0))
                StatBadge(telemetry.fixModeLabel.split(" ").firstOrNull() ?: "No", "Fix Mode", Color(0xFF2E7D32))
            }
        }
    }
}

@Composable
private fun StatBadge(number: String, label: String, color: Color) {
    Column(
        modifier = Modifier
            .width(72.dp)
            .background(LightForest.copy(alpha = 0.5f), RoundedCornerShape(8.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
            .padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(number, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = color)
        Text(label, fontSize = 10.sp, color = TextSecondary, textAlign = TextAlign.Center)
    }
}

// -----------------------------------------------------------------------------
// 6. GNSS CONSTELLATIONS CARD
// -----------------------------------------------------------------------------
@Composable
private fun GnssConstellationsCard(telemetry: GpsTelemetry) {
    val visible = telemetry.satellitesByConstellation()
    val inUse = telemetry.inUseByConstellation()
    val ordered = listOf(
        GnssConstellation.GPS,
        GnssConstellation.GLONASS,
        GnssConstellation.GALILEO,
        GnssConstellation.BEIDOU,
        GnssConstellation.QZSS,
        GnssConstellation.NAVIC
    )
    val countries = mapOf(
        GnssConstellation.GPS to "(USA)",
        GnssConstellation.GLONASS to "(RU)",
        GnssConstellation.GALILEO to "(EU)",
        GnssConstellation.BEIDOU to "(CN)",
        GnssConstellation.QZSS to "(Japan)",
        GnssConstellation.NAVIC to "(India)"
    )

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, OutlineCard)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Supported Constellations", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = TextPrimary)
            Spacer(Modifier.height(12.dp))

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ordered.chunked(2).forEach { pair ->
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        pair.forEach { constellation ->
                            ConstellationChip(
                                name = "${constellation.label} ${countries[constellation] ?: ""}",
                                status = when {
                                    visible[constellation] == null -> "Unavailable"
                                    (inUse[constellation] ?: 0) > 0 ->
                                        "Connected (${inUse[constellation]}/${visible[constellation]})"
                                    else -> "Available (0/${visible[constellation]})"
                                },
                                color = when {
                                    visible[constellation] == null -> Color(0xFF757575)
                                    (inUse[constellation] ?: 0) > 0 -> Color(0xFF2E7D32)
                                    else -> Color(0xFF1565C0)
                                }
                            )
                        }
                        if (pair.size == 1) Spacer(Modifier.width(150.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun ConstellationChip(name: String, status: String, color: Color) {
    Box(
        modifier = Modifier
            .width(150.dp)
            .background(color.copy(alpha = 0.08f), RoundedCornerShape(8.dp))
            .border(1.dp, color.copy(alpha = 0.3f), RoundedCornerShape(8.dp))
            .padding(horizontal = 10.dp, vertical = 8.dp)
    ) {
        Column {
            Text(name, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = TextPrimary)
            Text(status, fontSize = 10.sp, color = color, fontWeight = FontWeight.Medium)
        }
    }
}

// -----------------------------------------------------------------------------
// 7. SIGNAL STRENGTH VISUALIZATION
// -----------------------------------------------------------------------------
@Composable
private fun SignalStrengthCard(telemetry: GpsTelemetry) {
    val satellites = telemetry.strongestSatellites(limit = 6)

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, OutlineCard)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Satellite Signal Strength (C/N0)", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = TextPrimary)
            Spacer(Modifier.height(14.dp))

            if (satellites.isEmpty()) {
                Text(
                    "No satellites in view yet. Wait for a GNSS signal.",
                    fontSize = 12.sp,
                    color = TextSecondary
                )
            } else {
                satellites.forEach { sat ->
                    SignalBarItem(sat)
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
    }
}

@Composable
private fun SignalBarItem(sat: GnssSatellite) {
    val fraction = (sat.cn0DbHz / 50f).coerceIn(0f, 1f)
    val color = if (sat.usedInFix) ForestGreen else Color(0xFF1565C0)
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = "${sat.constellation.label} ${sat.svid}",
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.width(80.dp),
            color = TextPrimary
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .height(12.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(Color(0xFFEEEEEE))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction)
                    .height(12.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(color)
            )
        }
        Spacer(Modifier.width(10.dp))
        Text(
            text = "${sat.cn0DbHz.toInt()} dB",
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = TextPrimary,
            modifier = Modifier.width(42.dp)
        )
    }
}

// -----------------------------------------------------------------------------
// 8. LIVE COMPASS WIDGET
// -----------------------------------------------------------------------------
@Composable
private fun LiveCompassCard(telemetry: GpsTelemetry) {
    val heading = telemetry.headingDegrees
    val degrees = heading ?: 0f
    val headingText = heading?.let { "${it.toInt()}° ${degreesToCardinal(it)}" } ?: "--"
    val bearing = telemetry.bearingDegrees
    val bearingText = bearing?.let { "${it.toInt()}° ${degreesToCardinal(it)}" } ?: "--"

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, OutlineCard)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Live Compass", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = TextPrimary)
                Text(headingText, fontWeight = FontWeight.Bold, color = ForestGreen, fontSize = 14.sp)
            }

            Spacer(Modifier.height(16.dp))

            Box(
                modifier = Modifier.size(160.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    "N",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFFB3261E),
                    modifier = Modifier.align(Alignment.TopCenter)
                )
                Text(
                    "E",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextSecondary,
                    modifier = Modifier.align(Alignment.CenterEnd)
                )
                Text(
                    "S",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextSecondary,
                    modifier = Modifier.align(Alignment.BottomCenter)
                )
                Text(
                    "W",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextSecondary,
                    modifier = Modifier.align(Alignment.CenterStart)
                )

                Box(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .size(120.dp)
                ) {
                    Canvas(modifier = Modifier.fillMaxSize()) {
                        val center = Offset(size.width / 2, size.height / 2)
                        val radius = size.width / 2 - 6.dp.toPx()

                        drawCircle(color = OutlineCard, radius = radius, style = Stroke(width = 2.dp.toPx()))

                        for (i in 0 until 360 step 30) {
                            val rad = i * PI / 180
                            val startR = radius - if (i % 90 == 0) 10.dp.toPx() else 5.dp.toPx()
                            val p1 = Offset(center.x + startR * sin(rad).toFloat(), center.y - startR * cos(rad).toFloat())
                            val p2 = Offset(center.x + radius * sin(rad).toFloat(), center.y - radius * cos(rad).toFloat())
                            drawLine(color = if (i % 90 == 0) ForestGreen else TextSecondary, start = p1, end = p2, strokeWidth = 2.dp.toPx())
                        }
                    }

                    Icon(
                        imageVector = Icons.Filled.Navigation,
                        contentDescription = null,
                        tint = ForestGreen,
                        modifier = Modifier
                            .align(Alignment.Center)
                            .size(44.dp)
                            .rotate(degrees)
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Magnetic Heading", fontSize = 11.sp, color = TextSecondary)
                Text(
                    text = "$headingText (magnetic north)",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimary
                )
            }
            Spacer(Modifier.height(4.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("GPS Bearing (travel)", fontSize = 11.sp, color = TextSecondary)
                Text(
                    text = bearingText,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimary
                )
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = if (heading == null) "No heading sensor detected" else "Requires a figure-eight motion to calibrate the magnetometer",
                fontSize = 10.sp,
                color = TextSecondary
            )
        }
    }
}

// -----------------------------------------------------------------------------
// 8b. MOVEMENT MODE DETECTION CARD
// -----------------------------------------------------------------------------
@Composable
private fun MovementModeCard(recorder: TelemetryRecorder) {
    val movement by recorder.movement.collectAsStateWithLifecycle()
    val samples by recorder.samplesRecorded.collectAsStateWithLifecycle()
    val arGranted by recorder.arPermissionGranted.collectAsStateWithLifecycle()

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, OutlineCard)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Movement Mode Detection", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = TextPrimary)
                Text(movement.mode.label, fontWeight = FontWeight.Bold, color = ForestGreen, fontSize = 14.sp)
            }

            Spacer(Modifier.height(12.dp))

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                MovementMode.entries.forEach { mode ->
                    MovementModePill(mode, active = movement.mode == mode)
                }
            }

            Spacer(Modifier.height(14.dp))

            InfoRow(
                "Source",
                when (movement.source) {
                    ModeSource.GMS_ACTIVITY_RECOGNITION -> "Google Activity Recognition"
                    ModeSource.HEURISTIC -> "Heuristic (speed / cadence)"
                }
            )
            InfoRow(
                "Confidence",
                if (movement.source == ModeSource.GMS_ACTIVITY_RECOGNITION)
                    "${movement.confidence.toInt()}%"
                else
                    "n/a"
            )
            InfoRow(
                "Speed",
                movement.speedKmh?.let { String.format(Locale.US, "%.1f km/h", it) } ?: "--"
            )
            InfoRow(
                "Step Cadence",
                movement.stepCadence?.let { String.format(Locale.US, "%.0f steps/min", it) } ?: "--"
            )
            InfoRow("Patrol Points Recorded", samples.toString())

            Spacer(Modifier.height(10.dp))

            Text(
                text = if (arGranted)
                    "Activity Recognition active · falls back to heuristics if stale"
                else
                    "Activity Recognition permission missing · heuristic fallback in use",
                fontSize = 10.sp,
                color = TextSecondary
            )
        }
    }
}

@Composable
private fun MovementModePill(mode: MovementMode, active: Boolean) {
    val color = if (active) ForestGreen else TextSecondary
    Box(
        modifier = Modifier
            .background(
                if (active) color.copy(alpha = 0.12f) else Color.Transparent,
                RoundedCornerShape(8.dp)
            )
            .border(
                1.dp,
                if (active) color else OutlineCard,
                RoundedCornerShape(8.dp)
            )
            .padding(horizontal = 8.dp, vertical = 6.dp)
    ) {
        Text(
            text = mode.label,
            fontSize = 11.sp,
            fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
            color = color
        )
    }
}

// -----------------------------------------------------------------------------
// 9. ACCURACY CIRCLE MAP VISUALIZER
// -----------------------------------------------------------------------------
@Composable
private fun AccuracyCircleMapVisualizer(telemetry: GpsTelemetry) {
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 0.8f,
        targetValue = 1.2f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseScale"
    )
    val accuracy = telemetry.horizontalAccuracyMeters
    val accuracyLabelText = if (accuracy != null)
        "± ${formatOne(accuracy)}m Accuracy Boundary"
    else
        "No fix · boundary unknown"

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, OutlineCard)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Accuracy Radius Map", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = TextPrimary)
                Text(telemetry.provider?.let { providerLabel(it) } ?: "No provider", fontSize = 11.sp, color = TextSecondary)
            }

            Spacer(Modifier.height(12.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(150.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFFE8F5E9)),
                contentAlignment = Alignment.Center
            ) {
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val center = Offset(size.width / 2, size.height / 2)

                    for (x in 0..size.width.toInt() step 40) {
                        drawLine(Color(0xFFC8E6C9), Offset(x.toFloat(), 0f), Offset(x.toFloat(), size.height), strokeWidth = 1f)
                    }
                    for (y in 0..size.height.toInt() step 40) {
                        drawLine(Color(0xFFC8E6C9), Offset(0f, y.toFloat()), Offset(size.width, y.toFloat()), strokeWidth = 1f)
                    }

                    drawCircle(
                        color = ForestGreen.copy(alpha = 0.2f),
                        radius = 45.dp.toPx() * pulseScale,
                        center = center
                    )
                    drawCircle(
                        color = ForestGreen,
                        radius = 45.dp.toPx() * pulseScale,
                        center = center,
                        style = Stroke(width = 2.dp.toPx())
                    )

                    drawCircle(color = ForestGreen, radius = 6.dp.toPx(), center = center)
                    drawCircle(color = Color.White, radius = 3.dp.toPx(), center = center)
                }

                Text(
                    text = accuracyLabelText,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = ForestGreen,
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(8.dp)
                        .background(Color.White.copy(alpha = 0.8f), RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                )
            }
        }
    }
}

// -----------------------------------------------------------------------------
// 10. GPS STATUS CHECKLIST CARD
// -----------------------------------------------------------------------------
@Composable
private fun GpsStatusChecklistCard(telemetry: GpsTelemetry, timeState: TimeIntegrityState) {
    val locationMode = Settings.Secure.getInt(
        LocalContext.current.contentResolver,
        Settings.Secure.LOCATION_MODE,
        Settings.Secure.LOCATION_MODE_OFF
    )
    val mockLocationAllowed = Settings.Secure.getInt(
        LocalContext.current.contentResolver,
        Settings.Secure.ALLOW_MOCK_LOCATION,
        0
    ) == 1

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, OutlineCard)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("System Verification Checklist", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = TextPrimary)
            Spacer(Modifier.height(12.dp))

            ChecklistItem(
                "GPS Hardware",
                if (telemetry.enabled) "Enabled" else "Disabled",
                if (telemetry.enabled) CheckStatus.Pass else CheckStatus.Fail
            )
            ChecklistItem(
                "Location Services",
                when (locationMode) {
                    Settings.Secure.LOCATION_MODE_HIGH_ACCURACY -> "Active (High Accuracy)"
                    Settings.Secure.LOCATION_MODE_SENSORS_ONLY -> "Active (Sensors Only)"
                    Settings.Secure.LOCATION_MODE_BATTERY_SAVING -> "Active (Battery Saving)"
                    else -> "Off"
                },
                if (locationMode == Settings.Secure.LOCATION_MODE_OFF) CheckStatus.Fail else CheckStatus.Pass
            )
            ChecklistItem(
                "Fine Location Permission",
                if (telemetry.permissionGranted) "Granted" else "Not Granted",
                if (telemetry.permissionGranted) CheckStatus.Pass else CheckStatus.Fail
            )
            ChecklistItem(
                "Background Permission",
                "While In Use",
                CheckStatus.Warning
            )
            ChecklistItem(
                "Mock Location Detection",
                if (mockLocationAllowed) "Mock Provider Allowed (Risk)" else "None Detected (Real GPS)",
                if (mockLocationAllowed) CheckStatus.Fail else CheckStatus.Pass
            )
            ChecklistItem(
                "GNSS Time Sync",
                if (timeState.gnssTimeAvailable)
                    "Synced via Satellites (${timeState.divergenceSeconds}s drift)"
                else
                    "No GNSS time yet (clock-based)",
                if (timeState.gnssTimeAvailable && !timeState.tamperDetected) CheckStatus.Pass else CheckStatus.Warning
            )
        }
    }
}

enum class CheckStatus { Pass, Warning, Fail }

@Composable
private fun ChecklistItem(title: String, subtitle: String, status: CheckStatus) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        val (icon, color) = when (status) {
            CheckStatus.Pass -> Icons.Filled.CheckCircle to Color(0xFF2E7D32)
            CheckStatus.Warning -> Icons.Filled.Warning to Color(0xFFFF8F00)
            CheckStatus.Fail -> Icons.Filled.Info to Color(0xFFB3261E)
        }
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
            Text(subtitle, fontSize = 11.sp, color = TextSecondary)
        }
    }
}

// -----------------------------------------------------------------------------
// 11. DEVICE INFORMATION CARD
// -----------------------------------------------------------------------------
@Composable
private fun DeviceInformationCard(context: Context) {
    val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
    val batteryLevel = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    val charging = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_STATUS) ==
        BatteryManager.BATTERY_STATUS_CHARGING
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    val ignoresOptimization = powerManager.isIgnoringBatteryOptimizations(context.packageName)

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, OutlineCard)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Device & Hardware Information", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = TextPrimary)
            Spacer(Modifier.height(12.dp))

            InfoRow("Device Name", "${Build.MANUFACTURER} ${Build.MODEL}")
            InfoRow("OS Version", "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
            InfoRow("Battery Level", "$batteryLevel% (${if (charging) "Charging" else "Discharging"})")
            InfoRow("Battery Optimization", if (ignoresOptimization) "Disabled (Unrestricted)" else "Enabled (Optimizing)")
            InfoRow("App Version", "NSTR Patrol v${BuildConfig.VERSION_NAME} (Build ${BuildConfig.VERSION_CODE})")
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, fontSize = 12.sp, color = TextSecondary)
        Text(value, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
    }
}

// -----------------------------------------------------------------------------
// 12. DIAGNOSTIC REPORT CARD & ACTIONS
// -----------------------------------------------------------------------------
@Composable
private fun DiagnosticReportCard(context: Context, telemetry: GpsTelemetry, timeState: TimeIntegrityState) {
    val reportText = buildDiagnosticReport(telemetry, timeState)

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, OutlineCard)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Generated Diagnostic Report", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = TextPrimary)
            Spacer(Modifier.height(8.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFF5F5F5), RoundedCornerShape(8.dp))
                    .padding(12.dp)
            ) {
                Text(
                    text = reportText,
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                    color = TextPrimary
                )
            }

            Spacer(Modifier.height(12.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = {
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        val clip = ClipData.newPlainText("GPS Report", reportText)
                        clipboard.setPrimaryClip(clip)
                        Toast.makeText(context, "Report copied to clipboard!", Toast.LENGTH_SHORT).show()
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Filled.ContentCopy, contentDescription = null, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Copy", fontSize = 11.sp)
                }

                Button(
                    onClick = {
                        Toast.makeText(context, "Report saved to /Documents/GPS_Report.txt", Toast.LENGTH_SHORT).show()
                    },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Filled.Share, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Share", fontSize = 11.sp, color = Color.White)
                }
            }
        }
    }
}

private fun buildDiagnosticReport(telemetry: GpsTelemetry, timeState: TimeIntegrityState): String {
    val device = "${Build.MANUFACTURER} ${Build.MODEL}"
    val coordinate = if (telemetry.latitude != null && telemetry.longitude != null) {
        String.format(Locale.US, "%.6f, %.6f", telemetry.latitude, telemetry.longitude)
    } else {
        "No fix"
    }
    val time = timeState.satelliteUtcMillis?.let { utcFormat.format(Date(it)) } ?: "Unavailable"

    val constellations = GnssConstellation.entries
        .filter { telemetry.satellitesByConstellation()[it] != null }
        .joinToString(", ") {
            "${it.label} (${telemetry.inUseByConstellation()[it] ?: 0}/${telemetry.satellitesByConstellation()[it]})"
        }
        .ifEmpty { "None" }

    return buildString {
        appendLine("=== FOREST PATROL GPS DIAGNOSTIC REPORT ===")
        appendLine("Timestamp: $time")
        appendLine("Device: $device (Android ${Build.VERSION.RELEASE})")
        appendLine("App Version: NSTR Patrol v${BuildConfig.VERSION_NAME}")
        appendLine()
        appendLine("--- LOCATION DATA ---")
        appendLine("Coordinates: $coordinate")
        appendLine("Latitude: ${telemetry.latitude?.let { formatLatitude(it) } ?: "--"}")
        appendLine("Longitude: ${telemetry.longitude?.let { formatLongitude(it) } ?: "--"}")
        appendLine("Altitude: ${telemetry.altitudeMeters?.let { String.format(Locale.US, "%.1f m MSL", it) } ?: "--"}")
        appendLine("Horizontal Accuracy: ± ${formatOne(telemetry.horizontalAccuracyMeters)} m (${accuracyLabel(telemetry.horizontalAccuracyMeters)})")
        appendLine("Vertical Accuracy: ± ${formatOne(telemetry.verticalAccuracyMeters)} m")
        appendLine("Speed: ${speedKmh(telemetry.speedMps)} | Bearing: ${telemetry.bearingDegrees?.let { "${it.toInt()}° ${degreesToCardinal(it)}" } ?: "--"}")
        appendLine("Provider: ${telemetry.provider ?: "none"}")
        appendLine()
        appendLine("--- GNSS STATUS ---")
        appendLine("Health Score: ${computeHealthScore(telemetry, timeState)}% (${healthLabel(computeHealthScore(telemetry, timeState))})")
        appendLine("Satellites Visible: ${telemetry.visibleSatellites} | In Use: ${telemetry.usedInFix}")
        appendLine("Fix Mode: ${telemetry.fixModeLabel}")
        appendLine("Avg Signal C/N0: ${formatOne(telemetry.avgCn0)} dB-Hz")
        appendLine("Constellations: $constellations")
        appendLine()
        appendLine("--- PERMISSIONS & ENVIRONMENT ---")
        appendLine("GPS Hardware: ${if (telemetry.enabled) "ENABLED" else "DISABLED"}")
        appendLine("Fine Location: ${if (telemetry.permissionGranted) "GRANTED" else "NOT GRANTED"}")
        appendLine("GNSS Time Sync: ${if (timeState.gnssTimeAvailable) "SYNCED (${timeState.divergenceSeconds}s drift)" else "UNAVAILABLE"}")
        appendLine("Time Tamper Detection: ${if (timeState.tamperDetected) "TRIGGERED" else "CLEAN"}")
    }.trim()
}
