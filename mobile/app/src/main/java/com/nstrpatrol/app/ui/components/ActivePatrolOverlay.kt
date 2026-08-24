package com.nstrpatrol.app.ui.components

import com.nstrpatrol.app.R

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsWalk
import androidx.compose.material.icons.filled.DirectionsBike
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.DirectionsRun
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.nstrpatrol.app.time.MovementMode
import com.nstrpatrol.app.ui.theme.ErrorRed
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary

@Composable
fun ActivePatrolOverlay(
    distanceMeters: Double,
    currentSpeedKmh: Double,
    moveMinutes: Int,
    durationFormatted: String,
    currentMode: MovementMode,
    modifier: Modifier = Modifier
) {
    var animProgress by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(distanceMeters) {
        animProgress = 0f
        animProgress = (distanceMeters / 10_000.0).coerceIn(0.0, 1.0).toFloat()
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
            .background(Color.White)
            .border(1.dp, Color(0xFFE0E0E0), RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = stringResource(R.string.overlay_patrol_in_progress),
                    color = ForestGreen,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = durationFormatted,
                    color = TextPrimary,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }

        Spacer(Modifier.height(12.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            MetricItem(
                label = stringResource(R.string.overlay_distance),
                value = if (distanceMeters >= 1000) String.format("%.1f km", distanceMeters / 1000)
                else String.format("%.0f m", distanceMeters)
            )
            MetricItem(
                label = stringResource(R.string.overlay_speed),
                // Live GPS speed, updated with every fix (not the patrol
                // average) so the ranger sees real-time pace while travelling.
                value = String.format("%.1f km/h", currentSpeedKmh)
            )
            MetricItem(
                label = stringResource(R.string.overlay_move_min),
                value = "$moveMinutes"
            )
        }

        Spacer(Modifier.height(12.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            ModeIcon(mode = currentMode)
            Spacer(Modifier.width(8.dp))
            Text(
                text = currentMode.name.lowercase().replaceFirstChar { it.uppercase() },
                color = TextPrimary,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium
            )
            Spacer(Modifier.weight(1f))
            Text(
                text = stringResource(R.string.overlay_goal, animProgress * 100),
                color = TextSecondary,
                fontSize = 12.sp
            )
        }

        Spacer(Modifier.height(6.dp))
        LinearProgressIndicator(
            progress = { animProgress },
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp)),
            color = ForestGreen,
            trackColor = Color(0xFFE8E8E8)
        )
    }
}

@Composable
private fun MetricItem(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            color = TextPrimary,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = label,
            color = TextSecondary,
            fontSize = 11.sp
        )
    }
}

@Composable
private fun ModeIcon(mode: MovementMode) {
    val icon: ImageVector = when (mode) {
        MovementMode.WALKING -> Icons.Filled.DirectionsWalk
        MovementMode.RUNNING -> Icons.Filled.DirectionsRun
        MovementMode.CYCLING -> Icons.Filled.DirectionsBike
        MovementMode.VEHICLE -> Icons.Filled.DirectionsCar
        else -> Icons.Filled.DirectionsWalk
    }
    Box(
        modifier = Modifier
            .size(28.dp)
            .clip(CircleShape)
            .background(ForestGreen.copy(alpha = 0.1f)),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = mode.name,
            tint = ForestGreen,
            modifier = Modifier.size(18.dp)
        )
    }
}
