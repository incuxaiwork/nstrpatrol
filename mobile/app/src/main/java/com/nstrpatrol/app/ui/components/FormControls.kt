package com.nstrpatrol.app.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nstrpatrol.app.data.PhotoUtils
import com.nstrpatrol.app.ui.theme.BeigeAccent
import com.nstrpatrol.app.ui.theme.ErrorRed
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.OutlineSoft
import com.nstrpatrol.app.ui.theme.SeverityHigh
import com.nstrpatrol.app.ui.theme.SeverityLow
import com.nstrpatrol.app.ui.theme.SeverityMedium
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.SurfaceVariant
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary
import java.io.File

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
    modifier: Modifier = Modifier,
    isError: Boolean = false,
    enabled: Boolean = true
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (enabled) Surface else SurfaceVariant)
            .border(1.dp, if (isError) ErrorRed else OutlineSoft, RoundedCornerShape(8.dp))
            .then(if (enabled) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = value ?: placeholder,
            modifier = Modifier.weight(1f),
            color = if (!enabled) TextSecondary.copy(alpha = 0.45f)
            else if (value != null) TextPrimary else if (isError) ErrorRed else TextSecondary,
            fontSize = 14.sp,
            fontWeight = FontWeight.Normal
        )
        Icon(
            imageVector = Icons.Filled.ArrowDropDown,
            contentDescription = "Select",
            tint = if (enabled) TextSecondary else TextSecondary.copy(alpha = 0.4f)
        )
    }
}

