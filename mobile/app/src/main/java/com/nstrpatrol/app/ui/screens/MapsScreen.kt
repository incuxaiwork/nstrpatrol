package com.nstrpatrol.app.ui.screens

import android.content.Context
import android.graphics.Color as AndroidColor
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.zIndex
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddLocation
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CompassCalibration
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.FullscreenExit
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nstrpatrol.app.data.PatrolTimer
import com.nstrpatrol.app.data.db.PatrolPointEntity
import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.data.map.ForestBeatModel
import com.nstrpatrol.app.data.map.ForestGisRepository
import com.nstrpatrol.app.data.map.GisLayerState
import com.nstrpatrol.app.data.map.MbtilesServer
import com.nstrpatrol.app.data.map.SightingPointModel
import com.nstrpatrol.app.time.GpsTelemetryManager
import com.nstrpatrol.app.time.MovementMode
import com.nstrpatrol.app.ui.components.ActivePatrolOverlay
import com.nstrpatrol.app.ui.components.NstrScaffold
import com.nstrpatrol.app.ui.navigation.BottomTab
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.LightForest
import com.nstrpatrol.app.ui.theme.MapCanvas
import com.nstrpatrol.app.ui.theme.MapGridLine
import com.nstrpatrol.app.ui.theme.OutlineCard
import com.nstrpatrol.app.ui.theme.Surface
import com.nstrpatrol.app.ui.theme.TextPrimary
import com.nstrpatrol.app.ui.theme.TextSecondary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.RasterLayer
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.android.style.sources.RasterSource
import org.maplibre.android.style.sources.TileSet
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapsScreen(
    onTabSelected: (BottomTab) -> Unit,
    patrolTimer: PatrolTimer,
    telemetryManager: GpsTelemetryManager,
    dao: TelemetryDao
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val clipboardManager = LocalClipboardManager.current

    // Initialize GIS repository & local MBTiles tile server
    val gisRepo = remember { ForestGisRepository(context) }
    val mbtilesServer = remember { MbtilesServer(context) }

    // Start the MBTiles tile server (downloads the atlas from the backend if
    // not cached, falling back to bundled assets), then load the GIS layers
    // (beats/compartments) on a background thread.
    LaunchedEffect(Unit) {
        withContext(Dispatchers.IO) {
            mbtilesServer.start()
            gisRepo.loadGisData()
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            mbtilesServer.stop()
        }
    }

    // Map UI state
    var selectedBeat by remember { mutableStateOf<ForestBeatModel?>(null) }
    var selectedIncident by remember { mutableStateOf<SightingPointModel?>(null) }
    var layerState by remember { mutableStateOf(GisLayerState()) }
    var showLayerDialog by remember { mutableStateOf(false) }
    var showLegend by remember { mutableStateOf(true) }
    var isFullScreen by remember { mutableStateOf(false) }
    var currentZoom by remember { mutableFloatStateOf(11.8f) }

    var miniMapRef by remember { mutableStateOf<MapLibreMap?>(null) }
    var fullScreenMapRef by remember { mutableStateOf<MapLibreMap?>(null) }
    var mapInitError by remember { mutableStateOf(false) }

    // Patrol State
    val isRunning by patrolTimer.running.collectAsStateWithLifecycle()
    var tick by remember { mutableStateOf(0L) }
    LaunchedEffect(isRunning) {
        if (isRunning) {
            while (true) {
                tick++
                delay(5000)
            }
        }
    }
    tick

    var patrolPoints by remember { mutableStateOf(emptyList<PatrolPointEntity>()) }
    var totalDistance by remember { mutableStateOf(0.0) }
    var avgSpeed by remember { mutableStateOf(0.0) }
    var moveMinutes by remember { mutableStateOf(0) }

    LaunchedEffect(isRunning, tick) {
        val pid = patrolTimer.patrolId
        if (pid != null && isRunning) {
            patrolPoints = dao.patrolPointsOrdered(pid)
            totalDistance = computeDistance(patrolPoints)
            avgSpeed = if (patrolPoints.size >= 2) {
                val first = patrolPoints.first().timestamp
                val last = patrolPoints.last().timestamp
                val dur = (last - first) / 3_600_000.0
                if (dur > 0) (totalDistance / 1000) / dur else 0.0
            } else 0.0
            moveMinutes = dao.activeMovementSamplesForPatrol(pid) * 5 / 60
        }
    }

    // REACTIVE LAYER VISIBILITY EFFECT (Applies to both Mini Map & Fullscreen Map)
    LaunchedEffect(layerState, miniMapRef, fullScreenMapRef) {
        miniMapRef?.style?.let { style ->
            applyLayerVisibility(style, layerState)
        }
        fullScreenMapRef?.style?.let { style ->
            applyLayerVisibility(style, layerState)
        }
    }

    // REACTIVE PATROL TRACK UPDATE (redraws line + dots whenever points change)
    LaunchedEffect(patrolPoints) {
        val geo = buildPatrolTrackGeoJson(patrolPoints)
        miniMapRef?.style?.getSourceAs<GeoJsonSource>("patrol-track-source")?.setGeoJson(geo)
        fullScreenMapRef?.style?.getSourceAs<GeoJsonSource>("patrol-track-source")?.setGeoJson(geo)
    }

    // Helper Composable to render Map Content (Shared between Normal & Fullscreen Mode)
    @Composable
    fun MapContent(modifier: Modifier = Modifier, isFull: Boolean = false) {
        Box(
            modifier = modifier
                .clip(if (isFull) RoundedCornerShape(0.dp) else RoundedCornerShape(12.dp))
                .border(if (isFull) 0.dp else 1.dp, OutlineCard, if (isFull) RoundedCornerShape(0.dp) else RoundedCornerShape(12.dp))
                .background(MapCanvas)
        ) {
            // MAPLIBRE VIEW COMPOSABLE
            if (!mapInitError) {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { ctx ->
                        try {
                            MapLibre.getInstance(ctx)
                        } catch (e: Exception) {
                            mapInitError = true
                        }

                        val mapView = MapView(ctx)
                        mapView.onCreate(null)
                        mapView.setOnTouchListener { v, event ->
                            when (event.actionMasked) {
                                android.view.MotionEvent.ACTION_DOWN,
                                android.view.MotionEvent.ACTION_POINTER_DOWN,
                                android.view.MotionEvent.ACTION_MOVE -> {
                                    v.parent?.requestDisallowInterceptTouchEvent(true)
                                }
                            }
                            false
                        }
                        mapView.getMapAsync { map ->
                            if (isFull) {
                                fullScreenMapRef = map
                            } else {
                                miniMapRef = map
                            }
                            try {
                                map.uiSettings.apply {
                                    isZoomGesturesEnabled = true
                                    isScrollGesturesEnabled = true
                                    isRotateGesturesEnabled = true
                                    isTiltGesturesEnabled = true
                                    isDoubleTapGesturesEnabled = true
                                    isQuickZoomGesturesEnabled = true
                                }

                                val tileUrl = mbtilesServer.tileUrlFormat
                                val tileSet = TileSet("2.1.0", tileUrl)
                                tileSet.minZoom = 1f
                                tileSet.maxZoom = 14f
                                val rasterSource = RasterSource("mbtiles-raster-source", tileSet, 256)

                                val satelliteTileSet = TileSet(
                                    "2.1.0",
                                    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                )
                                satelliteTileSet.minZoom = 1f
                                satelliteTileSet.maxZoom = 19f
                                val satelliteSource = RasterSource("satellite-raster-source", satelliteTileSet, 256)

                                val styleJson = """
                                    {
                                      "version": 8,
                                      "name": "NSTR Offline Style",
                                      "sources": {},
                                      "layers": [
                                        {
                                          "id": "background",
                                          "type": "background",
                                          "paint": {
                                            "background-color": "#f5eedc"
                                          }
                                        }
                                      ]
                                    }
                                """.trimIndent()

                                map.setStyle(Style.Builder().fromJson(styleJson)) { style ->
                                    style.addSource(rasterSource)
                                    style.addSource(satelliteSource)
                                    if (gisRepo.beatGeoJsonString.isNotEmpty()) {
                                        style.addSource(GeoJsonSource("beats-geojson-source", gisRepo.beatGeoJsonString))
                                    }
                                    if (gisRepo.compartmentGeoJsonString.isNotEmpty()) {
                                        style.addSource(GeoJsonSource("comp-geojson-source", gisRepo.compartmentGeoJsonString))
                                    }
                                    if (gisRepo.incidentGeoJsonString.isNotEmpty()) {
                                        style.addSource(GeoJsonSource("incidents-geojson-source", gisRepo.incidentGeoJsonString))
                                    }

                                    // 1. MBTiles Basemap Layer (offline fallback base)
                                    style.addLayer(RasterLayer("mbtiles-raster-layer", "mbtiles-raster-source"))

                                    // 1b. Satellite Imagery Layer (online, overlays offline base)
                                    style.addLayer(
                                        RasterLayer("satellite-raster-layer", "satellite-raster-source").apply {
                                            setProperties(
                                                PropertyFactory.visibility(if (layerState.showSatellite) Property.VISIBLE else Property.NONE)
                                            )
                                        }
                                    )

                                    // 2. Beats Fill Layer (Light green tint)
                                    if (gisRepo.beatGeoJsonString.isNotEmpty()) {
                                        style.addLayer(
                                            FillLayer("beats-fill-layer", "beats-geojson-source").apply {
                                                setProperties(
                                                    PropertyFactory.fillColor(AndroidColor.parseColor("#1E4620")),
                                                    PropertyFactory.fillOpacity(0.12f),
                                                    PropertyFactory.visibility(if (layerState.showBeats) Property.VISIBLE else Property.NONE)
                                                )
                                            }
                                        )
                                    }

                                    // 3. Compartments Fill Layer (Soft amber tint)
                                    if (gisRepo.compartmentGeoJsonString.isNotEmpty()) {
                                        style.addLayer(
                                            FillLayer("comp-fill-layer", "comp-geojson-source").apply {
                                                setProperties(
                                                    PropertyFactory.fillColor(AndroidColor.parseColor("#E65100")),
                                                    PropertyFactory.fillOpacity(0.04f),
                                                    PropertyFactory.visibility(if (layerState.showCompartments) Property.VISIBLE else Property.NONE)
                                                )
                                            }
                                        )

                                        // 4. Compartments Line Layer (Solid crisp amber line for clear visibility)
                                        style.addLayer(
                                            LineLayer("comp-line-layer", "comp-geojson-source").apply {
                                                setProperties(
                                                    PropertyFactory.lineColor(AndroidColor.parseColor("#E65100")),
                                                    PropertyFactory.lineWidth(1.2f),
                                                    PropertyFactory.lineOpacity(0.75f),
                                                    PropertyFactory.visibility(if (layerState.showCompartments) Property.VISIBLE else Property.NONE)
                                                )
                                            }
                                        )
                                    }

                                    // 5. Beats Line Layer (Bold dark green boundary)
                                    if (gisRepo.beatGeoJsonString.isNotEmpty()) {
                                        style.addLayer(
                                            LineLayer("beats-line-layer", "beats-geojson-source").apply {
                                                setProperties(
                                                    PropertyFactory.lineColor(AndroidColor.parseColor("#1E4620")),
                                                    PropertyFactory.lineWidth(2.8f),
                                                    PropertyFactory.visibility(if (layerState.showBeats) Property.VISIBLE else Property.NONE)
                                                )
                                            }
                                        )

                                        // 6. Beat Name Label Layer
                                        style.addLayer(
                                            SymbolLayer("beats-label-layer", "beats-geojson-source").apply {
                                                minZoom = 9.0f
                                                setProperties(
                                                    PropertyFactory.textField("{Beat}"),
                                                    PropertyFactory.textSize(12f),
                                                    PropertyFactory.textColor(AndroidColor.parseColor("#1E4620")),
                                                    PropertyFactory.textHaloColor(AndroidColor.parseColor("#FFFFFF")),
                                                    PropertyFactory.textHaloWidth(2.0f),
                                                    PropertyFactory.visibility(if (layerState.showBeats) Property.VISIBLE else Property.NONE)
                                                )
                                            }
                                        )
                                    }

                                    // 7. Sighting & Incident Red Circle Points Layer
                                    if (gisRepo.incidentGeoJsonString.isNotEmpty()) {
                                        style.addLayer(
                                            CircleLayer("incidents-circle-layer", "incidents-geojson-source").apply {
                                                setProperties(
                                                    PropertyFactory.circleColor(AndroidColor.parseColor("#D32F2F")),
                                                    PropertyFactory.circleRadius(7f),
                                                    PropertyFactory.circleStrokeColor(AndroidColor.parseColor("#FFFFFF")),
                                                    PropertyFactory.circleStrokeWidth(2f),
                                                    PropertyFactory.visibility(if (layerState.showIncidents) Property.VISIBLE else Property.NONE)
                                                )
                                            }
                                        )

                                        // 8. Incident Label Layer
                                        style.addLayer(
                                            SymbolLayer("incidents-label-layer", "incidents-geojson-source").apply {
                                                minZoom = 10.0f
                                                setProperties(
                                                    PropertyFactory.textField("{icon} {title}"),
                                                    PropertyFactory.textSize(11f),
                                                    PropertyFactory.textColor(AndroidColor.parseColor("#B71C1C")),
                                                    PropertyFactory.textHaloColor(AndroidColor.parseColor("#FFFFFF")),
                                                    PropertyFactory.textHaloWidth(1.8f),
                                                    PropertyFactory.visibility(if (layerState.showIncidents) Property.VISIBLE else Property.NONE)
                                                )
                                            }
                                        )
                                    }

                                    // 9. Live Patrol Track (path line + point dots) from local points
                                    style.addSource(GeoJsonSource("patrol-track-source", EMPTY_FEATURE_COLLECTION))
                                    style.addLayer(
                                        LineLayer("patrol-track-line-layer", "patrol-track-source").apply {
                                            setProperties(
                                                PropertyFactory.lineColor(AndroidColor.parseColor("#FFEB3B")),
                                                PropertyFactory.lineWidth(4f),
                                                PropertyFactory.lineOpacity(0.95f),
                                                PropertyFactory.visibility(if (layerState.showTrack) Property.VISIBLE else Property.NONE)
                                            )
                                        }
                                    )
                                    style.addLayer(
                                        CircleLayer("patrol-track-point-layer", "patrol-track-source").apply {
                                            setProperties(
                                                PropertyFactory.circleColor(AndroidColor.parseColor("#FFEB3B")),
                                                PropertyFactory.circleRadius(4.5f),
                                                PropertyFactory.circleStrokeColor(AndroidColor.parseColor("#333333")),
                                                PropertyFactory.circleStrokeWidth(1.5f),
                                                PropertyFactory.visibility(if (layerState.showTrack) Property.VISIBLE else Property.NONE)
                                            )
                                        }
                                    )

                                    map.cameraPosition = CameraPosition.Builder()
                                        .target(LatLng(15.92, 79.15))
                                        .zoom(11.8)
                                        .build()

                                    // Tap listener for map features (Beats & Incident Markers)
                                    map.addOnMapClickListener { latLng ->
                                        val pointF = map.projection.toScreenLocation(latLng)
                                        // 1. Check Incident tap first
                                        val incidentFeatures = map.queryRenderedFeatures(pointF, "incidents-circle-layer")
                                        if (incidentFeatures.isNotEmpty()) {
                                            val incId = incidentFeatures[0].getStringProperty("id") ?: ""
                                            val matchedIncident = gisRepo.findIncidentById(incId)
                                            if (matchedIncident != null) {
                                                selectedIncident = matchedIncident
                                                return@addOnMapClickListener true
                                            }
                                        }

                                        // 2. Check Beat tap
                                        val features = map.queryRenderedFeatures(pointF, "beats-fill-layer")
                                        if (features.isNotEmpty()) {
                                            val feat = features[0]
                                            val beatName = feat.getStringProperty("Beat") ?: ""
                                            val matchedBeat = gisRepo.findBeatByName(beatName)
                                            if (matchedBeat != null) {
                                                selectedBeat = matchedBeat
                                            }
                                        }
                                        true
                                    }
                                }
                            } catch (e: Exception) {
                                mapInitError = true
                            }
                        }
                        mapView
                    },
                    update = { view -> }
                )

                // Manage MapView Lifecycle
                DisposableEffect(lifecycleOwner) {
                    val observer = LifecycleEventObserver { _, _ -> }
                    lifecycleOwner.lifecycle.addObserver(observer)
                    onDispose {
                        lifecycleOwner.lifecycle.removeObserver(observer)
                    }
                }
            } else {
                // Fallback Grid Canvas if MapLibre GL is initializing
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
            }

            // FLOATING MAP CONTROLS (Right Side)
            val currentMap = if (isFull) fullScreenMapRef else miniMapRef

            Column(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(12.dp)
                    .zIndex(10f),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Fullscreen Toggle
                FloatingControlButton(
                    icon = if (isFull) Icons.Filled.FullscreenExit else Icons.Filled.Fullscreen,
                    contentDescription = if (isFull) "Exit Fullscreen" else "Full Screen",
                    onClick = { isFullScreen = !isFullScreen }
                )

                // Zoom In (+)
                FloatingControlButton(
                    icon = Icons.Filled.Add,
                    contentDescription = "Zoom In",
                    onClick = {
                        currentMap?.let { m ->
                            m.animateCamera(CameraUpdateFactory.zoomIn())
                            currentZoom = (m.cameraPosition.zoom + 1).toFloat()
                        }
                    }
                )

                // Zoom Out (-)
                FloatingControlButton(
                    icon = Icons.Filled.Remove,
                    contentDescription = "Zoom Out",
                    onClick = {
                        currentMap?.let { m ->
                            m.animateCamera(CameraUpdateFactory.zoomOut())
                            currentZoom = (m.cameraPosition.zoom - 1).toFloat()
                        }
                    }
                )

                // Compass Reset Bearing (Resets map rotation & tilt to North)
                FloatingControlButton(
                    icon = Icons.Filled.CompassCalibration,
                    contentDescription = "Reset Bearing",
                    onClick = {
                        currentMap?.let { m ->
                            val currentTarget = m.cameraPosition.target
                            try {
                                m.animateCamera(
                                    CameraUpdateFactory.newCameraPosition(
                                        CameraPosition.Builder()
                                            .target(currentTarget)
                                            .zoom(m.cameraPosition.zoom)
                                            .bearing(0.0)
                                            .tilt(0.0)
                                            .build()
                                    ),
                                    800
                                )
                            } catch (e: Exception) {
                                m.cameraPosition = CameraPosition.Builder()
                                    .target(currentTarget)
                                    .zoom(m.cameraPosition.zoom)
                                    .bearing(0.0)
                                    .tilt(0.0)
                                    .build()
                            }
                            Toast.makeText(context, "Compass reset to North", Toast.LENGTH_SHORT).show()
                        }
                    }
                )

                // Recenter My Location / Markapur Division
                FloatingControlButton(
                    icon = Icons.Filled.MyLocation,
                    contentDescription = "Recenter Location",
                    onClick = {
                        currentMap?.let { m ->
                            val targetPos = if (patrolPoints.isNotEmpty()) {
                                val lastPt = patrolPoints.last()
                                LatLng(lastPt.latitude, lastPt.longitude)
                            } else {
                                LatLng(15.92, 79.15)
                            }
                            try {
                                m.animateCamera(CameraUpdateFactory.newLatLngZoom(targetPos, 12.8), 1000)
                            } catch (e: Exception) {
                                m.cameraPosition = CameraPosition.Builder()
                                    .target(targetPos)
                                    .zoom(12.8)
                                    .build()
                            }
                            Toast.makeText(context, "Recentered map view", Toast.LENGTH_SHORT).show()
                        }
                    }
                )
            }

            // COMPACT MAP LEGEND (Bottom-Left)
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(12.dp)
            ) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(Surface.copy(alpha = 0.92f))
                        .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
                        .clickable { showLegend = !showLegend }
                        .padding(horizontal = 10.dp, vertical = 6.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Info, contentDescription = null, tint = ForestGreen, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Legend", fontWeight = FontWeight.Bold, fontSize = 11.sp, color = TextPrimary)
                    }
                }

                AnimatedVisibility(visible = showLegend) {
                    Card(
                        modifier = Modifier
                            .padding(top = 4.dp)
                            .width(205.dp),
                        shape = RoundedCornerShape(8.dp),
                        colors = CardDefaults.cardColors(containerColor = Surface.copy(alpha = 0.95f)),
                        border = androidx.compose.foundation.BorderStroke(1.dp, OutlineCard)
                    ) {
                        Column(modifier = Modifier.padding(8.dp)) {
                            LegendItem(color = ForestGreen, isDashed = false, label = "Forest Beat Boundary")
                            Spacer(Modifier.height(4.dp))
                            LegendItem(color = Color(0xFFE65100), isDashed = false, label = "Compartment Boundary")
                            Spacer(Modifier.height(4.dp))
                            LegendItem(color = Color(0xFFD32F2F), isDashed = false, isPoint = true, label = "Sightings & Incidents (12)")
                            Spacer(Modifier.height(4.dp))
                            LegendItem(color = Color(0xFFFFEB3B), isDashed = false, isPoint = true, label = "My Patrol Track")
                            Spacer(Modifier.height(4.dp))
                            LegendItem(color = Color(0xFFC3B091), isDashed = false, isRaster = true, label = "MBTiles Offline Basemap")
                        }
                    }
                }
            }
        }
    }

    // NORMAL VIEW MODE (Inside NstrScaffold)
    NstrScaffold(
        title = "Forest Patrol Map",
        subtitle = if (isRunning) "Patrol in progress • Markapur Division" else "Markapur Division • 44 Beats • 12 Sightings Logged",
        activeTab = BottomTab.Maps,
        onTabSelected = onTabSelected
    ) {
        Spacer(Modifier.height(12.dp))

        // Top Control Bar (Search & Layer Toggle & Status Indicator)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Offline Status Chip
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color(0xFFE8F5E9))
                    .border(1.dp, Color(0xFF2E7D32), RoundedCornerShape(16.dp))
                    .padding(horizontal = 10.dp, vertical = 5.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .background(Color(0xFF2E7D32), CircleShape)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = "Offline Map (MBTiles)",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF2E7D32)
                    )
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                // Fullscreen Button
                Button(
                    onClick = { isFullScreen = true },
                    colors = ButtonDefaults.buttonColors(containerColor = LightForest),
                    shape = RoundedCornerShape(20.dp),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                ) {
                    Icon(Icons.Filled.Fullscreen, contentDescription = "Full Screen", tint = ForestGreen, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("FULL SCREEN", color = ForestGreen, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }

                IconButton(
                    onClick = { showLayerDialog = true },
                    modifier = Modifier
                        .size(36.dp)
                        .background(Surface, CircleShape)
                        .border(1.dp, OutlineCard, CircleShape)
                ) {
                    Icon(Icons.Filled.Layers, contentDescription = "Layers", tint = ForestGreen, modifier = Modifier.size(20.dp))
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        // Normal Map View Container
        MapContent(
            modifier = Modifier
                .fillMaxWidth()
                .height(420.dp),
            isFull = false
        )

        // Active Patrol Overlay
        if (isRunning) {
            Spacer(Modifier.height(12.dp))
            ActivePatrolOverlay(
                distanceMeters = totalDistance,
                avgSpeedKmh = avgSpeed,
                moveMinutes = moveMinutes,
                durationFormatted = patrolTimer.elapsedFormatted(),
                currentMode = MovementMode.UNKNOWN
            )
        }

    }

    // FULL SCREEN MAP MODE DIALOG
    if (isFullScreen) {
        Dialog(
            onDismissRequest = { isFullScreen = false },
            properties = DialogProperties(usePlatformDefaultWidth = false)
        ) {
            Box(modifier = Modifier.fillMaxSize().background(MapCanvas)) {
                MapContent(modifier = Modifier.fillMaxSize(), isFull = true)

                // Top Bar for Full Screen
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                        .align(Alignment.TopStart),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(Surface.copy(alpha = 0.95f))
                            .border(1.dp, OutlineCard, RoundedCornerShape(20.dp))
                            .padding(horizontal = 14.dp, vertical = 8.dp)
                    ) {
                        Text("Forest Patrol Map • Fullscreen", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = ForestGreen)
                    }

                    IconButton(
                        onClick = { isFullScreen = false },
                        modifier = Modifier
                            .size(40.dp)
                            .background(Surface.copy(alpha = 0.95f), CircleShape)
                            .border(1.dp, OutlineCard, CircleShape)
                    ) {
                        Icon(Icons.Filled.FullscreenExit, contentDescription = "Exit Fullscreen", tint = ForestGreen)
                    }
                }
            }
        }
    }

    // SIGHTING & INCIDENT DETAILS BOTTOM SHEET
    if (selectedIncident != null) {
        val inc = selectedIncident!!
        ModalBottomSheet(
            onDismissRequest = { selectedIncident = null },
            sheetState = rememberModalBottomSheetState(),
            containerColor = Surface
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(inc.icon, fontSize = 28.sp)
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "INCIDENT / SIGHTING RECORD",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextSecondary
                            )
                            Text(
                                text = inc.title,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = TextPrimary
                            )
                        }
                    }
                    IconButton(onClick = { selectedIncident = null }) {
                        Icon(Icons.Filled.Close, contentDescription = "Close", tint = TextSecondary)
                    }
                }

                Spacer(Modifier.height(14.dp))

                DetailItemRow("Record ID", inc.id)
                DetailItemRow("Category", inc.category)
                DetailItemRow("Severity Level", inc.severity)
                DetailItemRow("Forest Beat", inc.beatName)
                DetailItemRow("Logged Time", inc.time)
                DetailItemRow("GPS Location", "${"%.5f".format(inc.lat)}° N, ${"%.5f".format(inc.lon)}° E")

                Spacer(Modifier.height(10.dp))

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    colors = CardDefaults.cardColors(containerColor = LightForest)
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text("Field Remarks / Observations", fontWeight = FontWeight.Bold, fontSize = 11.sp, color = ForestGreen)
                        Spacer(Modifier.height(4.dp))
                        Text(inc.details, fontSize = 13.sp, color = TextPrimary)
                    }
                }

                Spacer(Modifier.height(18.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedButton(
                        onClick = {
                            val locText = "${inc.lat}, ${inc.lon}"
                            clipboardManager.setText(AnnotatedString(locText))
                            Toast.makeText(context, "Coordinates copied: $locText", Toast.LENGTH_SHORT).show()
                        },
                        modifier = Modifier
                            .weight(1f)
                            .height(46.dp),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Icon(Icons.Filled.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("COPY COORDS", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }

                    Button(
                        onClick = { selectedIncident = null },
                        modifier = Modifier
                            .weight(1f)
                            .height(46.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("CLOSE", fontWeight = FontWeight.Bold, color = Color.White)
                    }
                }
                Spacer(Modifier.height(12.dp))
            }
        }
    }

    // BEAT DETAILS BOTTOM SHEET
    if (selectedBeat != null) {
        val b = selectedBeat!!
        ModalBottomSheet(
            onDismissRequest = { selectedBeat = null },
            sheetState = rememberModalBottomSheetState(),
            containerColor = Surface
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "BEAT DETAILS",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextSecondary
                        )
                        Text(
                            text = b.name,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = ForestGreen
                        )
                    }
                    IconButton(onClick = { selectedBeat = null }) {
                        Icon(Icons.Filled.Close, contentDescription = "Close", tint = TextSecondary)
                    }
                }

                Spacer(Modifier.height(14.dp))

                DetailItemRow("Beat Name", b.name)
                DetailItemRow("Beat Identifier (ID)", b.id)
                DetailItemRow("Range", b.range)
                DetailItemRow("Division", b.division)
                DetailItemRow("Section", b.section)
                DetailItemRow("Circle", b.circle)
                DetailItemRow("District", b.district)
                DetailItemRow("Area (ha)", b.areaHa)
                DetailItemRow("Patrol Status", "Active Forest Beat")

                Spacer(Modifier.height(20.dp))

                Button(
                    onClick = { selectedBeat = null },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("CLOSE DETAILS", fontWeight = FontWeight.Bold, color = Color.White)
                }
                Spacer(Modifier.height(12.dp))
            }
        }
    }

    // LAYER CONTROL DIALOG / BOTTOM SHEET
    if (showLayerDialog) {
        ModalBottomSheet(
            onDismissRequest = { showLayerDialog = false },
            sheetState = rememberModalBottomSheetState(),
            containerColor = Surface
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 16.dp)
            ) {
                Text(
                    text = "Map Layers",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
                Spacer(Modifier.height(14.dp))

                LayerToggleRow(
                    title = "MBTiles Offline Basemap",
                    subtitle = "Raster tile atlas (NSTR.mbtiles)",
                    checked = layerState.showMBTiles,
                    onChecked = { checked ->
                        val newState = layerState.copy(showMBTiles = checked)
                        layerState = newState
                        miniMapRef?.style?.let { applyLayerVisibility(it, newState) }
                        fullScreenMapRef?.style?.let { applyLayerVisibility(it, newState) }
                    }
                )
                Spacer(Modifier.height(8.dp))
                LayerToggleRow(
                    title = "Forest Beat Boundaries",
                    subtitle = "44 Markapur Division beats",
                    checked = layerState.showBeats,
                    onChecked = { checked ->
                        val newState = layerState.copy(showBeats = checked)
                        layerState = newState
                        miniMapRef?.style?.let { applyLayerVisibility(it, newState) }
                        fullScreenMapRef?.style?.let { applyLayerVisibility(it, newState) }
                    }
                )
                Spacer(Modifier.height(8.dp))
                LayerToggleRow(
                    title = "Forest Compartments",
                    subtitle = "448 compartment polygons (Solid Amber)",
                    checked = layerState.showCompartments,
                    onChecked = { checked ->
                        val newState = layerState.copy(showCompartments = checked)
                        layerState = newState
                        miniMapRef?.style?.let { applyLayerVisibility(it, newState) }
                        fullScreenMapRef?.style?.let { applyLayerVisibility(it, newState) }
                    }
                )
                Spacer(Modifier.height(8.dp))
                LayerToggleRow(
                    title = "Sighting & Incident Points",
                    subtitle = "12 active wildlife & hazard markers",
                    checked = layerState.showIncidents,
                    onChecked = { checked ->
                        val newState = layerState.copy(showIncidents = checked)
                        layerState = newState
                        miniMapRef?.style?.let { applyLayerVisibility(it, newState) }
                        fullScreenMapRef?.style?.let { applyLayerVisibility(it, newState) }
                    }
                )
                Spacer(Modifier.height(8.dp))
                LayerToggleRow(
                    title = "Satellite Imagery",
                    subtitle = "Online Esri World Imagery (offline MBTiles fallback)",
                    checked = layerState.showSatellite,
                    onChecked = { checked ->
                        val newState = layerState.copy(showSatellite = checked)
                        layerState = newState
                        miniMapRef?.style?.let { applyLayerVisibility(it, newState) }
                        fullScreenMapRef?.style?.let { applyLayerVisibility(it, newState) }
                    }
                )
                Spacer(Modifier.height(8.dp))
                LayerToggleRow(
                    title = "My Patrol Track",
                    subtitle = "Live path & points recorded this patrol",
                    checked = layerState.showTrack,
                    onChecked = { checked ->
                        val newState = layerState.copy(showTrack = checked)
                        layerState = newState
                        miniMapRef?.style?.let { applyLayerVisibility(it, newState) }
                        fullScreenMapRef?.style?.let { applyLayerVisibility(it, newState) }
                    }
                )

                Spacer(Modifier.height(20.dp))

                Button(
                    onClick = { showLayerDialog = false },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("APPLY LAYERS", fontWeight = FontWeight.Bold, color = Color.White)
                }
                Spacer(Modifier.height(12.dp))
            }
        }
    }
}

