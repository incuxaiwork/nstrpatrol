package com.nstrpatrol.app.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.LightForest
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.OutlineSoft
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

enum class GpsBannerState(val title: String, val subtitle: String, val color: Color, val icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Ready("GPS Ready", "3D Fix Locked • High Accuracy Active", Color(0xFF2E7D32), Icons.Filled.CheckCircle),
    Searching("Searching for Satellites", "Acquiring GNSS Signals...", Color(0xFFFF8F00), Icons.Filled.Refresh),
    Weak("Weak GPS Signal", "Accuracy ±18.4m • Move to Open Sky", Color(0xFFE65100), Icons.Filled.Warning),
    Disabled("Location Disabled", "Turn on Location Services in Android Settings", Color(0xFFB3261E), Icons.Filled.Warning),
    Permission("Permission Required", "Fine Location Permission needed for Patrol Tracking", Color(0xFFB3261E), Icons.Filled.Info)
}

@Composable
fun GpsDiagnosticsScreen(
    onBack: () -> Unit,
    onTabSelected: (BottomTab) -> Unit
) {
    val context = LocalContext.current
    var currentBanner by remember { mutableStateOf(GpsBannerState.Ready) }
    var reportVisible by remember { mutableStateOf(false) }

    // Animated compass angle simulation
    var compassDegrees by remember { mutableFloatStateOf(22.5f) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1500)
            compassDegrees = (compassDegrees + ((-3..3).random())) % 360f
        }
    }

    NstrScaffold(
        title = "GPS Diagnostics",
        subtitle = "GNSS Status & Sensor Verification",
        onBack = onBack,
        activeTab = BottomTab.Settings,
        onTabSelected = onTabSelected
    ) {
        Spacer(Modifier.height(12.dp))

        // 1. Live Status Banner
        LiveStatusBanner(
            state = currentBanner,
            onCycleState = {
                currentBanner = GpsBannerState.entries[(currentBanner.ordinal + 1) % GpsBannerState.entries.size]
            }
        )

        Spacer(Modifier.height(16.dp))

        // 2. GPS Health Score (Circular Progress)
        GpsHealthScoreCard(healthScore = 95)

        Spacer(Modifier.height(16.dp))

        // 3. GPS Accuracy Card (Large Circular Indicator)
        GpsAccuracyCard(accuracyMeters = 2.8f, status = "Excellent")

        Spacer(Modifier.height(16.dp))

        // 4. Current Location Card
        CurrentLocationCard(context = context)

        Spacer(Modifier.height(16.dp))

        // 5. Satellite Information Card
        SatelliteInformationCard()

        Spacer(Modifier.height(16.dp))

        // 6. GNSS Constellations
        GnssConstellationsCard()

        Spacer(Modifier.height(16.dp))

        // 7. Signal Strength Visualization
        SignalStrengthCard()

        Spacer(Modifier.height(16.dp))

        // 8. Live Compass Widget
        LiveCompassCard(degrees = compassDegrees)

        Spacer(Modifier.height(16.dp))

        // 9. Accuracy Circle Map Visualizer
        AccuracyCircleMapVisualizer()

        Spacer(Modifier.height(16.dp))

        // 10. GPS Status Items Checklist
        GpsStatusChecklistCard()

        Spacer(Modifier.height(16.dp))

        // 11. Device Information Card
        DeviceInformationCard()

        Spacer(Modifier.height(20.dp))

        // 12. Diagnostic Report Action Button
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
                DiagnosticReportCard(context = context)
            }
        }
    }
}

// -----------------------------------------------------------------------------
// 1. LIVE STATUS BANNER
// -----------------------------------------------------------------------------
@Composable
private fun LiveStatusBanner(state: GpsBannerState, onCycleState: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCycleState() },
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
                    text = state.subtitle,
                    color = TextSecondary,
                    fontSize = 12.sp
                )
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(state.color.copy(alpha = 0.2f))
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            ) {
                Text(
                    text = "Tap to test",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = state.color
                )
            }
        }
    }
}

// -----------------------------------------------------------------------------
// 2. GPS HEALTH SCORE CARD
// -----------------------------------------------------------------------------
@Composable
private fun GpsHealthScoreCard(healthScore: Int) {
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
                    Text("System Optimal", color = Color(0xFF2E7D32), fontSize = 11.sp, fontWeight = FontWeight.Bold)
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
                            sweepAngle = 360f * (healthScore / 100f),
                            useCenter = false,
                            style = Stroke(width = 10.dp.toPx(), cap = StrokeCap.Round)
                        )
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("$healthScore%", fontWeight = FontWeight.Bold, fontSize = 20.sp, color = TextPrimary)
                        Text("Excellent", fontSize = 10.sp, color = ForestGreen, fontWeight = FontWeight.SemiBold)
                    }
                }

                Spacer(Modifier.width(20.dp))

                Column(modifier = Modifier.weight(1f)) {
                    HealthSubItem("Signal Quality", 98, ForestGreen)
                    Spacer(Modifier.height(6.dp))
                    HealthSubItem("Satellite Availability", 95, ForestGreen)
                    Spacer(Modifier.height(6.dp))
                    HealthSubItem("Time Sync (NTP)", 100, ForestGreen)
                    Spacer(Modifier.height(6.dp))
                    HealthSubItem("Sensor Fusion", 92, ForestGreen)
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
private fun GpsAccuracyCard(accuracyMeters: Float, status: String) {
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
                    .border(3.dp, ForestGreen, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "$accuracyMeters m",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = ForestGreen
                    )
                    Text(
                        text = "± 0.4m drift",
                        fontSize = 11.sp,
                        color = TextSecondary
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Status: ", fontSize = 13.sp, color = TextSecondary)
                Text(
                    text = status,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = ForestGreen
                )
                Spacer(Modifier.width(8.dp))
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(ForestGreen, CircleShape)
                )
            }
        }
    }
}

