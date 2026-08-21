package com.nstrpatrol.app.ui.screens

import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.nstrpatrol.app.data.AuthSession
import com.nstrpatrol.app.data.PhotoStore
import com.nstrpatrol.app.data.map.BackendApiClient
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.components.PhotoPlaceholder
import com.nstrpatrol.app.ui.components.PrimaryButton
import com.nstrpatrol.app.ui.components.SectionHeader
import com.nstrpatrol.app.ui.theme.ErrorRed
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextSecondary
import java.io.File
import kotlinx.coroutines.launch

/**
 * One-time face-verification setup shown to an officer the first time they sign in
 * on this (or a newly handed-over) device. The officer captures a reference
 * selfie and the device's built-in face recognition confirms identity; the result
 * is recorded server-side on this handset's Device row so a new device or a new
 * officer triggers setup again.
 */
@Composable
fun FaceSetupScreen(
    onDone: () -> Unit,
    onOpenCamera: (String) -> Unit,
    auth: AuthSession,
    api: BackendApiClient
) {
    val slot = "face_reference"
    LaunchedEffect(Unit) {
        onDone()
    }
    var photoPaths by remember { mutableStateOf(PhotoStore.paths(slot)) }
    var biometricOk by remember { mutableStateOf<Boolean?>(null) }
    var faceEnrolled by remember { mutableStateOf<Boolean?>(null) }
    var busy by remember { mutableStateOf(false) }
    var done by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf<String?>(null) }
    var promptKey by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    fun finish(mode: String) {
        scope.launch {
            busy = true
            status = "Saving verification…"
            try {
                val key = uploadReferenceOrNull(api, photoPaths)
                auth.ensureDeviceRegistered()
                auth.markDeviceFaceVerified(key, mode)
                done = true
                status = null
            } catch (e: Exception) {
                status = "Could not save verification — check your connection: ${e.message}"
            } finally {
                busy = false
            }
        }
    }

    val context = LocalContext.current
    LaunchedEffect(Unit) {
        val allowed = BiometricManager.Authenticators.BIOMETRIC_WEAK or
            BiometricManager.Authenticators.DEVICE_CREDENTIAL
        biometricOk =
            BiometricManager.from(context).canAuthenticate(allowed) == BiometricManager.BIOMETRIC_SUCCESS
        faceEnrolled = hasFaceEnrolled(context)
    }

    val executor = remember(context) { ContextCompat.getMainExecutor(context) }
    val authenticationCallback = remember {
        object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                finish("FACE_BIOMETRIC")
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                if (errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON &&
                    errorCode != BiometricPrompt.ERROR_USER_CANCELED
                ) {
                    status = errString.toString()
                }
            }

            override fun onAuthenticationFailed() {
                status = "Face not recognized. Please try again."
            }
        }
    }
    val promptInfo = remember {
        BiometricPrompt.PromptInfo.Builder()
            .setTitle("Officer identity verification")
            .setSubtitle("Use this device's face recognition to confirm you are the assigned officer")
            .setDescription("This ties your account to this handset. You'll re-verify automatically if the device changes.")
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_WEAK or
                    BiometricManager.Authenticators.DEVICE_CREDENTIAL
            )
            .build()
    }

    LaunchedEffect(promptKey) {
        if (promptKey > 0 && biometricOk == true) {
            val activity = context as? FragmentActivity
            if (activity != null) {
                try {
                    BiometricPrompt(activity, executor, authenticationCallback).authenticate(promptInfo)
                } catch (e: Exception) {
                    status = "Could not start face verification: ${e.message}"
                }
            } else {
                status = "Face verification is not available here."
            }
        }
    }

    NstrScaffold(
        title = "Face verification setup",
        subtitle = "One-time setup so we know this device is yours",
        activeTab = null,
        onTabSelected = null
    ) {
        Spacer(Modifier.height(8.dp))

        if (done) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(ForestGreen.copy(alpha = 0.1f), RoundedCornerShape(8.dp))
                    .border(1.dp, ForestGreen.copy(alpha = 0.5f), RoundedCornerShape(8.dp))
                    .padding(14.dp)
            ) {
                Text(
                    text = "Face verified — this device is now bound to your account.",
                    color = ForestGreen,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Spacer(Modifier.height(20.dp))
            PrimaryButton(text = "Start using the app", onClick = { onDone() })
            return@NstrScaffold
        }

        SectionHeader(text = "Step 1 — Take your officer photo")
        Spacer(Modifier.height(8.dp))
        PhotoPlaceholder(
            actionText = "Take my photo",
            hint = "A clear, front-facing photo of your face",
            photoPaths = photoPaths,
            onClick = { onOpenCamera(slot) },
            onRemovePhoto = { path ->
                PhotoStore.removePath(slot, path)
                photoPaths = PhotoStore.paths(slot)
            }
        )

        Spacer(Modifier.height(16.dp))
        SectionHeader(text = "Step 2 — Prove your identity on this device")
        Spacer(Modifier.height(8.dp))
        Text(
            text = when {
                biometricOk == false && faceEnrolled == false ->
                    "This phone has no face or fingerprint set up. You can finish with a photo-only verification, or enrol a face in device Settings and return."
                biometricOk == false ->
                    "This phone has no enrolled biometrics. You can finish with photo-only verification, or enrol a face in device Settings and return."
                faceEnrolled == true ->
                    "Your device will use its built-in face recognition against the face it has enrolled."
                biometricOk == true && faceEnrolled == false ->
                    "Your device can verify via face, fingerprint or device PIN. For a face-only check, enable Face unlock in device Settings first."
                else -> "Checking device capabilities…"
            },
            color = TextSecondary,
            fontSize = 12.sp
        )
        Spacer(Modifier.height(8.dp))
        if (faceEnrolled == false && biometricOk == true) {
            Box(
                modifier = Modifier
                    .background(Surface, RoundedCornerShape(8.dp))
                    .border(1.dp, Color(0xFFDDDDDD), RoundedCornerShape(8.dp))
                    .clickable { openFaceEnrollmentSettings(context) }
                    .padding(horizontal = 14.dp, vertical = 12.dp)
            ) {
                Text(
                    text = "Enable Face unlock in Settings",
                    color = ForestGreen,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Spacer(Modifier.height(8.dp))
        }

        Spacer(Modifier.height(12.dp))
        if (busy) {
            Box(
                modifier = Modifier.fillMaxWidth().height(22.dp),
                contentAlignment = Alignment.CenterStart
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.height(18.dp),
                    strokeWidth = 2.dp,
                    color = ForestGreen
                )
            }
            Spacer(Modifier.height(6.dp))
        }
        if (status != null) {
            Text(text = status!!, color = ErrorRed, fontSize = 12.sp)
            Spacer(Modifier.height(8.dp))
        }

        when {
            biometricOk == true -> PrimaryButton(
                text = "Verify my face & finish setup",
                onClick = {
                    status = null
                    promptKey += 1
                }
            )
            biometricOk == false -> PrimaryButton(
                text = "Save photo-only verification",
                onClick = {
                    if (!PhotoStore.has(slot)) {
                        status = "Take your officer photo first (Step 1)."
                    } else {
                        status = null
                        finish("PHOTO_ONLY")
                    }
                }
            )
            else -> {}
        }
        Spacer(Modifier.height(8.dp))
        Spacer(Modifier.height(12.dp))
    }
}