@Composable
private fun FloatingControlButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .size(38.dp)
            .clip(CircleShape)
            .background(Surface.copy(alpha = 0.95f))
            .border(1.dp, OutlineCard, CircleShape)
            .clickable { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, contentDescription = contentDescription, tint = ForestGreen, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun LegendItem(
    color: Color,
    isDashed: Boolean = false,
    isPoint: Boolean = false,
    isRaster: Boolean = false,
    label: String
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (isPoint) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(color, CircleShape)
            )
        } else if (isRaster) {
            Box(
                modifier = Modifier
                    .size(12.dp)
                    .background(color, RoundedCornerShape(2.dp))
            )
        } else {
            Box(
                modifier = Modifier
                    .width(16.dp)
                    .height(3.dp)
                    .background(color)
            )
        }
        Spacer(Modifier.width(8.dp))
        Text(label, fontSize = 10.sp, color = TextPrimary)
    }
}

@Composable
private fun DetailItemRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, fontSize = 13.sp, color = TextSecondary)
        Text(value, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
    }
}

@Composable
private fun LayerToggleRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onChecked: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
            .background(Surface)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = TextPrimary)
            Text(subtitle, fontSize = 11.sp, color = TextSecondary)
        }
        Switch(
            checked = checked,
            onCheckedChange = onChecked,
            colors = SwitchDefaults.colors(
                checkedTrackColor = ForestGreen,
                checkedThumbColor = Color.White
            )
        )
    }
}

