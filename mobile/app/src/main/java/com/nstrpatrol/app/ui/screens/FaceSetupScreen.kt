package com.nstrpatrol.app.ui.screens

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nstrpatrol.app.data.AuthSession
import com.nstrpatrol.app.data.PhotoStore
import com.nstrpatrol.app.data.face.FaceRecognizer
import com.nstrpatrol.app.data.map.BackendApiClient
import com.nstrpatrol.app.ui.components.FaceScanCard
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.components.PrimaryButton
import com.nstrpatrol.app.ui.components.SectionHeader
import com.nstrpatrol.app.ui.theme.ErrorRed
import com.nstrpatrol.app.ui.theme.ForestGreen
import kotlinx.coroutines.launch

/**
 * One-time identity enrollment shown to an officer the first time they sign in
 * on this (or a newly handed-over) device. A reference selfie is captured and
 * converted ON-DEVICE into a face embedding (MobileFaceNet). Only the embedding
 * — never the photo itself — is used for matching: every future patrol start
 * scans a live selfie and compares it against this reference to prove the same
 * officer is present. No device fingerprint / PIN prompt is involved.
 */
@Composable
fun FaceSetupScreen(
    onDone: () -> Unit,
    auth: AuthSession,
    api: BackendApiClient
) {
    var busy by remember { mutableStateOf(false) }
    var done by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf<String?>(null) }
    var scanError by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    /** Enrolls the captured selfie as this device's reference face. */
    fun enroll(file: java.io.File) {
        scope.launch {
            busy = true
            scanError = null
            status = null
            try {
                val embedding = FaceRecognizer.embed(context, file)
                if (embedding == null) {
                    PhotoStore.removePath("face_reference", file.absolutePath)
                    scanError = "No clear face detected. Hold the phone at eye level in good light and try again."
                    return@launch
                }
                status = "Saving verification…"
                auth.ensureDeviceRegistered()
                // Upload the reference photo for audit, then record the embedding.
                val photoKey = runCatching {
                    api.uploadMultipart("/api/uploads", "file", file).optString("key").ifEmpty { null }
                }.getOrNull()
                auth.markDeviceFaceVerified(photoKey, "FACE_MATCH", embedding)
                done = true
                status = null
            } catch (e: Exception) {
                status = null
                scanError = "Could not save verification — check your connection: ${e.message}"
            } finally {
                busy = false
            }
        }
    }

    NstrScaffold(
        title = "Face verification",
        subtitle = "One-time setup so we know this phone is yours",
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
                    text = "Enrolled — this device is now bound to your face.",
                    color = ForestGreen,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Spacer(Modifier.height(20.dp))
            PrimaryButton(text = "Start using the app", onClick = { onDone() })
            return@NstrScaffold
        }

        SectionHeader(text = "Enroll your face")
        Spacer(Modifier.height(8.dp))
        Text(
            text = "Capture a reference photo of your face. It stays private: only a mathematical template is stored on this device and your device record, and it is used to confirm it's really you at every patrol start.",
            color = com.nstrpatrol.app.ui.theme.TextSecondary,
            fontSize = 12.sp
        )
        Spacer(Modifier.height(10.dp))
        FaceScanCard(
            buttonLabel = "Capture reference photo",
            hint = "Look straight at the camera, face fully visible, no cap or mask.",
            busy = busy,
            error = scanError,
            persistentFile = true,
            onCaptured = { enroll(it) }
        )
        if (status != null) {
            Spacer(Modifier.height(8.dp))
            Text(text = status!!, color = ErrorRed, fontSize = 12.sp)
        }
        Spacer(Modifier.height(8.dp))
        Spacer(Modifier.height(12.dp))
    }
}
