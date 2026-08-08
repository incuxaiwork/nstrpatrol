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
 * Compass dial where the ring rotates with heading via trigonometry only.
 * A fixed red pointer at 12-o'clock indicates the current direction.
 *
 * Convention: 0°=N up, 90°=E right, 180°=S down, 270°=W left.
 * In Canvas coords: x=right, y=down. So:
 *   screenX = cx + r * sin(angle)
 *   screenY = cy - r * cos(angle)
 * This maps 0°→top, 90°→right, etc.
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

            // Outer ring
            drawCircle(RingStroke, outerR, style = Stroke(2.dp.toPx()))

            // Dial ticks — all positioned via trig, no canvas rotate()
            drawDialTicks(cx, cy, outerR, animatedHeading)

            // Cardinal and degree labels — positioned via trig
            drawDialLabels(cx, cy, outerR, animatedHeading)

            // Fixed red pointer at top (does not rotate)
            drawFixedPointer(cx, cy, outerR)
        }
    }
}

/**
 * Converts a "compass degree" (0=N, 90=E, ...) to a screen position.
 * Standard compass math: 0°=top (North), 90°=right (East).
 *   screenX = cx + r * sin(angle)
 *   screenY = cy - r * cos(angle)
 */
private fun compassToScreen(cx: Float, cy: Float, r: Float, deg: Float): Offset {
    val rad = Math.toRadians(deg.toDouble())
    return Offset(
        x = cx + r * sin(rad).toFloat(),
        y = cy - r * cos(rad).toFloat()
    )
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

        val visualDeg = deg.toFloat() - heading
        val p1 = compassToScreen(cx, cy, tickInner, visualDeg)
        val p2 = compassToScreen(cx, cy, tickOuter, visualDeg)
        drawLine(color = color, start = p1, end = p2, strokeWidth = strokeW)
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
        val visualDeg = label.deg.toFloat() - heading
        val pos = compassToScreen(cx, cy, labelR, visualDeg)

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

        drawContext.canvas.nativeCanvas.drawText(label.text, pos.x, pos.y + paint.textSize / 3, paint)
    }
}

private fun DrawScope.drawFixedPointer(cx: Float, cy: Float, outerR: Float) {
    val pointerTip = 6.dp.toPx()
    val halfWidth = 8.dp.toPx()
    val baseY = cy - outerR + 2.dp.toPx()

    val path = android.graphics.Path().apply {
        moveTo(cx, cy - outerR - pointerTip)
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

    drawLine(
        color = PointerRed,
        start = Offset(cx, baseY),
        end = Offset(cx, baseY + 8.dp.toPx()),
        strokeWidth = 2.dp.toPx()
    )
}
