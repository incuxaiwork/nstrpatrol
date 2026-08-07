package com.nstrpatrol.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FlipCameraAndroid
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Snackbar
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.nstrpatrol.app.data.PhotoStore
import com.nstrpatrol.app.data.PhotoUtils
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executor
import java.util.concurrent.Executors

/**
 * Full-screen multi-photo capture using CameraX.
 *
 * - The camera stays live after each shot; captured photos collect in a
 *   thumbnail strip at the bottom with a per-photo remove button.
 * - Supports switching between the back and front camera via a flip button.
 * - Target rotation is set from the display so captured photos are upright
 *   (correct EXIF orientation), without rotating the whole app.
 * - "Done" writes all session photos into the app-internal captures dir under
 *   PhotoStore slot key [slot] and pops back. Closing without confirming
 *   discards the session photos.
 */
@Composable
fun CameraScreen(
    slot: String,
    onClose: () -> Unit,
    onCaptured: () -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var hasPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    var error by remember { mutableStateOf<String?>(null) }
    var useFrontCamera by remember { mutableStateOf(false) }
    var sessionFiles by remember { mutableStateOf<List<File>>(emptyList()) }
    val executor: Executor = remember { Executors.newSingleThreadExecutor() }

    DisposableEffect(Unit) {
        onDispose {
            sessionFiles.forEach { it.delete() }
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> hasPermission = granted }

    LaunchedEffect(Unit) {
        if (!hasPermission) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        if (hasPermission) {
            var imageCapture by remember { mutableStateOf<ImageCapture?>(null) }
            var previewView by remember { mutableStateOf<PreviewView?>(null) }

            LaunchedEffect(useFrontCamera, previewView) {
                val view = previewView ?: return@LaunchedEffect
                val provider = ProcessCameraProvider.getInstance(context).get()
                val rotation = view.display?.rotation ?: 0
                val preview = Preview.Builder()
                    .setTargetRotation(rotation)
                    .build()
                    .also { p -> p.setSurfaceProvider(view.surfaceProvider) }
                imageCapture = ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .setTargetRotation(rotation)
                    .build()
                provider.unbindAll()
                provider.bindToLifecycle(
                    lifecycleOwner as LifecycleOwner,
                    if (useFrontCamera) {
                        CameraSelector.DEFAULT_FRONT_CAMERA
                    } else {
                        CameraSelector.DEFAULT_BACK_CAMERA
                    },
                    preview,
                    imageCapture
                )
            }

            AndroidView(
                factory = { ctx ->
                    PreviewView(ctx).apply {
                        scaleType = PreviewView.ScaleType.FILL_CENTER
                        previewView = this
                    }
                },
                modifier = Modifier.fillMaxSize()
            )

            IconButton(
                onClick = onClose,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(top = 16.dp, start = 8.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = "Close camera",
                    tint = Color.White,
                    modifier = Modifier.size(32.dp)
                )
            }

            IconButton(
                onClick = { useFrontCamera = !useFrontCamera },
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 16.dp, end = 8.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.FlipCameraAndroid,
                    contentDescription = "Switch camera",
                    tint = Color.White,
                    modifier = Modifier.size(32.dp)
                )
            }

            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(bottom = 40.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                if (sessionFiles.isNotEmpty()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        LazyRow(
                            modifier = Modifier
                                .weight(1f)
                                .padding(horizontal = 16.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            items(sessionFiles, key = { it.absolutePath }) { file ->
                                ThumbnailItem(
                                    file = file,
                                    onRemove = {
                                        file.delete()
                                        sessionFiles = sessionFiles - file
                                    }
                                )
                            }
                        }
                        Box(
                            modifier = Modifier
                                .padding(end = 16.dp)
                                .background(Color(0xFF2E7D32), RoundedCornerShape(10.dp))
                                .clickable {
                                    PhotoStore.set(slot, sessionFiles)
                                    sessionFiles = emptyList()
                                    onCaptured()
                                }
                                .padding(horizontal = 16.dp, vertical = 10.dp)
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(
                                    text = "Done",
                                    color = Color.White,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "${sessionFiles.size} photo" +
                                        if (sessionFiles.size > 1) "s" else "",
                                    color = Color.White.copy(alpha = 0.8f),
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(20.dp))
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .background(Color.White, CircleShape)
                            .clickable {
                                val capture = imageCapture ?: return@clickable
                                val stamp =
                                    SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US).format(Date())
                                val file = File(
                                    PhotoStore.dir(),
                                    "${slot}_$stamp.jpg"
                                )
                                val options = ImageCapture.OutputFileOptions.Builder(file).build()
                                capture.takePicture(
                                    options,
                                    executor,
                                    object : ImageCapture.OnImageSavedCallback {
                                        override fun onImageSaved(
                                            output: ImageCapture.OutputFileResults
                                        ) {
                                            sessionFiles = sessionFiles + file
                                        }

                                        override fun onError(exception: ImageCaptureException) {
                                            file.delete()
                                            error = "Capture failed: ${exception.message}"
                                        }
                                    }
                                )
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Filled.PhotoCamera,
                            contentDescription = "Capture",
                            tint = Color.Black,
                            modifier = Modifier.size(32.dp)
                        )
                    }
                }
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Camera permission required",
                    color = Color.White,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    text = "Allow camera access to take field photos.",
                    color = Color(0xFFAAAAAA),
                    fontSize = 13.sp
                )
                Spacer(Modifier.height(16.dp))
                Box(
                    modifier = Modifier
                        .background(Color.White, CircleShape)
                        .clickable { permissionLauncher.launch(Manifest.permission.CAMERA) }
                        .padding(horizontal = 24.dp, vertical = 10.dp)
                ) {
                    Text(
                        text = "Grant permission",
                        color = Color.Black,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }

        val currentError = error
        if (currentError != null) {
            Snackbar(
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 140.dp),
                action = {
                    Box(
                        modifier = Modifier.clickable { error = null }.padding(4.dp)
                    ) {
                        Text("OK", color = Color.White)
                    }
                }
            ) {
                Text(currentError)
            }
        }
    }
}

@Composable
private fun ThumbnailItem(
    file: File,
    onRemove: () -> Unit
) {
    val bitmap = remember(file) { PhotoUtils.decodeScaled(file, 256)?.asImageBitmap() }
    Box(
        modifier = Modifier
            .size(64.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0xFF333333))
    ) {
        val thumb = bitmap
        if (thumb != null) {
            Image(
                bitmap = thumb,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
        }
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .size(20.dp)
                .background(Color(0xCC111111), CircleShape)
                .clickable(onClick = onRemove)
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