/** Uploads the reference selfie and returns its storage key (or null when none/upload fails). */
private fun uploadReferenceOrNull(api: BackendApiClient, photoPaths: List<String>): String? {
    val path = photoPaths.firstOrNull() ?: return null
    val file = File(path)
    if (!file.exists()) return null
    return runCatching { api.uploadMultipart("/api/uploads", "file", file).optString("key").ifEmpty { null } }
        .getOrNull()
}

/** Whether this device has a face enrolled in the system (API 29+; null when unknown). */
private fun hasFaceEnrolled(context: android.content.Context): Boolean? {
    if (Build.VERSION.SDK_INT < 29) return null
    return runCatching {
        val fm = context.getSystemService("face") ?: return null
        val cls = Class.forName("android.hardware.biometrics.FaceManager")
        cls.getMethod("hasEnrolledFaces").invoke(fm) as Boolean
    }.getOrNull()
}

/** Deep-links into the OS face-enrolment settings when available. */
private fun openFaceEnrollmentSettings(context: android.content.Context) {
    val intent = if (Build.VERSION.SDK_INT >= 28) {
        runCatching {
            Intent(Settings.ACTION_BIOMETRIC_ENROLL).apply {
                putExtra(
                    Settings.EXTRA_BIOMETRIC_AUTHENTICATORS_ALLOWED,
                    BiometricManager.Authenticators.BIOMETRIC_WEAK
                )
            }
        }.getOrElse { Intent(Settings.ACTION_SECURITY_SETTINGS) }
    } else {
        Intent(Settings.ACTION_SECURITY_SETTINGS)
    }
    runCatching { context.startActivity(intent) }
}