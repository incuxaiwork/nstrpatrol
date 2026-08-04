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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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

@Composable
fun MapsScreen(onTabSelected: (BottomTab) -> Unit) {
    var satellite by remember { mutableStateOf(true) }
    var routes by remember { mutableStateOf(true) }
    var markers by remember { mutableStateOf(true) }

    NstrScaffold(
        title = "Maps",
        subtitle = "Live patrol area",
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
            Box(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .padding(end = 16.dp)
                    .size(48.dp)
                    .background(ForestGreen, RoundedCornerShape(24.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Filled.Place,
                    contentDescription = "Location",
                    tint = Color.White,
                    modifier = Modifier.size(24.dp)
                )
            }
        }

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