// -----------------------------------------------------------------------------
// 4. CURRENT LOCATION CARD
// -----------------------------------------------------------------------------
@Composable
private fun CurrentLocationCard(context: Context) {
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
                Text("12:54:32 PM", fontSize = 11.sp, color = TextSecondary)
            }

            Spacer(Modifier.height(12.dp))

            LocationGridRow("Latitude", "15.489241° N", "Longitude", "79.023418° E")
            Spacer(Modifier.height(8.dp))
            LocationGridRow("Altitude", "342.5 m (MSL)", "H. Accuracy", "± 2.8 m")
            Spacer(Modifier.height(8.dp))
            LocationGridRow("V. Accuracy", "± 3.1 m", "Speed", "1.2 km/h")
            Spacer(Modifier.height(8.dp))
            LocationGridRow("Bearing", "22.5° NNE", "Provider", "Fused (GPS)")

            Spacer(Modifier.height(14.dp))

            OutlinedButton(
                onClick = {
                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    val clip = ClipData.newPlainText("Coordinates", "15.489241, 79.023418")
                    clipboard.setPrimaryClip(clip)
                    Toast.makeText(context, "Coordinates copied: 15.489241, 79.023418", Toast.LENGTH_SHORT).show()
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

// -----------------------------------------------------------------------------
// 5. SATELLITE INFORMATION CARD
// -----------------------------------------------------------------------------
@Composable
private fun SatelliteInformationCard() {
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
                StatBadge("24", "Visible", ForestGreen)
                StatBadge("16", "In Use", ForestGreen)
                StatBadge("38.4", "Avg dB-Hz", Color(0xFF1565C0))
                StatBadge("3D", "Fix Mode", Color(0xFF2E7D32))
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
private fun GnssConstellationsCard() {
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
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    ConstellationChip("GPS (USA)", "Connected (10/12)", Color(0xFF2E7D32))
                    ConstellationChip("GLONASS (RU)", "Connected (6/8)", Color(0xFF2E7D32))
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    ConstellationChip("Galileo (EU)", "Connected (5/6)", Color(0xFF2E7D32))
                    ConstellationChip("BeiDou (CN)", "Supported (3/6)", Color(0xFF1565C0))
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    ConstellationChip("NavIC (India)", "Supported (2/4)", Color(0xFF1565C0))
                    ConstellationChip("QZSS (Japan)", "Unavailable", Color(0xFF757575))
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
private fun SignalStrengthCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, OutlineCard)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Satellite Signal Strength (C/N0)", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = TextPrimary)
            Spacer(Modifier.height(14.dp))

            SignalBarItem("GPS 12", 42, 0.84f, ForestGreen)
            Spacer(Modifier.height(8.dp))
            SignalBarItem("GPS 15", 38, 0.76f, ForestGreen)
            Spacer(Modifier.height(8.dp))
            SignalBarItem("GLONASS 8", 36, 0.72f, ForestGreen)
            Spacer(Modifier.height(8.dp))
            SignalBarItem("Galileo 24", 40, 0.80f, ForestGreen)
            Spacer(Modifier.height(8.dp))
            SignalBarItem("BeiDou 3", 31, 0.62f, Color(0xFF1565C0))
            Spacer(Modifier.height(8.dp))
            SignalBarItem("NavIC 1", 29, 0.58f, Color(0xFF1565C0))
        }
    }
}

@Composable
private fun SignalBarItem(name: String, db: Int, fraction: Float, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(name, fontSize = 11.sp, fontWeight = FontWeight.Medium, modifier = Modifier.width(80.dp), color = TextPrimary)
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
        Text("$db dB", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = TextPrimary, modifier = Modifier.width(42.dp))
    }
}