/** Dashed photo placeholder with camera glyph + action text, or the captured thumbnail strip. */
@Composable
fun PhotoPlaceholder(
    actionText: String,
    hint: String,
    modifier: Modifier = Modifier,
    photoPaths: List<String> = emptyList(),
    onClick: () -> Unit = {},
    onRemovePhoto: (String) -> Unit = {}
) {
    var fullScreenPhotoPath by remember { mutableStateOf<String?>(null) }
    val photos = photoPaths.filter { File(it).exists() }
    if (photos.isNotEmpty()) {
        LazyRow(
            modifier = modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items(photos) { path ->
                val bitmap = com.nstrpatrol.app.data.rememberAsyncBitmap(path)
                Box(
                    modifier = Modifier
                        .size(110.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
                        .clickable { fullScreenPhotoPath = path },
                    contentAlignment = Alignment.BottomEnd
                ) {
                    if (bitmap != null) {
                        Image(
                            bitmap = bitmap,
                            contentDescription = "Captured photo",
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop
                        )
                    } else {
                        Box(Modifier.fillMaxSize().background(Surface))
                    }
                    Box(
                        modifier = Modifier
                            .padding(6.dp)
                            .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(4.dp))
                            .clickable(onClick = onClick)
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Text(
                            text = "Retake",
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(4.dp)
                            .size(22.dp)
                            .background(Color(0xCC111111), CircleShape)
                            .clickable { onRemovePhoto(path) }
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Close,
                            contentDescription = "Remove photo",
                            tint = Color.White,
                            modifier = Modifier.size(14.dp).align(Alignment.Center)
                        )
                    }
                }
            }
            item {
                Box(
                    modifier = Modifier
                        .size(width = 120.dp, height = 96.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Surface)
                        .dashedBorder(BeigeAccent)
                        .clickable(onClick = onClick),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = Icons.Filled.PhotoCamera,
                            contentDescription = null,
                            tint = ForestGreen,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "Add photo",
                            color = ForestGreen,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }
        return
    }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .height(120.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Surface)
            .dashedBorder(BeigeAccent)
            .clickable(onClick = onClick),
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

private fun decodeBitmap(path: String) =
    PhotoUtils.loadBitmap(path)?.asImageBitmap()

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
 * Severity selector (Low / Medium / High). The selected option renders with its
 * severity colour and white text, others with a 12% tint of the same colour.
 * Placed on each individual report category page per the Penpot flow.
 */
@Composable
fun SeverityControl(
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = mapOf("Low" to SeverityLow, "Medium" to SeverityMedium, "High" to SeverityHigh)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(38.dp)
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
            .background(Surface)
            .padding(2.dp)
    ) {
        listOf("Low", "Medium", "High").forEach { option ->
            val isSelected = option == selected
            val color = colors.getValue(option)
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(30.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(if (isSelected) color else color.copy(alpha = 0.12f))
                    .then(
                        if (isSelected) Modifier.border(1.5.dp, color, RoundedCornerShape(6.dp))
                        else Modifier
                    )
                    .clickable { onSelect(option) },
                contentAlignment = Alignment.Center
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (isSelected) {
                        Icon(
                            imageVector = Icons.Filled.Check,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(Modifier.width(4.dp))
                    }
                    Text(
                        text = option,
                        color = if (isSelected) Color.White else color,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

/**
 * Auto-captured details panel (GPS coords, timestamp, officer, beat, accuracy...)
 * shown at the bottom of every report category page. Mirrors the "Captured" panel
 * in the Penpot designs. All values are passed in by the caller from real captured
 * data (location, trusted time, signed-in officer, sync status); any null field
 * shows a placeholder rather than a hardcoded default.
 */
@Composable
fun AutoCapturedPanel(
    modifier: Modifier = Modifier,
    gps: String? = null,
    timestamp: String? = null,
    officer: String? = null,
    badge: String? = null,
    beat: String? = null,
    accuracy: String? = null,
    saved: String? = null
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
            .background(Surface)
    ) {
        AutoDetailRow(label = "GPS coordinates", value = gps ?: "—")
        AutoDetailRow(label = "Timestamp", value = timestamp ?: "—")
        AutoDetailRow(label = "Officer", value = officer ?: "—")
        AutoDetailRow(label = "Badge", value = badge ?: "—")
        AutoDetailRow(label = "Beat", value = beat ?: "—")
        AutoDetailRow(label = "GPS accuracy", value = accuracy ?: "—")
        AutoDetailRow(label = "Saved", value = saved ?: "—")
    }
}

/**
 * Read-only label/value rows inside a bordered card (used for detail views).
 */
@Composable
fun DetailPanel(
    rows: List<Pair<String, String>>,
    modifier: Modifier = Modifier
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val clipboardManager = androidx.compose.ui.platform.LocalClipboardManager.current

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
            .background(Surface)
    ) {
        rows.forEachIndexed { index, (label, value) ->
            if (index > 0) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(Color(0xFFEEEEEE))
                )
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = label,
                    color = TextSecondary,
                    fontSize = 12.sp,
                    modifier = Modifier.weight(1f)
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = value,
                        color = TextPrimary,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium
                    )
                    if (label.contains("ID", ignoreCase = true) || label.contains("Id", ignoreCase = true)) {
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(ForestGreen.copy(alpha = 0.12f))
                                .clickable {
                                    clipboardManager.setText(androidx.compose.ui.text.AnnotatedString(value))
                                    android.widget.Toast.makeText(context, "Report ID copied!", android.widget.Toast.LENGTH_SHORT).show()
                                }
                                .padding(5.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Filled.ContentCopy,
                                contentDescription = "Copy Report ID",
                                tint = ForestGreen,
                                modifier = Modifier.size(14.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

/** Small status pill (bordered, tinted background) used on list cards and details. */
@Composable
fun StatusChip(
    label: String,
    chipColor: Color,
    chipBackground: Color,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .border(1.dp, chipColor.copy(alpha = 0.35f), RoundedCornerShape(4.dp))
            .background(chipBackground)
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Text(
            text = label,
            color = chipColor,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun AutoDetailRow(label: String, value: String) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 10.dp)
        ) {
            Text(
                text = label,
                color = TextSecondary,
                fontSize = 12.sp,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = value,
                color = TextPrimary,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium
            )
        }
        Box(
            Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(Color(0xFFEEEEEE))
        )
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

/** Full screen image viewer lightbox dialog for viewing captured photos. */
@Composable
fun FullScreenImageViewerDialog(
    photoPath: String?,
    onDismiss: () -> Unit
) {
    if (photoPath == null) return
    val bitmap = com.nstrpatrol.app.data.rememberAsyncBitmap(photoPath)

    androidx.compose.ui.window.Dialog(
        onDismissRequest = onDismiss,
        properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
                .clickable(onClick = onDismiss),
            contentAlignment = Alignment.Center
        ) {
            if (bitmap != null) {
                Image(
                    bitmap = bitmap,
                    contentDescription = "Full Screen Photo",
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp),
                    contentScale = ContentScale.Fit
                )
            } else {
                Text(text = "Image file not found", color = Color.White)
            }

            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(24.dp)
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.6f))
                    .clickable(onClick = onDismiss),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = "Close",
                    tint = Color.White,
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}
