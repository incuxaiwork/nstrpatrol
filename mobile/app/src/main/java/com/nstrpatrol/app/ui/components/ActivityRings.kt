package com.nstrpatrol.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.LightForest
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

private val StepsRingColor = ForestGreen
private val MoveRingColor = Color(0xFF00897B)
private val CalRingColor = Color(0xFFFF8F00)
private val RingBackground = Color(0xFFE8E8E8)
private const val STROKE_WIDTH = 12f

@Composable
fun ActivityRings(
    steps: Int,
    stepsGoal: Int,
    moveMinutes: Int,
    moveGoal: Int,
    calories: Double,
    calGoal: Int,
    modifier: Modifier = Modifier
) {
    val stepsProgress = if (stepsGoal > 0) (steps.toFloat() / stepsGoal).coerceIn(0f, 1f) else 0f
    val moveProgress = if (moveGoal > 0) (moveMinutes.toFloat() / moveGoal).coerceIn(0f, 1f) else 0f
    val calProgress = if (calGoal > 0) (calories.toFloat() / calGoal).coerceIn(0f, 1f) else 0f

    val animSteps = remember { Animatable(0f) }
    val animMove = remember { Animatable(0f) }
    val animCal = remember { Animatable(0f) }

    LaunchedEffect(stepsProgress, moveProgress, calProgress) {
        animSteps.snapTo(0f)
        animMove.snapTo(0f)
        animCal.snapTo(0f)
        coroutineScope {
            launch { animSteps.animateTo(stepsProgress, tween(800)) }
            launch { animMove.animateTo(moveProgress, tween(800)) }
            launch { animCal.animateTo(calProgress, tween(800)) }
        }
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(contentAlignment = Alignment.Center) {
            Canvas(modifier = Modifier.size(140.dp)) {
                val padding = STROKE_WIDTH / 2
                val sweepAngle = 360f
                val gapAngle = 12f

                listOf(
                    RingData(animSteps.value, StepsRingColor),
                    RingData(animMove.value, MoveRingColor),
                    RingData(animCal.value, CalRingColor)
                ).forEachIndexed { index, ring ->
                    val stroke = Stroke(
                        width = STROKE_WIDTH,
                        cap = StrokeCap.Round
                    )
                    val diameter = size.width - padding * 2 - index * (STROKE_WIDTH + 4)
                    val topLeft = Offset(
                        (size.width - diameter) / 2,
                        (size.height - diameter) / 2
                    )
                    drawArc(
                        color = RingBackground,
                        startAngle = -90f,
                        sweepAngle = sweepAngle,
                        useCenter = false,
                        topLeft = topLeft,
                        size = Size(diameter, diameter),
                        style = stroke
                    )
                    if (ring.progress > 0f) {
                        drawArc(
                            color = ring.color,
                            startAngle = -90f,
                            sweepAngle = (sweepAngle - gapAngle) * ring.progress,
                            useCenter = false,
                            topLeft = topLeft,
                            size = Size(diameter, diameter),
                            style = stroke
                        )
                    }
                }
            }

            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = formatNumber(steps),
                    color = TextPrimary,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "steps",
                    color = TextSecondary,
                    fontSize = 12.sp
                )
            }
        }

        Spacer(Modifier.height(12.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            RingLegend("Steps", formatNumber(steps), formatNumber(stepsGoal), StepsRingColor)
            RingLegend("Move min", "$moveMinutes", "$moveGoal", MoveRingColor)
            RingLegend("Cal", String.format("%.0f", calories), "$calGoal", CalRingColor)
        }
    }
}

@Composable
private fun RingLegend(label: String, value: String, goal: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Canvas(modifier = Modifier.size(8.dp)) {
            drawCircle(color = color)
        }
        Spacer(Modifier.width(4.dp))
        Column {
            Text(
                text = "$value / $goal",
                color = TextPrimary,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium
            )
            Text(
                text = label,
                color = TextSecondary,
                fontSize = 11.sp
            )
        }
    }
}

private data class RingData(val progress: Float, val color: Color)

private fun formatNumber(n: Int): String = when {
    n >= 1000 -> String.format("%.1fk", n / 1000.0)
    else -> "$n"
}
