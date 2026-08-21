package com.nstrpatrol.app.ui.screens

import com.nstrpatrol.app.R

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nstrpatrol.app.data.EmergencyContact
import com.nstrpatrol.app.data.PatrolTimer
import com.nstrpatrol.app.data.SosLogic
import com.nstrpatrol.app.data.SosOutcome
import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.data.lastKnownLocation
import com.nstrpatrol.app.data.map.BackendApiClient
import com.nstrpatrol.app.data.parseEmergencyContacts
import com.nstrpatrol.app.data.sendSos
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.components.SectionHeader
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.ErrorRed
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.StatusCompleted
import com.nstrpatrol.app.ui.theme.StatusInProgress
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

/** Lifecycle of one SOS operation on this screen. */
private enum class SosPhase {
    /** No active SOS operation. */
    Idle,

    /** 5-second cancellation window; nothing persisted yet. */
    Countdown,

    /** Room saved; immediate server attempt running. */
    Sending,

    /** Server accepted (201) or idempotently replayed (200). */
    Sent,

    /** Saved locally as PENDING; SyncManager will upload it. */
    Queued,

    /** Server returned SOS_COOLDOWN. */
    Cooldown,

    /** Non-retryable / user-actionable failure. */
    Error
}

@Composable
fun SosScreen(
    api: BackendApiClient,
    dao: TelemetryDao,
    patrolTimer: PatrolTimer,
    onTabSelected: (BottomTab) -> Unit
) {
    val context = LocalContext.current

    var phase by remember { mutableStateOf(SosPhase.Idle) }
    var countdownLeft by remember { mutableIntStateOf(SosLogic.COUNTDOWN_SECONDS) }
    var cooldownLeft by remember { mutableIntStateOf(0) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var authPending by remember { mutableStateOf(false) }

    // Honest GPS hint for the idle state; the actual fix is re-captured at send time.
    val locationAvailable = remember { lastKnownLocation(context) != null }

    var contacts by remember { mutableStateOf(emptyList<EmergencyContact>()) }
    var contactsLoading by remember { mutableStateOf(true) }
    var contactsError by remember { mutableStateOf(false) }

    // Real emergency contacts come from the backend (no hardcoded list). An
    // offline/error state shows an honest error instead of fabricated data.
    LaunchedEffect(Unit) {
        contactsLoading = true
        contactsError = false
        try {
            val text = withContext(Dispatchers.IO) { api.getText("/api/sos/contacts") }
            contacts = parseEmergencyContacts(text)
            contactsError = text == null
        } catch (_: Exception) {
            contactsError = true
        } finally {
            contactsLoading = false
        }
    }

    // Drives the whole state machine; changing [phase] cancels the previous
    // branch, which is exactly how CANCEL aborts a running countdown.
    LaunchedEffect(phase) {
        when (phase) {
            SosPhase.Countdown -> {
                countdownLeft = SosLogic.COUNTDOWN_SECONDS
                while (countdownLeft > 0) {
                    delay(1_000)
                    countdownLeft--
                }
                phase = SosPhase.Sending
            }

            SosPhase.Sending -> {
                // Guarded by phase == Sending, so repeated taps cannot queue
                // duplicate sends; the callback always lands on the main thread.
                sendSos(
                    dao = dao,
                    api = api,
                    patrolId = patrolTimer.patrolId.takeIf { patrolTimer.isRunning() },
                    context = context
                ) { outcome ->
                    when (outcome) {
                        is SosOutcome.Delivered -> phase = SosPhase.Sent
                        is SosOutcome.QueuedOffline -> phase = SosPhase.Queued
                        is SosOutcome.AuthPending -> {
                            authPending = true
                            errorMessage = null
                            phase = SosPhase.Error
                        }

                        is SosOutcome.Cooldown -> {
                            cooldownLeft = outcome.retryAfterSeconds ?: 60
                            phase = SosPhase.Cooldown
                        }

                        is SosOutcome.Rejected -> {
                            authPending = false
                            errorMessage = outcome.message
                            phase = SosPhase.Error
                        }
                    }
                }
            }

            SosPhase.Sent, SosPhase.Queued -> {
                delay(4_000)
                phase = SosPhase.Idle
            }

            SosPhase.Cooldown -> {
                while (cooldownLeft > 0) {
                    delay(1_000)
                    cooldownLeft--
                }
                phase = SosPhase.Idle
            }

            else -> Unit
        }
    }

    NstrScaffold(
        title = stringResource(R.string.sos_title),
        subtitle = stringResource(R.string.sos_subtitle),
        activeTab = BottomTab.Home,
        onTabSelected = onTabSelected
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(16.dp))
            SosButton(
                phase = phase,
                countdownLeft = countdownLeft,
                cooldownLeft = cooldownLeft,
                onPress = {
                    if (phase == SosPhase.Idle) {
                        errorMessage = null
                        authPending = false
                        phase = SosPhase.Countdown
                    }
                },
                onCancel = { if (phase == SosPhase.Countdown) phase = SosPhase.Idle }
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = statusText(phase, countdownLeft, cooldownLeft, errorMessage, authPending),
                color = if (phase == SosPhase.Error) ErrorRed else TextSecondary,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 24.dp)
            )
            if (phase == SosPhase.Idle && !locationAvailable) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = stringResource(R.string.sos_location_unavailable),
                    color = TextSecondary,
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center
                )
            }

            Spacer(Modifier.height(24.dp))
            Column(modifier = Modifier.fillMaxWidth()) {
                SectionHeader(text = stringResource(R.string.sos_emergency_contacts))
                Spacer(Modifier.height(8.dp))
                when {
                    contactsLoading -> Text(
                        text = stringResource(R.string.common_syncing),
                        color = TextSecondary,
                        fontSize = 13.sp
                    )

                    contactsError -> Text(
                        text = stringResource(R.string.sos_contacts_error),
                        color = ErrorRed,
                        fontSize = 13.sp
                    )

                    contacts.isEmpty() -> Text(
                        text = stringResource(R.string.sos_no_contacts),
                        color = TextSecondary,
                        fontSize = 13.sp
                    )

                    else -> contacts.forEach { contact ->
                        ContactRow(contact)
                        Spacer(Modifier.height(8.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun SosButton(
    phase: SosPhase,
    countdownLeft: Int,
    cooldownLeft: Int,
    onPress: () -> Unit,
    onCancel: () -> Unit
) {
    val enabled = phase == SosPhase.Idle
    val circleColor = when (phase) {
        SosPhase.Idle, SosPhase.Countdown, SosPhase.Sending -> ErrorRed
        SosPhase.Sent, SosPhase.Queued -> StatusCompleted
        SosPhase.Cooldown -> StatusInProgress
        SosPhase.Error -> TextSecondary
    }
    val circleText = when (phase) {
        SosPhase.Idle -> "SOS"
        SosPhase.Countdown -> countdownLeft.toString()
        SosPhase.Sending -> "…"
        SosPhase.Sent, SosPhase.Queued -> "✓"
        SosPhase.Cooldown -> cooldownLeft.toString()
        SosPhase.Error -> "!"
    }
    Box(
        modifier = Modifier
            .size(220.dp)
            .alpha(if (enabled || phase == SosPhase.Countdown) 1f else 0.6f)
            .background(circleColor, CircleShape)
            .then(
                if (enabled) {
                    Modifier.clickable(onClick = onPress)
                } else {
                    Modifier
                }
            ),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = circleText,
            color = Color.White,
            fontSize = if (phase == SosPhase.Idle) 40.sp else 64.sp,
            fontWeight = FontWeight.Bold
        )
    }
    if (phase == SosPhase.Countdown) {
        Spacer(Modifier.height(12.dp))
        Text(
            text = stringResource(R.string.action_cancel).uppercase(),
            color = ErrorRed,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .border(1.dp, ErrorRed, RoundedCornerShape(8.dp))
                .clickable(onClick = onCancel)
                .padding(horizontal = 32.dp, vertical = 10.dp)
        )
    }
}

@Composable
private fun statusText(
    phase: SosPhase,
    countdownLeft: Int,
    cooldownLeft: Int,
    errorMessage: String?,
    authPending: Boolean
): String = when (phase) {
    SosPhase.Idle -> stringResource(R.string.sos_tap)
    SosPhase.Countdown -> stringResource(R.string.sos_countdown_hint, countdownLeft)
    SosPhase.Sending -> stringResource(R.string.sos_sending)
    SosPhase.Sent -> stringResource(R.string.sos_sent)
    SosPhase.Queued -> stringResource(R.string.sos_queued)
    SosPhase.Cooldown -> stringResource(R.string.sos_cooldown, cooldownLeft)
    SosPhase.Error -> when {
        authPending -> stringResource(R.string.sos_auth_pending)
        !errorMessage.isNullOrBlank() -> errorMessage
        else -> stringResource(R.string.sos_error_generic)
    }
}

@Composable
private fun ContactRow(contact: EmergencyContact) {
    val context = LocalContext.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
            .background(Surface)
            .then(
                if (contact.dialable) {
                    Modifier.clickable {
                        runCatching {
                            context.startActivity(
                                Intent(Intent.ACTION_DIAL, Uri.parse("tel:${contact.phone}"))
                            )
                        }
                    }
                } else {
                    Modifier
                }
            )
            .padding(horizontal = 14.dp, vertical = 8.dp)
    ) {
        Text(
            text = contact.fullName,
            color = TextPrimary,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium
        )
        Text(
            text = contact.designation,
            color = TextSecondary,
            fontSize = 12.sp
        )
        Text(
            text = contact.phone ?: stringResource(R.string.sos_phone_unavailable),
            color = if (contact.dialable) StatusInProgress else TextSecondary,
            fontSize = 12.sp,
            fontWeight = if (contact.dialable) FontWeight.Medium else FontWeight.Normal
        )
    }
}
