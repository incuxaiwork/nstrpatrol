package com.nstrpatrol.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.TextSecondary
import kotlin.math.cos
import kotlin.math.sin

private val CardinalColor = Color(0xFFE53935)
private val TickColor = Color(0xFF616161)
private val SubTickColor = Color(0xFF9E9E9E)
private val LabelColor = Color(0xFFBDBDBD)
private val DegreeLabelColor = Color(0xFF757575)

/**
 * Detailed rotating compass dial with fixed red pointer at top.
 * The dial rotates by [headingDegrees] while the pointer stays stationary.
 */
@Composable
fun CompassDial(
    headingDegrees: Float,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier.size(260.dp),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.matchParentSize()) {
            val cx = size.width / 2
            val cy = size.height / 2
            val outerRadius = size.width / 2 - 4.dp.toPx()
            val tickRingRadius = outerRadius - 8.dp.toPx()
            val innerRingRadius = outerRadius - 32.dp.toPx()

            // --- Rotating dial ring ---
            drawCircle(
                color = Color(0xFF333333),
                radius = outerRadius,
                style = Stroke(width = 2.dp.toPx())
            )
            drawCircle(
                color = Color(0xFF2A2A2A),
                radius = innerRingRadius,
                style = Stroke(width = 1.dp.toPx())
            )

            // Draw degree ticks and labels on the rotating ring
            for (deg in 0 until 360) {
                val rad = Math.toRadians((deg - headingDegrees).toDouble())
                val cosRad = cos(rad).toFloat()
                val sinRad = sin(rad).toFloat()

                val isMajor = deg % 30 == 0
                val isMinor = deg % 10 == 0
                val isSub = deg % 5 == 0

                if (!isSub) continue

                val tickLength = when {
                    isMajor -> 14.dp.toPx()
                    isMinor -> 9.dp.toPx()
                    else -> 5.dp.toPx()
                }

                val tickStart = tickRingRadius - tickLength
                val x1 = cx + tickStart * sinRad
                val y1 = cy - tickStart * cosRad
                val x2 = cx + tickRingRadius * sinRad
                val y2 = cy - tickRingRadius * cosRad

                val tickColor = when {
                    isMajor -> Color(0xFFE0E0E0)
                    isMinor -> SubTickColor
                    else -> TickColor
                }
                val strokeWidth = when {
                    isMajor -> 2.dp.toPx()
                    isMinor -> 1.2.dp.toPx()
                    else -> 0.8.dp.toPx()
                }

                drawLine(
                    color = tickColor,
                    start = Offset(x1, y1),
                    end = Offset(x2, y2),
                    strokeWidth = strokeWidth
                )
            }

            // Draw cardinal and degree labels on the ring
            val cardinals = mapOf(
                0 to "North",
                90 to "East",
                180 to "South",
                270 to "West"
            )
            val degreeLabels = listOf(30, 60, 120, 150, 210, 240, 300, 330)

            // Cardinal labels
            for ((deg, label) in cardinals) {
                val rad = Math.toRadians((deg - headingDegrees).toDouble())
                val labelRadius = tickRingRadius - 22.dp.toPx()
                val x = cx + labelRadius * sin(rad).toFloat()
                val y = cy - labelRadius * cos(rad).toFloat()

                val paint = android.graphics.Paint().apply {
                    color = if (deg == 0) CardinalColor.hashCode() else LabelColor.hashCode()
                    textSize = if (deg == 0) 13.sp.toPx() else 11.sp.toPx()
                    textAlign = android.graphics.Paint.Align.CENTER
                    isFakeBoldText = deg == 0
                    isAntiAlias = true
                }
                drawContext.canvas.nativeCanvas.drawText(label, x, y + paint.textSize / 3, paint)
            }

            // Degree labels (30, 60, etc.)
            for (deg in degreeLabels) {
                val rad = Math.toRadians((deg - headingDegrees).toDouble())
                val labelRadius = tickRingRadius - 20.dp.toPx()
                val x = cx + labelRadius * sin(rad).toFloat()
                val y = cy - labelRadius * cos(rad).toFloat()

                val paint = android.graphics.Paint().apply {
                    color = DegreeLabelColor.hashCode()
                    textSize = 10.sp.toPx()
                    textAlign = android.graphics.Paint.Align.CENTER
                    isAntiAlias = true
                }
                drawContext.canvas.nativeCanvas.drawText("$deg", x, y + paint.textSize / 3, paint)
            }

            // --- Fixed red pointer at top ---
            val pointerSize = 14.dp.toPx()
            val pointerY = tickRingRadius + 2.dp.toPx()
            val path = android.graphics.Path().apply {
                moveTo(cx, cy - outerRadius - pointerSize)
                lineTo(cx - pointerSize * 0.6f, cy - outerRadius)
                lineTo(cx + pointerSize * 0.6f, cy - outerRadius)
                close()
            }
            drawContext.canvas.nativeCanvas.drawPath(
                path,
                android.graphics.Paint().apply {
                    color = CardinalColor.hashCode()
                    style = android.graphics.Paint.Style.FILL
                    isAntiAlias = true
                }
            )

            // Small line from pointer to ring
            drawLine(
                color = CardinalColor,
                start = Offset(cx, cy - outerRadius),
                end = Offset(cx, cy - outerRadius + 6.dp.toPx()),
                strokeWidth = 2.dp.toPx()
            )
        }
    }
}
