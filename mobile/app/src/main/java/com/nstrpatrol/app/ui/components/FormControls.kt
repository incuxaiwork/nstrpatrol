package com.nstrpatrol.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nstrpatrol.app.ui.theme.BeigeAccent
import com.nstrpatrol.app.ui.theme.ErrorRed
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.OutlineSoft
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.SurfaceVariant
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary

/** Section header used inside forms (13sp/600). */
@Composable
fun SectionHeader(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = TextSecondary
) {
    Text(
        text = text,
        modifier = modifier,
        color = color,
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold
    )
}

@Composable
private fun RequiredMark(enabled: Boolean) {
    if (enabled) {
        Text(
            text = "*",
            color = ErrorRed,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold
        )
    }
}

/** Field label above a control, e.g. "Human Impact Type *". */
@Composable
fun FieldLabel(
    text: String,
    required: Boolean = false,
    modifier: Modifier = Modifier
) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = text,
            color = TextSecondary,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium
        )
        RequiredMark(required)
    }
}

/**
 * Tappable dropdown-style field: white, rounded 8, 1dp outline, chevron on the
 * right. Shows [value] or the placeholder when no value is set.
 */
@Composable
fun SelectField(
    placeholder: String,
    value: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Surface)
            .border(1.dp, OutlineSoft, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = value ?: placeholder,
            modifier = Modifier.weight(1f),
            color = if (value != null) TextPrimary else TextSecondary,
            fontSize = 14.sp,
            fontWeight = FontWeight.Normal
        )
        Icon(
            imageVector = Icons.Filled.ArrowDropDown,
            contentDescription = "Select",
            tint = TextSecondary
        )
    }
}

/** Dashed photo placeholder with camera glyph + action text. */
@Composable
fun PhotoPlaceholder(
    actionText: String,
    hint: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .height(120.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Surface)
            .dashedBorder(BeigeAccent)
            .clickable { },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Filled.PhotoCamera,
            contentDescription = null,
            tint = ForestGreen,
            modifier = Modifier.size(28.dp)
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = actionText,
            color = ForestGreen,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = hint,
            color = TextSecondary,
            fontSize = 11.sp
        )
    }
}

/** Free text field with grey hint. */
@Composable
fun RemarksField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    height: Int = 100,
    isPassword: Boolean = false
) {
    var passwordVisible by remember { mutableStateOf(false) }
    TextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier
            .fillMaxWidth()
            .height(height.dp)
            .border(1.dp, OutlineCard, RoundedCornerShape(8.dp)),
        placeholder = {
            Text(text = placeholder, color = TextSecondary, fontSize = 14.sp)
        },
        textStyle = MaterialTheme.typography.bodyLarge.copy(color = TextPrimary),
        visualTransformation = if (isPassword && !passwordVisible) {
            PasswordVisualTransformation()
        } else {
            VisualTransformation.None
        },
        trailingIcon = if (isPassword) {
            {
                IconButton(onClick = { passwordVisible = !passwordVisible }) {
                    Icon(
                        imageVector = if (passwordVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                        contentDescription = if (passwordVisible) "Hide password" else "Show password",
                        tint = TextSecondary
                    )
                }
            }
        } else {
            null
        },
        shape = RoundedCornerShape(8.dp),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = Surface,
            unfocusedContainerColor = Surface,
            focusedTextColor = TextPrimary,
            unfocusedTextColor = TextPrimary,
            cursorColor = ForestGreen,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
            disabledIndicatorColor = Color.Transparent,
            focusedPlaceholderColor = TextSecondary,
            unfocusedPlaceholderColor = TextSecondary
        )
    )
}

/**
 * Segmented control: equal-width options. The selected option renders with
 * [selectedColor] background and white text, others on [Surface].
 */
@Composable
fun SegmentedControl(
    options: List<String>,
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    selectedColor: Color = ForestGreen,
    height: Int = 29,
    cornerRadius: Int = 6,
    containerColor: Color = Surface
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
            .background(containerColor)
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        options.forEach { option ->
            val isSelected = option == selected
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(height.dp)
                    .clip(RoundedCornerShape(cornerRadius.dp))
                    .background(if (isSelected) selectedColor else containerColor)
                    .clickable { onSelect(option) },
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = option,
                    color = if (isSelected) Color.White else TextPrimary,
                    fontSize = 12.sp,
                    fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium
                )
            }
        }
    }
}

/**
 * Radio-style Yes/No row used in Water Source form.
 */
@Composable
fun RadioRow(
    label: String,
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(modifier = modifier.fillMaxWidth()) {
        listOf("Yes", "No").forEach { option ->
            val isSelected = option == selected
            Row(
                modifier = Modifier.weight(1f).clickable { onSelect(option) },
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(20.dp)
                        .clip(CircleShape)
                        .background(if (isSelected) ForestGreen else Surface)
                        .border(1.dp, OutlineSoft, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    if (isSelected) {
                        Box(
                            Modifier
                                .size(8.dp)
                                .background(Color.White, CircleShape)
                        )
                    }
                }
                Spacer(Modifier.width(10.dp))
                Text(
                    text = option,
                    color = TextPrimary,
                    fontSize = 14.sp
                )
            }
        }
    }
}

/** +/- counter with circle buttons, used for member & animal counts. */
@Composable
fun Stepper(
    value: Int,
    onMinus: () -> Unit,
    onPlus: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(Surface)
                .border(1.dp, OutlineSoft, CircleShape)
                .clickable(onClick = onMinus),
            contentAlignment = Alignment.Center
        ) {
            Text(text = "−", color = TextSecondary, fontSize = 18.sp, fontWeight = FontWeight.Medium)
        }
        Text(
            text = value.toString(),
            color = TextPrimary,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.width(24.dp),
            textAlign = TextAlign.Center
        )
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(ForestGreen)
                .clickable(onClick = onPlus),
            contentAlignment = Alignment.Center
        ) {
            Text(text = "+", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Medium)
        }
    }
}

/** Dotted border drawn around a rounded-rect container. */
private fun Modifier.dashedBorder(
    color: Color,
    strokeWidth: Float = 1.5f,
    cornerRadius: Dp = 8.dp
): Modifier = this.drawBehind {
    val path = Path().apply {
        addRoundRect(
            RoundRect(0f, 0f, size.width, size.height, CornerRadius(cornerRadius.toPx()))
        )
    }
    drawPath(
        path = path,
        color = color,
        style = Stroke(
            width = strokeWidth,
            cap = StrokeCap.Round,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(2f, 9f))
        )
    )
}