private const val EMPTY_FEATURE_COLLECTION = "{\"type\":\"FeatureCollection\",\"features\":[]}"

private fun applyLayerVisibility(style: Style?, state: GisLayerState) {
    if (style == null) return
    val mbtilesVis = if (state.showMBTiles) Property.VISIBLE else Property.NONE
    val beatsVis = if (state.showBeats) Property.VISIBLE else Property.NONE
    val compVis = if (state.showCompartments) Property.VISIBLE else Property.NONE
    val incidentsVis = if (state.showIncidents) Property.VISIBLE else Property.NONE
    val satelliteVis = if (state.showSatellite) Property.VISIBLE else Property.NONE
    val trackVis = if (state.showTrack) Property.VISIBLE else Property.NONE

    style.getLayer("mbtiles-raster-layer")?.setProperties(PropertyFactory.visibility(mbtilesVis))
    style.getLayer("satellite-raster-layer")?.setProperties(PropertyFactory.visibility(satelliteVis))
    style.getLayer("beats-fill-layer")?.setProperties(PropertyFactory.visibility(beatsVis))
    style.getLayer("beats-line-layer")?.setProperties(PropertyFactory.visibility(beatsVis))
    style.getLayer("beats-label-layer")?.setProperties(PropertyFactory.visibility(beatsVis))
    style.getLayer("comp-fill-layer")?.setProperties(PropertyFactory.visibility(compVis))
    style.getLayer("comp-line-layer")?.setProperties(PropertyFactory.visibility(compVis))
    style.getLayer("incidents-circle-layer")?.setProperties(PropertyFactory.visibility(incidentsVis))
    style.getLayer("incidents-label-layer")?.setProperties(PropertyFactory.visibility(incidentsVis))
    style.getLayer("patrol-track-line-layer")?.setProperties(PropertyFactory.visibility(trackVis))
    style.getLayer("patrol-track-point-layer")?.setProperties(PropertyFactory.visibility(trackVis))
}

