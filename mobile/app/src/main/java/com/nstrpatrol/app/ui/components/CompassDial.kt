package com.nstrpatrol.app.ui.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.unit.dp
import kotlin.math.cos
import kotlin.math.sin

private val PointerRed = Color(0xFFE53935)
private val RingStroke = Color(0xFF444444)
private val TickMajor = Color(0xFFE0E0E0)
private val TickMinor = Color(0xFF777777)
private val TickSub = Color(0xFF555555)
private val LabelWhite = Color(0xFFCCCCCC)
private val LabelDim = Color(0xFF666666)

/**
 * Clean rotating compass dial. The dial ring rotates with heading;
 * a fixed red pointer at 12-o'clock indicates the current direction.
 */
@Composable
fun CompassDial(
    headingDegrees: Float,
    modifier: Modifier = Modifier
) {
    val animatedHeading by animateFloatAsState(
        targetValue = headingDegrees,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow),
        label = "heading"
    )

    Box(modifier = modifier.size(280.dp), contentAlignment = Alignment.Center) {
        Canvas(modifier = Modifier.fillMaxSize().padding(8.dp)) {
            val cx = size.width / 2
            val cy = size.height / 2
            val outerR = size.width / 2

            // --- Outer ring ---
            drawCircle(RingStroke, outerR, style = Stroke(2.dp.toPx()))

            // --- Tick marks (drawn on the rotating dial) ---
            drawDialTicks(cx, cy, outerR, animatedHeading)

            // --- Cardinal labels on the rotating dial ---
            drawDialLabels(cx, cy, outerR, animatedHeading)

            // --- Fixed red pointer at top ---
            drawFixedPointer(cx, cy, outerR)
        }
    }
}

private fun DrawScope.drawDialTicks(cx: Float, cy: Float, outerR: Float, heading: Float) {
    val tickOuter = outerR - 3.dp.toPx()

    for (deg in 0 until 360) {
        val isMajor = deg % 30 == 0
        val isMid = deg % 10 == 0
        val isMinor = deg % 5 == 0
        if (!isMinor) continue

        val tickLen = when {
            isMajor -> 16.dp.toPx()
            isMid -> 10.dp.toPx()
            else -> 5.dp.toPx()
        }
        val tickInner = tickOuter - tickLen
        val color = when {
            isMajor -> TickMajor
            isMid -> TickMinor
            else -> TickSub
        }
        val strokeW = when {
            isMajor -> 2.dp.toPx()
            isMid -> 1.2.dp.toPx()
            else -> 0.7.dp.toPx()
        }

        // Rotate each tick by -heading so the dial spins
        rotate(-heading, Offset(cx, cy)) {
            val rad = Math.toRadians(deg.toDouble())
            val sinR = sin(rad).toFloat()
            val cosR = cos(rad).toFloat()
            drawLine(
                color = color,
                start = Offset(cx + tickInner * sinR, cy - tickInner * cosR),
                end = Offset(cx + tickOuter * sinR, cy - tickOuter * cosR),
                strokeWidth = strokeW
            )
        }
    }
}

private fun DrawScope.drawDialLabels(cx: Float, cy: Float, outerR: Float, heading: Float) {
    val labelR = outerR - 28.dp.toPx()

    data class Label(val deg: Int, val text: String, val isCardinal: Boolean, val isRed: Boolean)

    val labels = listOf(
        Label(0, "N", true, true),
        Label(30, "30", false, false),
        Label(60, "60", false, false),
        Label(90, "E", true, false),
        Label(120, "120", false, false),
        Label(150, "150", false, false),
        Label(180, "S", true, false),
        Label(210, "210", false, false),
        Label(240, "240", false, false),
        Label(270, "W", true, false),
        Label(300, "300", false, false),
        Label(330, "330", false, false)
    )

    for (label in labels) {
        val rotatedDeg = label.deg.toFloat() - heading
        val rad = Math.toRadians(rotatedDeg.toDouble())
        val x = cx + labelR * sin(rad).toFloat()
        val y = cy - labelR * cos(rad).toFloat()

        val paint = android.graphics.Paint().apply {
            textSize = when {
                label.isCardinal -> 14.dp.toPx()
                else -> 10.dp.toPx()
            }
            color = when {
                label.isRed -> PointerRed.hashCode()
                label.isCardinal -> LabelWhite.hashCode()
                else -> LabelDim.hashCode()
            }
            textAlign = android.graphics.Paint.Align.CENTER
            isFakeBoldText = label.isCardinal
            isAntiAlias = true
            typeface = if (label.isCardinal) android.graphics.Typeface.DEFAULT_BOLD else android.graphics.Typeface.DEFAULT
        }

        // Only draw if not rotated behind the pointer (optional: always draw)
        drawContext.canvas.nativeCanvas.drawText(label.text, x, y + paint.textSize / 3, paint)
    }
}

private fun DrawScope.drawFixedPointer(cx: Float, cy: Float, outerR: Float) {
    val pointerTip = 6.dp.toPx()
    val pointerBase = outerR - 20.dp.toPx()
    val halfWidth = 8.dp.toPx()

    // Triangle pointer above the ring
    val tipY = cy - outerR - pointerTip
    val baseY = cy - outerR + 2.dp.toPx()

    val path = android.graphics.Path().apply {
        moveTo(cx, tipY)
        lineTo(cx - halfWidth, baseY)
        lineTo(cx + halfWidth, baseY)
        close()
    }

    drawContext.canvas.nativeCanvas.drawPath(
        path,
        android.graphics.Paint().apply {
            color = PointerRed.hashCode()
            style = android.graphics.Paint.Style.FILL
            isAntiAlias = true
        }
    )

    // Vertical line from pointer into the ring
    drawLine(
        color = PointerRed,
        start = Offset(cx, baseY),
        end = Offset(cx, baseY + 8.dp.toPx()),
        strokeWidth = 2.dp.toPx()
    )
}
