package com.nstrpatrol.app.ui.screens

import android.content.Context
import android.graphics.Color as AndroidColor
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nstrpatrol.app.data.PatrolTimer
import com.nstrpatrol.app.data.db.PatrolPointEntity
import com.nstrpatrol.app.data.db.TelemetryDao
import com.nstrpatrol.app.data.map.ForestBeatModel
import com.nstrpatrol.app.data.map.ForestCompartmentModel
import com.nstrpatrol.app.data.map.ForestGridEngine
import com.nstrpatrol.app.data.map.GridCellInfo
import androidx.compose.material.icons.filled.GridOn
import androidx.compose.material.icons.filled.GridView
import com.nstrpatrol.app.data.map.ForestGisRepository
import com.nstrpatrol.app.data.map.GisLayerState
import com.nstrpatrol.app.data.map.MbtilesServer
import com.nstrpatrol.app.time.GpsTelemetryManager
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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.firstOrNull
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
    movement: kotlinx.coroutines.flow.StateFlow<com.nstrpatrol.app.time.MovementInfo>,
    dao: TelemetryDao
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

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
    var selectedCompartment by remember { mutableStateOf<ForestCompartmentModel?>(null) }
    var selectedGridCell by remember { mutableStateOf<GridCellInfo?>(null) }
    var layerState by remember { mutableStateOf(GisLayerState()) }
    var showLayerDialog by remember { mutableStateOf(false) }
    var showLegend by remember { mutableStateOf(true) }
    var currentZoom by remember { mutableFloatStateOf(11.8f) }

    var miniMapRef by remember { mutableStateOf<MapLibreMap?>(null) }
    var mapInitError by remember { mutableStateOf(false) }

    // When true the camera auto-follows the live patrol track; a user drag/zoom
    // gesture switches it off so they can inspect the map freely.
    var followPatrol by remember { mutableStateOf(true) }

    // Patrol State
    val isRunning by patrolTimer.running.collectAsStateWithLifecycle()
    val movementInfo by movement.collectAsStateWithLifecycle()
    val liveTelemetry by telemetryManager.telemetry.collectAsStateWithLifecycle()

    var tick by remember { mutableStateOf(0L) }
    LaunchedEffect(isRunning) {
        if (isRunning) {
            while (true) {
                // 2 s cadence: distance/move-min stay fresh enough for a live
                // feel; instantaneous SPEED below updates even faster because
                // it derives straight from the telemetry StateFlow.
                tick++
                delay(2000)
            }
        }
    }
    tick

    var patrolPoints by remember { mutableStateOf(emptyList<PatrolPointEntity>()) }
    var totalDistance by remember { mutableStateOf(0.0) }
    var moveMinutes by remember { mutableStateOf(0) }

    // Live speed: prefer the GNSS receiver's own doppler speed (updates with
    // every fix, ~1 s while tracking); fall back to the pace between the last
    // two recorded points. Values under 1 km/h are GPS jitter — show 0.
    val currentSpeedKmh: Double = run {
        val gps = liveTelemetry.speedMps
        val fromGps = if (gps != null && gps >= 0.28f) (gps * 3.6).coerceAtMost(160.0) else null
        val derived = if (patrolPoints.size >= 2) {
            val a = patrolPoints[patrolPoints.size - 2]
            val b = patrolPoints.last()
            val dt = (b.timestamp - a.timestamp) / 1000.0
            if (dt > 0.5) computeDistance(listOf(a, b)) / dt * 3.6 else 0.0
        } else 0.0
        fromGps ?: derived.coerceIn(0.0, 160.0)
    }

    LaunchedEffect(isRunning, tick) {
        // While a patrol is live, load its points; otherwise (e.g. the app was
        // restarted mid-patrol, so the in-memory timer is lost, or the last
        // patrol has ended) fall back to the most recent local session so the
        // travelled path is still visible on the map.
        val pid = if (isRunning) {
            patrolTimer.patrolId
        } else {
            dao.allPatrolSessions().firstOrNull()?.firstOrNull()?.patrolId
        }
        if (pid != null) {
            patrolPoints = dao.patrolPointsOrdered(pid)
            totalDistance = computeDistance(patrolPoints)
            if (isRunning) {
                moveMinutes = dao.activeMovementSamplesForPatrol(pid) * 5 / 60
            }
        }
    }

    // REACTIVE LAYER VISIBILITY EFFECT
    LaunchedEffect(layerState, miniMapRef) {
        miniMapRef?.style?.let { style ->
            applyLayerVisibility(style, layerState)
        }
    }

    // Fill beat & compartment sources once GIS data is loaded.
    LaunchedEffect(gisRepo.isDataLoaded, miniMapRef) {
        if (!gisRepo.isDataLoaded) return@LaunchedEffect
        val beatGeo = gisRepo.beatGeoJsonString
        val compGeo = gisRepo.compartmentGeoJsonString
        miniMapRef?.style?.let { style ->
            if (beatGeo.isNotEmpty()) {
                (style.getSource("beats-geojson-source") as? GeoJsonSource)?.setGeoJson(beatGeo)
            }
            if (compGeo.isNotEmpty()) {
                (style.getSource("comp-geojson-source") as? GeoJsonSource)?.setGeoJson(compGeo)
            }
            applyLayerVisibility(style, layerState)
        }
    }

    // REACTIVE DYNAMIC GRID GENERATOR & PATROL INTERSECTION
    LaunchedEffect(layerState.showGrid, layerState.gridSizeKm2, patrolPoints, gisRepo.isDataLoaded, miniMapRef) {
        miniMapRef?.style?.let { style ->
            if (layerState.showGrid) {
                val beatGeo = gisRepo.beatGeoJsonString
                withContext(Dispatchers.Default) {
                    val allGridsGeo = ForestGridEngine.generateAllGridsGeoJson(layerState.gridSizeKm2, beatGeo)
                    val patrolledGridsGeo = ForestGridEngine.generatePatrolledGridsGeoJson(layerState.gridSizeKm2, patrolPoints, beatGeo)
                    withContext(Dispatchers.Main) {
                        (style.getSource("grid-all-source") as? GeoJsonSource)?.setGeoJson(allGridsGeo)
                        (style.getSource("grid-patrolled-source") as? GeoJsonSource)?.setGeoJson(patrolledGridsGeo)
                    }
                }
            }
            applyLayerVisibility(style, layerState)
        }
    }

    // REACTIVE PATROL TRACK UPDATE (redraws line + dots whenever points change)
    LaunchedEffect(patrolPoints) {
        val geo = buildPatrolTrackGeoJson(patrolPoints)
        miniMapRef?.style?.getSourceAs<GeoJsonSource>("patrol-track-source")?.setGeoJson(geo)

        if (patrolPoints.isNotEmpty()) {
            val last = patrolPoints.last()
            val currentGeo = buildCurrentPositionGeoJson(last)
            miniMapRef?.style?.getSourceAs<GeoJsonSource>("patrol-current-source")?.setGeoJson(currentGeo)

            // Camera auto-follow: keep the ranger centred on their live position
            // while the patrol is running (released on manual pan/zoom). Zooms
            // into the travelled area like Google Maps navigation instead of
            // leaving the whole region on screen.
            if (followPatrol && isRunning) {
                val followZoom = 16.0
                try {
                    miniMapRef?.animateCamera(
                        CameraUpdateFactory.newLatLngZoom(LatLng(last.latitude, last.longitude), followZoom),
                        900
                    )
                } catch (e: Exception) {
                    miniMapRef?.cameraPosition = CameraPosition.Builder()
                        .target(LatLng(last.latitude, last.longitude))
                        .zoom(followZoom)
                        .build()
                }
            }
        }
    }

    // Helper Composable to render the map
    @Composable
    fun MapContent(modifier: Modifier = Modifier) {
        Box(
            modifier = modifier
                .background(MapCanvas)
        ) {
            // MAPLIBRE VIEW COMPOSABLE
            if (!mapInitError) {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { ctx ->
                        try {
                            MapLibre.getInstance(ctx)
                            MapLibre.setConnected(true)
                        } catch (e: Exception) {
                            mapInitError = true
                        }

                        val mapView = MapView(ctx)
                        mapView.onCreate(null)
                        mapView.onStart()
                        mapView.onResume()
                        var lastTouchY1 = 0f
                        var lastTouchY2 = 0f
                        var isTwoFingerDrag = false

                        mapView.setOnTouchListener { v, event ->
                            when (event.actionMasked) {
                                android.view.MotionEvent.ACTION_DOWN,
                                android.view.MotionEvent.ACTION_POINTER_DOWN,
                                android.view.MotionEvent.ACTION_MOVE -> {
                                    v.parent?.requestDisallowInterceptTouchEvent(true)
                                }
                            }

                            val map = miniMapRef
                            if (map != null && event.pointerCount >= 2) {
                                when (event.actionMasked) {
                                    android.view.MotionEvent.ACTION_POINTER_DOWN -> {
                                        if (event.pointerCount >= 2) {
                                            lastTouchY1 = event.getY(0)
                                            lastTouchY2 = event.getY(1)
                                            isTwoFingerDrag = true
                                        }
                                    }
                                    android.view.MotionEvent.ACTION_MOVE -> {
                                        if (isTwoFingerDrag && event.pointerCount >= 2) {
                                            val currentY1 = event.getY(0)
                                            val currentY2 = event.getY(1)
                                            val dy1 = currentY1 - lastTouchY1
                                            val dy2 = currentY2 - lastTouchY2

                                            // Both fingers moving vertically in same direction -> Tilt gesture
                                            if ((dy1 < -3f && dy2 < -3f) || (dy1 > 3f && dy2 > 3f)) {
                                                val avgDy = (dy1 + dy2) / 2f
                                                val tiltDelta = -avgDy * 0.22 // Drag up -> Tilt up into 3D
                                                val currentTilt = map.cameraPosition.tilt
                                                val newTilt = (currentTilt + tiltDelta).coerceIn(0.0, 60.0)

                                                map.cameraPosition = CameraPosition.Builder()
                                                    .target(map.cameraPosition.target)
                                                    .zoom(map.cameraPosition.zoom)
                                                    .tilt(newTilt)
                                                    .bearing(map.cameraPosition.bearing)
                                                    .build()

                                                val is3D = newTilt > 10.0
                                                if (layerState.is3DModeEnabled != is3D) {
                                                    layerState = layerState.copy(is3DModeEnabled = is3D)
                                                }
                                            }
                                            lastTouchY1 = currentY1
                                            lastTouchY2 = currentY2
                                        }
                                    }
                                    android.view.MotionEvent.ACTION_POINTER_UP,
                                    android.view.MotionEvent.ACTION_UP,
                                    android.view.MotionEvent.ACTION_CANCEL -> {
                                        isTwoFingerDrag = false
                                    }
                                }
                            }
                            false
                        }
                        mapView.getMapAsync { map ->
                            try {
                                map.uiSettings.apply {
                                    isZoomGesturesEnabled = true
                                    isScrollGesturesEnabled = true
                                    isRotateGesturesEnabled = true
                                    isTiltGesturesEnabled = true
                                    isDoubleTapGesturesEnabled = true
                                    isQuickZoomGesturesEnabled = true
                                    isCompassEnabled = false
                                    isLogoEnabled = false
                                    isAttributionEnabled = false
                                }

                                // A manual pan/zoom gesture releases camera
                                // follow so the ranger can inspect the map.
                                map.addOnCameraMoveStartedListener { reason ->
                                    if (reason == MapLibreMap.OnCameraMoveStartedListener.REASON_API_GESTURE) {
                                        followPatrol = false
                                    }
                                }

                                val tileUrl = mbtilesServer.tileUrlFormat
                                val tileSet = TileSet("2.1.0", tileUrl)
                                tileSet.minZoom = 1f
                                tileSet.maxZoom = 13f
                                val rasterSource = RasterSource("mbtiles-raster-source", tileSet, 256)

                                val satelliteTileSet = TileSet(
                                    "2.1.0",
                                    "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                                )
                                satelliteTileSet.minZoom = 0f
                                satelliteTileSet.maxZoom = 21f
                                val satelliteSource = RasterSource("satellite-raster-source", satelliteTileSet, 256)

                                val streetTileSet = TileSet(
                                    "2.1.0",
                                    "https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}"
                                )
                                streetTileSet.minZoom = 0f
                                streetTileSet.maxZoom = 20f
                                val streetSource = RasterSource("street-raster-source", streetTileSet, 256)

                                val styleJson = """
                                    {
                                      "version": 8,
                                      "name": "NSTR Offline Style",
                                      "glyphs": "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
                                      "sources": {},
                                      "layers": [
                                        {
                                          "id": "background",
                                          "type": "background",
                                          "paint": {
                                            "background-color": "#e8eaed"
                                          }
                                        }
                                      ]
                                    }
                                """.trimIndent()

                                map.setStyle(Style.Builder().fromJson(styleJson)) { style ->
                                    style.addSource(rasterSource)
                                    style.addSource(satelliteSource)
                                    style.addSource(streetSource)

                                    val beatGeo = gisRepo.beatGeoJsonString.ifEmpty {
                                        try {
                                            context.assets.open("mark_beat.json").bufferedReader().use { it.readText() }
                                        } catch (_: Exception) { EMPTY_FEATURE_COLLECTION }
                                    }
                                    val compGeo = gisRepo.compartmentGeoJsonString.ifEmpty {
                                        try {
                                            context.assets.open("mark_comp.json").bufferedReader().use { it.readText() }
                                        } catch (_: Exception) { EMPTY_FEATURE_COLLECTION }
                                    }
                                    val trackGeo = buildPatrolTrackGeoJson(patrolPoints)
                                    val currentGeo = if (patrolPoints.isNotEmpty()) buildCurrentPositionGeoJson(patrolPoints.last()) else EMPTY_FEATURE_COLLECTION

                                    val allGridsGeo = ForestGridEngine.generateAllGridsGeoJson(layerState.gridSizeKm2, beatGeo)
                                    val patrolledGridsGeo = ForestGridEngine.generatePatrolledGridsGeoJson(layerState.gridSizeKm2, patrolPoints, beatGeo)

                                    val beatCentroidsGeo = ForestGridEngine.generateBeatCentroidsGeoJson(beatGeo)

                                    style.addSource(GeoJsonSource("beats-geojson-source", beatGeo))
                                    style.addSource(GeoJsonSource("beats-centroids-source", beatCentroidsGeo))
                                    style.addSource(GeoJsonSource("comp-geojson-source", compGeo))
                                    style.addSource(GeoJsonSource("grid-all-source", allGridsGeo))
                                    style.addSource(GeoJsonSource("grid-patrolled-source", patrolledGridsGeo))
                                    style.addSource(GeoJsonSource("patrol-track-source", trackGeo))
                                    style.addSource(GeoJsonSource("patrol-current-source", currentGeo))

                                    // 1. MBTiles Basemap Layer (offline fallback base)
                                    style.addLayer(
                                        RasterLayer("mbtiles-raster-layer", "mbtiles-raster-source").apply {
                                            setProperties(
                                                PropertyFactory.visibility(if (layerState.showMBTiles) Property.VISIBLE else Property.NONE)
                                            )
                                        }
                                    )

                                    // 1b. Satellite Imagery Layer (online Esri World Imagery)
                                    style.addLayer(
                                        RasterLayer("satellite-raster-layer", "satellite-raster-source").apply {
                                            setProperties(
                                                PropertyFactory.visibility(if (layerState.showSatellite) Property.VISIBLE else Property.NONE)
                                            )
                                        }
                                    )

                                    // 1c. Street / Terrain Map Layer (online Esri World Topo Map)
                                    style.addLayer(
                                        RasterLayer("street-raster-layer", "street-raster-source").apply {
                                            setProperties(
                                                PropertyFactory.visibility(if (layerState.showStreet) Property.VISIBLE else Property.NONE)
                                            )
                                        }
                                    )

                                    // 2. Beats Fill Layer (Light forest green tint)
                                    style.addLayer(
                                        FillLayer("beats-fill-layer", "beats-geojson-source").apply {
                                            setProperties(
                                                PropertyFactory.fillColor(AndroidColor.parseColor("#2E7D32")),
                                                PropertyFactory.fillOpacity(0.12f),
                                                PropertyFactory.visibility(if (layerState.showBeats) Property.VISIBLE else Property.NONE)
                                            )
                                        }
                                    )

                                    // 3. Compartments Fill Layer (Soft amber tint)
                                    style.addLayer(
                                        FillLayer("comp-fill-layer", "comp-geojson-source").apply {
                                            setProperties(
                                                PropertyFactory.fillColor(AndroidColor.parseColor("#FF9800")),
                                                PropertyFactory.fillOpacity(0.06f),
                                                PropertyFactory.visibility(if (layerState.showCompartments) Property.VISIBLE else Property.NONE)
                                            )
                                        }
                                    )

                                    // 4. Compartments Line Layer (Clean, thin, elegant amber boundary line)
                                    style.addLayer(
                                        LineLayer("comp-line-layer", "comp-geojson-source").apply {
                                            setProperties(
                                                PropertyFactory.lineColor(AndroidColor.parseColor("#E65100")),
                                                PropertyFactory.lineWidth(1.1f),
                                                PropertyFactory.lineOpacity(0.90f),
                                                PropertyFactory.visibility(if (layerState.showCompartments) Property.VISIBLE else Property.NONE)
                                            )
                                        }
                                    )

                                    val badgeBitmap = createBeatBadgeBitmap(context)
                                    style.addImage("beat-badge-bg", badgeBitmap)

                                    // 5a. Beats Subtle White Casing (For crisp contrast without bulky thickness)
                                    style.addLayer(
                                        LineLayer("beats-casing-layer", "beats-geojson-source").apply {
                                            setProperties(
                                                PropertyFactory.lineColor(AndroidColor.parseColor("#FFFFFF")),
                                                PropertyFactory.lineWidth(2.6f),
                                                PropertyFactory.lineOpacity(0.80f),
                                                PropertyFactory.visibility(if (layerState.showBeats) Property.VISIBLE else Property.NONE)
                                            )
                                        }
                                    )

                                    // 5b. Beats Boundary Line Layer (Refined forest green line)
                                    style.addLayer(
                                        LineLayer("beats-line-layer", "beats-geojson-source").apply {
                                            setProperties(
                                                PropertyFactory.lineColor(AndroidColor.parseColor("#1B5E20")),
                                                PropertyFactory.lineWidth(1.6f),
                                                PropertyFactory.lineOpacity(1.0f),
                                                PropertyFactory.visibility(if (layerState.showBeats) Property.VISIBLE else Property.NONE)
                                            )
                                        }
                                    )

                                    // 5c. Dynamic GIS Grid Layers (Rendered beneath labels)
                                    // 5c-1. Patrolled / Visited Grid Cell Fill (Vibrant green overlay)
                                    style.addLayer(
                                        FillLayer("grid-patrolled-fill-layer", "grid-patrolled-source").apply {
                                            setProperties(
                                                PropertyFactory.fillColor(AndroidColor.parseColor("#4CAF50")),
                                                PropertyFactory.fillOpacity(0.32f),
                                                PropertyFactory.visibility(if (layerState.showGrid) Property.VISIBLE else Property.NONE)
                                            )
                                        }
                                    )
                                    // 5c-2. Patrolled Grid Cell Outline
                                    style.addLayer(
                                        LineLayer("grid-patrolled-line-layer", "grid-patrolled-source").apply {
                                            setProperties(
                                                PropertyFactory.lineColor(AndroidColor.parseColor("#2E7D32")),
                                                PropertyFactory.lineWidth(2.2f),
                                                PropertyFactory.lineOpacity(0.95f),
                                                PropertyFactory.visibility(if (layerState.showGrid) Property.VISIBLE else Property.NONE)
                                            )
                                        }
                                    )
                                    // 5c-3. Full Grid Mesh Wireframe (Crisp blueprint navy line)
                                    style.addLayer(
                                        LineLayer("grid-wire-layer", "grid-all-source").apply {
                                            setProperties(
                                                PropertyFactory.lineColor(AndroidColor.parseColor("#1565C0")),
                                                PropertyFactory.lineWidth(1.2f),
                                                PropertyFactory.lineOpacity(0.75f),
                                                PropertyFactory.visibility(if (layerState.showGrid) Property.VISIBLE else Property.NONE)
                                            )
                                        }
                                    )

                                    // 6. Live Patrol Track (path line + point dots) from local points
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

                                    // 7. Beats Label Layer (Dark Forest Green Pill Badge with White Border & Bold White Text on Centroid - ALWAYS ON TOP)
                                    style.addLayer(
                                        SymbolLayer("beats-label-layer", "beats-centroids-source").apply {
                                            setProperties(
                                                PropertyFactory.iconImage("beat-badge-bg"),
                                                PropertyFactory.iconTextFit(Property.ICON_TEXT_FIT_BOTH),
                                                PropertyFactory.iconTextFitPadding(arrayOf(4f, 8f, 4f, 8f)),
                                                PropertyFactory.iconAllowOverlap(true),
                                                PropertyFactory.iconIgnorePlacement(true),
                                                PropertyFactory.textField("{Beat}"),
                                                PropertyFactory.textSize(10f),
                                                PropertyFactory.textColor(AndroidColor.parseColor("#FFFFFF")),
                                                PropertyFactory.textLetterSpacing(0.04f),
                                                PropertyFactory.textTransform(Property.TEXT_TRANSFORM_UPPERCASE),
                                                PropertyFactory.textAllowOverlap(true),
                                                PropertyFactory.textIgnorePlacement(true),
                                                PropertyFactory.textOptional(false),
                                                PropertyFactory.textAnchor(Property.TEXT_ANCHOR_CENTER),
                                                PropertyFactory.visibility(if (layerState.showBeats) Property.VISIBLE else Property.NONE)
                                            )
                                        }
                                    )

                                    // 10. Live current-position marker ("you are here")
                                    style.addLayer(
                                        CircleLayer("patrol-current-halo-layer", "patrol-current-source").apply {
                                            setProperties(
                                                PropertyFactory.circleColor(AndroidColor.parseColor("#552E7BF6")),
                                                PropertyFactory.circleRadius(16f),
                                                PropertyFactory.visibility(if (layerState.showTrack) Property.VISIBLE else Property.NONE)
                                            )
                                        }
                                    )
                                    style.addLayer(
                                        CircleLayer("patrol-current-dot-layer", "patrol-current-source").apply {
                                            setProperties(
                                                PropertyFactory.circleColor(AndroidColor.parseColor("#2E7BF6")),
                                                PropertyFactory.circleRadius(7f),
                                                PropertyFactory.circleStrokeColor(AndroidColor.parseColor("#FFFFFF")),
                                                PropertyFactory.circleStrokeWidth(2.5f),
                                                PropertyFactory.visibility(if (layerState.showTrack) Property.VISIBLE else Property.NONE)
                                            )
                                        }
                                    )

                                    map.cameraPosition = CameraPosition.Builder()
                                        .target(LatLng(15.92, 79.15))
                                        .zoom(11.8)
                                        .build()

                                    // Tap listener for map features (Grid, Beats, Compartments)
                                    map.addOnMapClickListener { latLng ->
                                        if (layerState.showGrid) {
                                            val cell = ForestGridEngine.getCellAt(latLng.longitude, latLng.latitude, layerState.gridSizeKm2, patrolPoints)
                                            if (cell != null) {
                                                selectedGridCell = cell
                                                selectedBeat = null
                                                selectedCompartment = null
                                                return@addOnMapClickListener true
                                            }
                                        }
                                        val pointF = map.projection.toScreenLocation(latLng)

                                        // 1. Check Beat tap
                                        val beatFeatures = map.queryRenderedFeatures(pointF, "beats-fill-layer")
                                        if (beatFeatures.isNotEmpty()) {
                                            val feat = beatFeatures[0]
                                            val beatName = feat.getStringProperty("Beat") ?: ""
                                            val matchedBeat = gisRepo.findBeatByName(beatName)
                                            if (matchedBeat != null) {
                                                selectedBeat = matchedBeat
                                                return@addOnMapClickListener true
                                            }
                                        }

                                        // 2. Check Compartment tap
                                        val compFeatures = map.queryRenderedFeatures(pointF, "comp-fill-layer")
                                        if (compFeatures.isNotEmpty()) {
                                            val feat = compFeatures[0]
                                            val compId = feat.getStringProperty("OBJECTID_1") ?: ""
                                            val matchedComp = gisRepo.findCompartmentById(compId)
                                            if (matchedComp != null) {
                                                selectedCompartment = matchedComp
                                                return@addOnMapClickListener true
                                            }
                                        }
                                        true
                                    }

                                    miniMapRef = map
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
                    val observer = LifecycleEventObserver { _, event ->
                        miniMapRef?.let {
                            // MapView handles lifecycle events
                        }
                    }
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
            val currentMap = miniMapRef

            Column(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(12.dp)
                    .zIndex(10f),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
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

                // Grid Overlay Quick Toggle
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .background(if (layerState.showGrid) ForestGreen else Surface.copy(alpha = 0.95f))
                        .border(1.dp, if (layerState.showGrid) ForestGreen else OutlineCard, CircleShape)
                        .clickable {
                            val newGridState = !layerState.showGrid
                            val newState = layerState.copy(showGrid = newGridState)
                            layerState = newState
                            miniMapRef?.style?.let { applyLayerVisibility(it, newState) }
                            Toast.makeText(
                                context,
                                if (newGridState) "GIS Grid Overlay Enabled (${layerState.gridSizeKm2} km²)" else "Grid Overlay Disabled",
                                Toast.LENGTH_SHORT
                            ).show()
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Filled.GridView,
                        contentDescription = "Grid",
                        tint = if (layerState.showGrid) Color.White else ForestGreen,
                        modifier = Modifier.size(20.dp)
                    )
                }

                // 3D / 2D Perspective Toggle
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .background(if (layerState.is3DModeEnabled) ForestGreen else Surface.copy(alpha = 0.95f))
                        .border(1.dp, if (layerState.is3DModeEnabled) ForestGreen else OutlineCard, CircleShape)
                        .clickable {
                            currentMap?.let { m ->
                                val enable3D = !layerState.is3DModeEnabled
                                val currentTarget = m.cameraPosition.target
                                val targetTilt = if (enable3D) 58.0 else 0.0
                                val targetBearing = if (enable3D) (if (m.cameraPosition.bearing != 0.0) m.cameraPosition.bearing else -20.0) else 0.0
                                try {
                                    m.animateCamera(
                                        CameraUpdateFactory.newCameraPosition(
                                            CameraPosition.Builder()
                                                .target(currentTarget)
                                                .zoom(m.cameraPosition.zoom)
                                                .tilt(targetTilt)
                                                .bearing(targetBearing)
                                                .build()
                                        ),
                                        900
                                    )
                                } catch (e: Exception) {
                                    m.cameraPosition = CameraPosition.Builder()
                                        .target(currentTarget)
                                        .zoom(m.cameraPosition.zoom)
                                        .tilt(targetTilt)
                                        .bearing(targetBearing)
                                        .build()
                                }
                                layerState = layerState.copy(is3DModeEnabled = enable3D)
                                Toast.makeText(
                                    context,
                                    if (enable3D) "3D Perspective Mode Enabled" else "2D Flat Mode Enabled",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (layerState.is3DModeEnabled) "2D" else "3D",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = if (layerState.is3DModeEnabled) Color.White else ForestGreen
                    )
                }

                // Layers
                FloatingControlButton(
                    icon = Icons.Filled.Layers,
                    contentDescription = "Layers",
                    onClick = { showLayerDialog = true }
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
                            layerState = layerState.copy(is3DModeEnabled = false)
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
                            followPatrol = true
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
                            LegendItem(color = Color(0xFF1565C0), isDashed = true, label = "GIS Grid Mesh (${layerState.gridSizeKm2} km²)")
                            Spacer(Modifier.height(4.dp))
                            LegendItem(color = Color(0xFF4CAF50), isRaster = true, label = "Patrolled Grid Cell")
                            Spacer(Modifier.height(4.dp))
                            LegendItem(color = Color(0xFFFFEB3B), isDashed = false, isPoint = true, label = "My Patrol Track")
                        }
                    }
                }
            }
        }
    }

    // NORMAL VIEW MODE (Inside NstrScaffold)
    NstrScaffold(
        title = "",
        subtitle = "",
        activeTab = BottomTab.Maps,
        onTabSelected = onTabSelected,
        scrollable = false,
        fullWidthContent = true,
        showHeader = false
    ) {
        // Full-bleed map; overlay floats above when patrolling
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            MapContent(modifier = Modifier.fillMaxSize())
            val liveLat = patrolPoints.lastOrNull()?.latitude ?: liveTelemetry.latitude
            val liveLon = patrolPoints.lastOrNull()?.longitude ?: liveTelemetry.longitude
            if (isRunning && liveLat != null && liveLon != null) {
                CoordinatesChip(
                    latitude = liveLat,
                    longitude = liveLon,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(12.dp)
                )
            }
            if (isRunning) {
                ActivePatrolOverlay(
                    distanceMeters = totalDistance,
                    currentSpeedKmh = currentSpeedKmh,
                    moveMinutes = moveMinutes,
                    durationFormatted = patrolTimer.elapsedFormatted(),
                    currentMode = movementInfo.mode,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(12.dp)
                )
            }
        }

    }

    // BEAT DETAILS BOTTOM SHEET
    if (selectedBeat != null) {
        val b = selectedBeat!!
        ModalBottomSheet(
            onDismissRequest = { selectedBeat = null },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
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
                DetailItemRow("Total Area", b.areaHa)
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

    // GRID CELL DETAILS BOTTOM SHEET
    if (selectedGridCell != null) {
        val cell = selectedGridCell!!
        ModalBottomSheet(
            onDismissRequest = { selectedGridCell = null },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
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
                            text = "GIS PATROL GRID CELL",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = ForestGreen
                        )
                        Text(
                            text = cell.id,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = TextPrimary
                        )
                    }
                    IconButton(onClick = { selectedGridCell = null }) {
                        Icon(Icons.Filled.Close, contentDescription = "Close", tint = TextSecondary)
                    }
                }

                Spacer(Modifier.height(14.dp))

                DetailItemRow("Grid Cell Identifier", cell.id)
                DetailItemRow("Grid Mesh Column / Row", "Col ${cell.col}, Row ${cell.row}")
                DetailItemRow("Cell Area", "${cell.areaKm2} sq km")
                DetailItemRow("Patrol Status", if (cell.isPatrolled) "PATROLLED / TRAVERSED" else "UNPATROLLED")
                DetailItemRow("GPS Fixes in Cell", "${cell.patrolPointsCount} points")
                DetailItemRow("Bounding Box", String.format(java.util.Locale.US, "[%.3f, %.3f] to [%.3f, %.3f]", cell.minLon, cell.minLat, cell.maxLon, cell.maxLat))
                DetailItemRow("Center Coordinate", String.format(java.util.Locale.US, "%.5f°N, %.5f°E", cell.centerLat, cell.centerLon))

                Spacer(Modifier.height(20.dp))

                Button(
                    onClick = { selectedGridCell = null },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("CLOSE GRID DETAILS", fontWeight = FontWeight.Bold, color = Color.White)
                }
                Spacer(Modifier.height(12.dp))
            }
        }
    }

    // COMPARTMENT DETAILS BOTTOM SHEET
    if (selectedCompartment != null) {
        val c = selectedCompartment!!
        ModalBottomSheet(
            onDismissRequest = { selectedCompartment = null },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
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
                            text = "COMPARTMENT DETAILS",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextSecondary
                        )
                        Text(
                            text = "Compartment ${c.compNo}",
                            fontSize = 22.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = ForestGreen
                        )
                    }
                    IconButton(onClick = { selectedCompartment = null }) {
                        Icon(Icons.Filled.Close, contentDescription = "Close", tint = TextSecondary)
                    }
                }

                Spacer(Modifier.height(14.dp))

                DetailItemRow("Compartment Number", c.compNo)
                DetailItemRow("Block", c.block)
                DetailItemRow("Beat", c.beat)
                DetailItemRow("Range", c.range)
                DetailItemRow("Division", c.division)
                DetailItemRow("Section", c.section)
                DetailItemRow("Circle", c.circle)
                DetailItemRow("District", c.district)
                DetailItemRow("Total Area", c.areaHa)
                DetailItemRow("Compartment ID", c.id)

                Spacer(Modifier.height(20.dp))

                Button(
                    onClick = { selectedCompartment = null },
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
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = Surface
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp, vertical = 16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Map Layers",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                    IconButton(onClick = { showLayerDialog = false }) {
                        Icon(Icons.Filled.Close, contentDescription = "Close", tint = TextSecondary)
                    }
                }
                Spacer(Modifier.height(14.dp))

                LayerToggleRow(
                    title = "3D Perspective Mode",
                    subtitle = "Dynamic terrain tilt (58°) & 3D perspective",
                    checked = layerState.is3DModeEnabled,
                    onChecked = { checked ->
                        miniMapRef?.let { m ->
                            val currentTarget = m.cameraPosition.target
                            val targetTilt = if (checked) 58.0 else 0.0
                            val targetBearing = if (checked) (if (m.cameraPosition.bearing != 0.0) m.cameraPosition.bearing else -20.0) else 0.0
                            try {
                                m.animateCamera(
                                    CameraUpdateFactory.newCameraPosition(
                                        CameraPosition.Builder()
                                            .target(currentTarget)
                                            .zoom(m.cameraPosition.zoom)
                                            .tilt(targetTilt)
                                            .bearing(targetBearing)
                                            .build()
                                    ),
                                    900
                                )
                            } catch (e: Exception) {
                                m.cameraPosition = CameraPosition.Builder()
                                    .target(currentTarget)
                                    .zoom(m.cameraPosition.zoom)
                                    .tilt(targetTilt)
                                    .bearing(targetBearing)
                                    .build()
                            }
                        }
                        layerState = layerState.copy(is3DModeEnabled = checked)
                    }
                )
                Spacer(Modifier.height(8.dp))
                LayerToggleRow(
                    title = "MBTiles Offline Basemap",
                    subtitle = "Raster tile atlas (NSTR.mbtiles)",
                    checked = layerState.showMBTiles,
                    onChecked = { checked ->
                        val newState = if (checked) {
                            layerState.copy(showMBTiles = true, showSatellite = false, showStreet = false)
                        } else {
                            layerState.copy(showMBTiles = false)
                        }
                        layerState = newState
                        miniMapRef?.style?.let { applyLayerVisibility(it, newState) }
                    }
                )
                Spacer(Modifier.height(8.dp))
                LayerToggleRow(
                    title = "Satellite Imagery",
                    subtitle = "Online Google Satellite Hybrid imagery",
                    checked = layerState.showSatellite,
                    onChecked = { checked ->
                        val newState = if (checked) {
                            layerState.copy(showSatellite = true, showMBTiles = false, showStreet = false)
                        } else {
                            layerState.copy(showSatellite = false, showMBTiles = true)
                        }
                        layerState = newState
                        miniMapRef?.style?.let { applyLayerVisibility(it, newState) }
                    }
                )
                Spacer(Modifier.height(8.dp))
                LayerToggleRow(
                    title = "Street & Terrain Map",
                    subtitle = "Online Google Terrain map with roads & contours",
                    checked = layerState.showStreet,
                    onChecked = { checked ->
                        val newState = if (checked) {
                            layerState.copy(showStreet = true, showMBTiles = false, showSatellite = false)
                        } else {
                            layerState.copy(showStreet = false, showMBTiles = true)
                        }
                        layerState = newState
                        miniMapRef?.style?.let { applyLayerVisibility(it, newState) }
                    }
                )
                Spacer(Modifier.height(8.dp))
                LayerToggleRow(
                    title = "GIS Patrol Grid Overlay",
                    subtitle = "Dynamic ${layerState.gridSizeKm2} km² mesh with path coverage",
                    checked = layerState.showGrid,
                    onChecked = { checked ->
                        val newState = layerState.copy(showGrid = checked)
                        layerState = newState
                        miniMapRef?.style?.let { applyLayerVisibility(it, newState) }
                    }
                )
                if (layerState.showGrid) {
                    Spacer(Modifier.height(6.dp))
                    Text("Grid Cell Size (sq km):", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = ForestGreen, modifier = Modifier.padding(start = 4.dp))
                    Spacer(Modifier.height(4.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        listOf(0.25, 1.0, 2.0, 5.0, 10.0).forEach { size ->
                            val isSel = layerState.gridSizeKm2 == size
                            val label = if (size < 1.0) "0.25 km²" else "${size.toInt()} km²"
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(if (isSel) ForestGreen else Surface)
                                    .border(1.dp, if (isSel) ForestGreen else OutlineCard, RoundedCornerShape(6.dp))
                                    .clickable {
                                        val newState = layerState.copy(gridSizeKm2 = size)
                                        layerState = newState
                                        miniMapRef?.style?.let { applyLayerVisibility(it, newState) }
                                    }
                                    .padding(vertical = 6.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = label,
                                    fontSize = 10.sp,
                                    fontWeight = if (isSel) FontWeight.Bold else FontWeight.Normal,
                                    color = if (isSel) Color.White else TextPrimary
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                LayerToggleRow(
                    title = "Forest Beat Boundaries",
                    subtitle = "44 Markapur Division beats",
                    checked = layerState.showBeats,
                    onChecked = { checked ->
                        val newState = layerState.copy(showBeats = checked)
                        layerState = newState
                        miniMapRef?.style?.let { applyLayerVisibility(it, newState) }
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
                checkedThumbColor = Color.White,
                uncheckedTrackColor = Color(0xFFD6D6D6),
                uncheckedThumbColor = Color.White,
                uncheckedBorderColor = Color(0xFFB0B0B0)
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
    val satelliteVis = if (state.showSatellite) Property.VISIBLE else Property.NONE
    val streetVis = if (state.showStreet) Property.VISIBLE else Property.NONE
    val trackVis = if (state.showTrack) Property.VISIBLE else Property.NONE

    style.getLayer("mbtiles-raster-layer")?.setProperties(PropertyFactory.visibility(mbtilesVis))
    style.getLayer("satellite-raster-layer")?.setProperties(PropertyFactory.visibility(satelliteVis))
    style.getLayer("street-raster-layer")?.setProperties(PropertyFactory.visibility(streetVis))
    style.getLayer("beats-fill-layer")?.setProperties(PropertyFactory.visibility(beatsVis))
    style.getLayer("beats-casing-layer")?.setProperties(PropertyFactory.visibility(beatsVis))
    style.getLayer("beats-line-layer")?.setProperties(PropertyFactory.visibility(beatsVis))
    style.getLayer("beats-label-layer")?.setProperties(PropertyFactory.visibility(beatsVis))
    val gridVis = if (state.showGrid) Property.VISIBLE else Property.NONE
    style.getLayer("grid-patrolled-fill-layer")?.setProperties(PropertyFactory.visibility(gridVis))
    style.getLayer("grid-patrolled-line-layer")?.setProperties(PropertyFactory.visibility(gridVis))
    style.getLayer("grid-wire-layer")?.setProperties(PropertyFactory.visibility(gridVis))
    style.getLayer("comp-fill-layer")?.setProperties(PropertyFactory.visibility(compVis))
    style.getLayer("comp-line-layer")?.setProperties(PropertyFactory.visibility(compVis))
    style.getLayer("patrol-track-line-layer")?.setProperties(PropertyFactory.visibility(trackVis))
    style.getLayer("patrol-track-point-layer")?.setProperties(PropertyFactory.visibility(trackVis))
    style.getLayer("patrol-current-halo-layer")?.setProperties(PropertyFactory.visibility(trackVis))
    style.getLayer("patrol-current-dot-layer")?.setProperties(PropertyFactory.visibility(trackVis))
}

internal fun buildPatrolTrackGeoJson(points: List<PatrolPointEntity>): String {
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

/** LineString-only GeoJSON for the patrol route line. */
internal fun buildPatrolTrackLineGeoJson(points: List<PatrolPointEntity>): String {
    if (points.size < 2) return EMPTY_FC
    val coords = points.joinToString(",") { "[${it.longitude},${it.latitude}]" }
    return "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"LineString\",\"coordinates\":[$coords]},\"properties\":{}}]}"
}

/** Point-only GeoJSON for the patrol route dots. */
internal fun buildPatrolTrackPointGeoJson(points: List<PatrolPointEntity>): String {
    if (points.isEmpty()) return EMPTY_FC
    val pointFeatures = points.joinToString(",") { p ->
        "\"type\":\"Feature\",\"geometry\":{\"type\":\"Point\",\"coordinates\":[${p.longitude},${p.latitude}]},\"properties\":{}"
    }
    return "{\"type\":\"FeatureCollection\",\"features\":[$pointFeatures]}"
}

private const val EMPTY_FC = "{\"type\":\"FeatureCollection\",\"features\":[]}"

internal fun buildCurrentPositionGeoJson(p: PatrolPointEntity): String =
    "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Point\",\"coordinates\":[${p.longitude},${p.latitude}]},\"properties\":{}}]}"

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

@Composable
private fun CoordinatesChip(
    latitude: Double,
    longitude: Double,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(Surface.copy(alpha = 0.95f))
            .border(1.dp, OutlineCard, RoundedCornerShape(8.dp))
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            Icons.Filled.LocationOn,
            contentDescription = null,
            tint = ForestGreen,
            modifier = Modifier.size(14.dp)
        )
        Spacer(Modifier.width(6.dp))
        Text(
            text = String.format(
                java.util.Locale.US,
                "%.5f, %.5f",
                latitude,
                longitude
            ),
            color = TextPrimary,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium
        )
    }
}

/**
 * Creates a high-contrast dark forest green pill badge with a crisp white border,
 * matching the authoritative forest GIS map styling.
 */
private fun createBeatBadgeBitmap(context: Context): android.graphics.Bitmap {
    val density = context.resources.displayMetrics.density
    val width = (64 * density).toInt().coerceAtLeast(1)
    val height = (28 * density).toInt().coerceAtLeast(1)
    val bitmap = android.graphics.Bitmap.createBitmap(width, height, android.graphics.Bitmap.Config.ARGB_8888)
    val canvas = android.graphics.Canvas(bitmap)

    val strokeWidth = 1.6f * density
    val halfStroke = strokeWidth / 2f
    val rect = android.graphics.RectF(halfStroke + 1f, halfStroke + 1f, width - halfStroke - 1f, height - halfStroke - 1f)
    val cornerRadius = 6f * density

    // 1. Dark Forest Green Fill (#154C27)
    val fillPaint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        color = AndroidColor.parseColor("#154C27")
        style = android.graphics.Paint.Style.FILL
    }
    canvas.drawRoundRect(rect, cornerRadius, cornerRadius, fillPaint)

    // 2. Pure White Border (#FFFFFF)
    val strokePaint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        color = AndroidColor.WHITE
        style = android.graphics.Paint.Style.STROKE
        this.strokeWidth = strokeWidth
    }
    canvas.drawRoundRect(rect, cornerRadius, cornerRadius, strokePaint)

    return bitmap
}