private fun buildPatrolTrackGeoJson(points: List<PatrolPointEntity>): String {
    val lineFeature = if (points.size >= 2) {
        val coords = points.joinToString(",") { "[${it.longitude},${it.latitude}]" }
        "\"type\":\"Feature\",\"geometry\":{\"type\":\"LineString\",\"coordinates\":[$coords]},\"properties\":{}"
    } else ""
    val pointFeatures = points.joinToString(",") { p ->
        "\"type\":\"Feature\",\"geometry\":{\"type\":\"Point\",\"coordinates\":[${p.longitude},${p.latitude}]},\"properties\":{}"
    }
    val features = listOf(lineFeature, pointFeatures).filter { it.isNotEmpty() }.joinToString(",")
    return "{\"type\":\"FeatureCollection\",\"features\":[$features]}"
}

private fun computeDistance(points: List<PatrolPointEntity>): Double {
    if (points.size < 2) return 0.0
    var total = 0.0
    for (i in 1 until points.size) {
        val p1 = points[i - 1]
        val p2 = points[i]
        val dLat = Math.toRadians(p2.latitude - p1.latitude)
        val dLon = Math.toRadians(p2.longitude - p1.longitude)
        val a = sin(dLat / 2).let { it * it } +
            cos(Math.toRadians(p1.latitude)) *
            cos(Math.toRadians(p2.latitude)) *
            sin(dLon / 2).let { it * it }
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        total += 6_371_000.0 * c
    }
    return total
}