// -----------------------------------------------------------------------------
// 8. LIVE COMPASS WIDGET
// -----------------------------------------------------------------------------
@Composable
private fun LiveCompassCard(degrees: Float) {
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
                Text("${degrees.toInt()}° NNE", fontWeight = FontWeight.Bold, color = ForestGreen, fontSize = 14.sp)
            }

            Spacer(Modifier.height(16.dp))

            Box(
                modifier = Modifier.size(140.dp),
                contentAlignment = Alignment.Center
            ) {
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val center = Offset(size.width / 2, size.height / 2)
                    val radius = size.width / 2 - 10.dp.toPx()

                    // Outer dial
                    drawCircle(color = OutlineCard, radius = radius, style = Stroke(width = 2.dp.toPx()))

                    // Cardinal tick marks
                    for (i in 0 until 360 step 30) {
                        val rad = i * PI / 180
                        val startR = radius - if (i % 90 == 0) 10.dp.toPx() else 5.dp.toPx()
                        val p1 = Offset(center.x + startR * sin(rad).toFloat(), center.y - startR * cos(rad).toFloat())
                        val p2 = Offset(center.x + radius * sin(rad).toFloat(), center.y - radius * cos(rad).toFloat())
                        drawLine(color = if (i % 90 == 0) ForestGreen else TextSecondary, start = p1, end = p2, strokeWidth = 2.dp.toPx())
                    }
                }

                // Rotating Needle
                Icon(
                    imageVector = Icons.Filled.Navigation,
                    contentDescription = null,
                    tint = ForestGreen,
                    modifier = Modifier
                        .size(48.dp)
                        .rotate(degrees)
                )
            }
        }
    }
}

// -----------------------------------------------------------------------------
// 9. ACCURACY CIRCLE MAP VISUALIZER
// -----------------------------------------------------------------------------
@Composable
private fun AccuracyCircleMapVisualizer() {
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
                Text("Zoom: 18x", fontSize = 11.sp, color = TextSecondary)
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

                    // Grid lines
                    for (x in 0..size.width.toInt() step 40) {
                        drawLine(Color(0xFFC8E6C9), Offset(x.toFloat(), 0f), Offset(x.toFloat(), size.height), strokeWidth = 1f)
                    }
                    for (y in 0..size.height.toInt() step 40) {
                        drawLine(Color(0xFFC8E6C9), Offset(0f, y.toFloat()), Offset(size.width, y.toFloat()), strokeWidth = 1f)
                    }

                    // Pulsating Accuracy Circle
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

                    // User Location Center Dot
                    drawCircle(color = ForestGreen, radius = 6.dp.toPx(), center = center)
                    drawCircle(color = Color.White, radius = 3.dp.toPx(), center = center)
                }

                Text(
                    text = "± 2.8m Accuracy Boundary",
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
private fun GpsStatusChecklistCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, OutlineCard)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("System Verification Checklist", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = TextPrimary)
            Spacer(Modifier.height(12.dp))

            ChecklistItem("GPS Hardware", "Enabled", CheckStatus.Pass)
            ChecklistItem("Location Services", "Active (High Accuracy)", CheckStatus.Pass)
            ChecklistItem("Fine Location Permission", "Granted", CheckStatus.Pass)
            ChecklistItem("Background Permission", "While In Use", CheckStatus.Warning)
            ChecklistItem("Mock Location Detection", "None Detected (Real GPS)", CheckStatus.Pass)
            ChecklistItem("NTP Internet Sync", "Synced (0.2s drift)", CheckStatus.Pass)
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
private fun DeviceInformationCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, OutlineCard)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Device & Hardware Information", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = TextPrimary)
            Spacer(Modifier.height(12.dp))

            InfoRow("Device Name", "Google Pixel 7 Pro")
            InfoRow("OS Version", "Android 15 (API 35)")
            InfoRow("Location Provider", "Fused Location Provider (GPS + Wi-Fi)")
            InfoRow("GNSS Chipset", "Broadcom BCM47765 Dual-Freq L1/L5")
            InfoRow("Battery Level", "88% (Discharging)")
            InfoRow("Battery Optimization", "Disabled (Unrestricted)")
            InfoRow("App Version", "NSTR Patrol v1.4.2 (Build 269)")
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
private fun DiagnosticReportCard(context: Context) {
    val reportText = """
=== FOREST PATROL GPS DIAGNOSTIC REPORT ===
Timestamp: 2026-08-06 12:54:32 UTC
Device: Google Pixel 7 Pro (Android 15)
App Version: NSTR Patrol v1.4.2

--- LOCATION DATA ---
Latitude: 15.489241° N
Longitude: 79.023418° E
Altitude: 342.5 m MSL
Horizontal Accuracy: ± 2.8 m (Excellent)
Vertical Accuracy: ± 3.1 m
Speed: 1.2 km/h | Bearing: 22.5° NNE

--- GNSS STATUS ---
Health Score: 95% (Optimal)
Satellites Visible: 24 | In Use: 16
Fix Mode: 3D Fix (Locked)
Avg Signal C/N0: 38.4 dB-Hz
Constellations: GPS (10), GLONASS (6), Galileo (5), BeiDou (3), NavIC (2)

--- PERMISSIONS & ENVIRONMENT ---
GPS Hardware: ENABLED
High Accuracy Mode: ACTIVE
Fine Location: GRANTED
Mock Location: NONE DETECTED
Battery Optimization: UNRESTRICTED
    """.trimIndent()

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
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
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
