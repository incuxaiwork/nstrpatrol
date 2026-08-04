package com.nstrpatrol.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nstrpatrol.app.ui.theme.ErrorRed
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextSecondary

/** Filled primary action button (48dp, rounded 8). */
@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    height: Int = 48,
    textSize: Int = 15,
    textWeight: FontWeight = FontWeight.Bold,
    container: Color = ForestGreen,
    content: Color = Color.White
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height.dp)
            .background(container, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            color = content,
            fontSize = textSize.sp,
            fontWeight = textWeight
        )
    }
}

/** Outline / secondary button: white background, primary text. */
@Composable
fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    height: Int = 48,
    textSize: Int = 15,
    textWeight: FontWeight = FontWeight.SemiBold
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height.dp)
            .background(Surface, RoundedCornerShape(8.dp))
            .border(1.dp, ForestGreen, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            color = ForestGreen,
            fontSize = textSize.sp,
            fontWeight = textWeight
        )
    }
}

/** Destructive action button (LOG OUT): white surface, error text. */
@Composable
fun DangerButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    height: Int = 48
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height.dp)
            .background(Surface, RoundedCornerShape(8.dp))
            .border(1.dp, ErrorRed, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            color = ErrorRed,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

/** Plain label button used for the "Take photo" control area (not full width). */
@Composable
fun TextButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    color: Color = ForestGreen,
    textSize: Int = 14,
    fontWeight: FontWeight = FontWeight.SemiBold
) {
    Text(
        text = text,
        modifier = modifier
            .padding(vertical = 4.dp)
            .clickable(onClick = onClick),
        color = color,
        fontSize = textSize.sp,
        fontWeight = fontWeight
    )
}
