package com.nstrpatrol.app.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * Custom icons recreated from the Penpot design vectors (paw logo),
 * keeping the design's exact glyphs without extra icon dependencies.
 */
object NstrIcons {

    val Paw: ImageVector by lazy {
        ImageVector.Builder(
            name = "NstrPaw",
            defaultWidth = 64.dp,
            defaultHeight = 64.dp,
            viewportWidth = 64f,
            viewportHeight = 64f
        ).apply {
            path(fill = SolidColor(Color.White)) {
                moveTo(29.4f, 44f)
                lineTo(20f, 20f)
                lineTo(27.3f, 20f)
                lineTo(35.65f, 34.77f)
                lineTo(39.83f, 21.85f)
                lineTo(44f, 32.92f)
                lineTo(44f, 44f)
                close()
            }
        }.build()
    }

    val Tracks: ImageVector by lazy {
        ImageVector.Builder(
            name = "NstrTracks",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(fill = SolidColor(Color(0xFF1E4620))) {
                moveTo(9f, 8f)
                arcTo(2.5f, 2.5f, 0f, false, true, 4f, 8f)
                arcTo(2.5f, 2.5f, 0f, false, true, 9f, 8f)
                close()
                moveTo(20f, 8f)
                arcTo(2.5f, 2.5f, 0f, false, true, 15f, 8f)
                arcTo(2.5f, 2.5f, 0f, false, true, 20f, 8f)
                close()
                moveTo(14.5f, 4f)
                arcTo(2.2f, 2.2f, 0f, false, true, 10.1f, 4f)
                arcTo(2.2f, 2.2f, 0f, false, true, 14.5f, 4f)
                close()
                moveTo(16.5f, 16f)
                arcTo(4.5f, 3f, 0f, false, true, 7.5f, 16f)
                arcTo(4.5f, 3f, 0f, false, true, 16.5f, 16f)
                close()
            }
        }.build()
    }

    val WaterDrop: ImageVector by lazy {
        ImageVector.Builder(
            name = "NstrWaterDrop",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(fill = SolidColor(Color(0xFF1E4620))) {
                moveTo(12f, 2f)
                curveTo(12f, 2f, 6f, 8.7f, 6f, 14f)
                arcTo(6f, 6f, 0f, false, false, 18f, 14f)
                curveTo(18f, 8.7f, 12f, 2f, 12f, 2f)
                close()
            }
        }.build()
    }
}
