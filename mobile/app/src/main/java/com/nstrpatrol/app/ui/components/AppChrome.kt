package com.nstrpatrol.app.ui.components

import androidx.compose.foundation.background
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextSecondary

private val TabIcons: Map<BottomTab, ImageVector> = mapOf(
    BottomTab.Home to Icons.Filled.Home,
    BottomTab.Maps to Icons.Filled.Place,
    BottomTab.Patrol to Icons.Filled.List,
    BottomTab.Reports to Icons.Filled.Warning,
    BottomTab.Settings to Icons.Filled.Settings
)

/** Screen header matching the Penpot designs (title + subtitle + optional avatar). */
@Composable
fun NstrAppBar(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    largeTitle: Boolean = false,
    avatarText: String? = null,
    onBack: (() -> Unit)? = null
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = 24.dp, end = 24.dp, top = 20.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (onBack != null) {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint = ForestGreen
                )
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = if (largeTitle) MaterialTheme.typography.titleMedium
                else MaterialTheme.typography.titleLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (subtitle.isNotEmpty()) {
                Spacer(Modifier.height(2.dp))
                Text(text = subtitle, style = MaterialTheme.typography.bodyMedium)
            }
        }
        if (avatarText != null) {
            Box(
                modifier = Modifier
                    .padding(start = 8.dp)
                    .size(40.dp)
                    .background(ForestGreen, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = avatarText,
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 17.sp
                )
            }
        }
    }
}

/** Five-slot bottom navigation bar from the design (76dp tall, active tab underlined). */
@Composable
fun NstrBottomBar(
    activeTab: BottomTab,
    onTabSelected: (BottomTab) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(Surface)
            .height(76.dp)
    ) {
        BottomTab.entries.forEach { tab ->
            val selected = tab == activeTab
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(76.dp)
                    .clickable { onTabSelected(tab) },
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    if (selected) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .height(3.dp)
                                .background(ForestGreen)
                        )
                        Spacer(Modifier.height(10.dp))
                    } else {
                        Spacer(Modifier.height(13.dp))
                    }
                    Icon(
                        imageVector = TabIcons.getValue(tab),
                        contentDescription = stringResource(tab.labelRes),
                        tint = if (selected) ForestGreen else TextSecondary,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = stringResource(tab.labelRes),
                        color = if (selected) ForestGreen else TextSecondary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

/**
 * Standard screen chrome: header + scrollable content + (optional) bottom nav.
 */
@Composable
fun NstrScaffold(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    largeTitle: Boolean = false,
    avatarText: String? = null,
    onBack: (() -> Unit)? = null,
    activeTab: BottomTab? = null,
    onTabSelected: ((BottomTab) -> Unit)? = null,
    content: @Composable () -> Unit
) {
    Column(modifier = modifier) {
        NstrAppBar(
            title = title,
            subtitle = subtitle,
            largeTitle = largeTitle,
            avatarText = avatarText,
            onBack = onBack
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 24.dp)
                .verticalScroll(rememberScrollState())
                .padding(bottom = 24.dp)
        ) {
            content()
        }
        if (activeTab != null && onTabSelected != null) {
            NstrBottomBar(activeTab = activeTab, onTabSelected = onTabSelected)
        }
    }
}
