package com.nstrpatrol.app.ui.screens

import android.content.Context
import android.graphics.Color as AndroidColor
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CompassCalibration
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Search
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
import androidx.compose.ui.graphics.Path
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
import com.nstrpatrol.app.data.map.ForestGisRepository
import com.nstrpatrol.app.data.map.GisLayerState
import com.nstrpatrol.app.data.map.MbtilesServer
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
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.LineLayer
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
    dao: TelemetryDao,
    onStopPatrol: () -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    // Initialize GIS repository & local MBTiles tile server
    val gisRepo = remember { ForestGisRepository(context) }
    val mbtilesServer = remember { MbtilesServer(context) }

    LaunchedEffect(Unit) {
        withContext(Dispatchers.IO) {
            gisRepo.loadGisData()
        }
        mbtilesServer.start()
    }

    DisposableEffect(Unit) {
        onDispose {
            mbtilesServer.stop()
        }
    }

    // Map UI state
    var selectedBeat by remember { mutableStateOf<ForestBeatModel?>(null) }
    var layerState by remember { mutableStateOf(GisLayerState()) }
    var showLayerDialog by remember { mutableStateOf(false) }
    var showLegend by remember { mutableStateOf(true) }
    var currentZoom by remember { mutableFloatStateOf(11.5f) }
    var centerLat by remember { mutableDoubleStateOf(15.90) }
    var centerLon by remember { mutableDoubleStateOf(79.25) }

    var mapLibreMapRef by remember { mutableStateOf<MapLibreMap?>(null) }
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

    NstrScaffold(
        title = "Forest Patrol Map",
        subtitle = if (isRunning) "Patrol in progress • Markapur Division" else "Markapur Division • 44 Beats",
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

            Row {
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

        // MAP CONTAINER
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(420.dp)
                .clip(RoundedCornerShape(12.dp))
                .border(1.dp, OutlineCard, RoundedCornerShape(12.dp))
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
                        mapView.getMapAsync { map ->
                            mapLibreMapRef = map
                            try {
                                val tileUrl = mbtilesServer.tileUrlFormat
                                val tileSet = TileSet("2.1.0", tileUrl)
                                tileSet.minZoom = 8f
                                tileSet.maxZoom = 16f
                                val rasterSource = RasterSource("mbtiles-raster-source", tileSet, 256)

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
                                            "background-color": "#f2eae2"
                                          }
                                        }
                                      ]
                                    }
                                """.trimIndent()

                                map.setStyle(Style.Builder().fromJson(styleJson)) { style ->
                                    style.addSource(rasterSource)
                                    if (gisRepo.beatGeoJsonString.isNotEmpty()) {
                                        style.addSource(GeoJsonSource("beats-geojson-source", gisRepo.beatGeoJsonString))
                                    }
                                    if (gisRepo.compartmentGeoJsonString.isNotEmpty()) {
                                        style.addSource(GeoJsonSource("comp-geojson-source", gisRepo.compartmentGeoJsonString))
                                    }

                                    style.addLayer(RasterLayer("mbtiles-raster-layer", "mbtiles-raster-source"))

                                    // Compartments line layer (dashed)
                                    if (gisRepo.compartmentGeoJsonString.isNotEmpty()) {
                                        style.addLayer(
                                            LineLayer("comp-line-layer", "comp-geojson-source").apply {
                                                setProperties(
                                                    PropertyFactory.lineColor(AndroidColor.parseColor("#546E7A")),
                                                    PropertyFactory.lineWidth(1.2f),
                                                    PropertyFactory.lineDasharray(arrayOf(2f, 2f))
                                                )
                                            }
                                        )
                                    }

                                    // Beats fill layer
                                    if (gisRepo.beatGeoJsonString.isNotEmpty()) {
                                        style.addLayer(
                                            FillLayer("beats-fill-layer", "beats-geojson-source").apply {
                                                setProperties(
                                                    PropertyFactory.fillColor(AndroidColor.parseColor("#1E4620")),
                                                    PropertyFactory.fillOpacity(0.20f)
                                                )
                                            }
                                        )

                                        // Beats boundary stroke layer
                                        style.addLayer(
                                            LineLayer("beats-line-layer", "beats-geojson-source").apply {
                                                setProperties(
                                                    PropertyFactory.lineColor(AndroidColor.parseColor("#1E4620")),
                                                    PropertyFactory.lineWidth(2.5f)
                                                )
                                            }
                                        )

                                        // Beat Name Label Layer
                                        style.addLayer(
                                            SymbolLayer("beats-label-layer", "beats-geojson-source").apply {
                                                setProperties(
                                                    PropertyFactory.textField("{Beat}"),
                                                    PropertyFactory.textSize(11f),
                                                    PropertyFactory.textColor(AndroidColor.parseColor("#1E4620")),
                                                    PropertyFactory.textHaloColor(AndroidColor.parseColor("#FFFFFF")),
                                                    PropertyFactory.textHaloWidth(1.5f)
                                                )
                                                minZoom = 10f
                                            }
                                        )
                                    }

                                    map.cameraPosition = CameraPosition.Builder()
                                        .target(LatLng(15.90, 79.25))
                                        .zoom(11.5)
                                        .build()

                                    // Tap listener for beats
                                    map.addOnMapClickListener { latLng ->
                                        val pointF = map.projection.toScreenLocation(latLng)
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
                    update = { view ->
                        // Update layer visibility
                        mapLibreMapRef?.style?.let { style ->
                            style.getLayer("mbtiles-raster-layer")?.setProperties(
                                PropertyFactory.visibility(if (layerState.showMBTiles) "visible" else "none")
                            )
                            style.getLayer("beats-fill-layer")?.setProperties(
                                PropertyFactory.visibility(if (layerState.showBeats) "visible" else "none")
                            )
                            style.getLayer("beats-line-layer")?.setProperties(
                                PropertyFactory.visibility(if (layerState.showBeats) "visible" else "none")
                            )
                            style.getLayer("comp-line-layer")?.setProperties(
                                PropertyFactory.visibility(if (layerState.showCompartments) "visible" else "none")
                            )
                        }
                    }
                )

                // Manage MapView Lifecycle
                DisposableEffect(lifecycleOwner) {
                    val observer = LifecycleEventObserver { _, event ->
                        when (event) {
                            Lifecycle.Event.ON_START -> mapLibreMapRef?.let { }
                            Lifecycle.Event.ON_STOP -> mapLibreMapRef?.let { }
                            else -> {}
                        }
                    }
                    lifecycleOwner.lifecycle.addObserver(observer)
                    onDispose {
                        lifecycleOwner.lifecycle.removeObserver(observer)
                    }
                }
            } else {
                // Fallback Grid Canvas if MapLibre GL is unavailable
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

            // FLOATING MAP CONTROLS (Top-Right / Right Side)
            Column(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Zoom In (+)
                FloatingControlButton(
                    icon = Icons.Filled.Add,
                    contentDescription = "Zoom In",
                    onClick = {
                        mapLibreMapRef?.let { m ->
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
                        mapLibreMapRef?.let { m ->
                            m.animateCamera(CameraUpdateFactory.zoomOut())
                            currentZoom = (m.cameraPosition.zoom - 1).toFloat()
                        }
                    }
                )

                // Compass Reset Bearing
                FloatingControlButton(
                    icon = Icons.Filled.CompassCalibration,
                    contentDescription = "Reset Bearing",
                    onClick = {
                        mapLibreMapRef?.animateCamera(
                            CameraUpdateFactory.newCameraPosition(
                                CameraPosition.Builder().bearing(0.0).build()
                            )
                        )
                    }
                )

                // Recenter Markapur Division
                FloatingControlButton(
                    icon = Icons.Filled.MyLocation,
                    contentDescription = "Recenter",
                    onClick = {
                        mapLibreMapRef?.animateCamera(
                            CameraUpdateFactory.newLatLngZoom(LatLng(15.90, 79.25), 11.5)
                        )
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
                            .width(180.dp),
                        shape = RoundedCornerShape(8.dp),
                        colors = CardDefaults.cardColors(containerColor = Surface.copy(alpha = 0.95f)),
                        border = androidx.compose.foundation.BorderStroke(1.dp, OutlineCard)
                    ) {
                        Column(modifier = Modifier.padding(8.dp)) {
                            LegendItem(color = ForestGreen, isDashed = false, label = "Forest Beat Boundary")
                            Spacer(Modifier.height(4.dp))
                            LegendItem(color = Color(0xFF546E7A), isDashed = true, label = "Compartment Boundary")
                            Spacer(Modifier.height(4.dp))
                            LegendItem(color = Color(0xFFB3261E), isDashed = false, isPoint = true, label = "Sighting / Incident")
                            Spacer(Modifier.height(4.dp))
                            LegendItem(color = Color(0xFFC3B091), isDashed = false, isRaster = true, label = "MBTiles Basemap")
                        }
                    }
                }
            }
        }

        // Active Patrol Overlay / Quick Layers info
        if (isRunning) {
            Spacer(Modifier.height(12.dp))
            ActivePatrolOverlay(
                distanceMeters = totalDistance,
                avgSpeedKmh = avgSpeed,
                moveMinutes = moveMinutes,
                durationFormatted = patrolTimer.elapsedFormatted(),
                currentMode = MovementMode.UNKNOWN,
                onStopPatrol = onStopPatrol
            )
        }

        Spacer(Modifier.height(16.dp))

        // Quick Beat Inspector List
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = Surface),
            border = androidx.compose.foundation.BorderStroke(1.dp, OutlineCard)
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Forest Beats (${gisRepo.beatsList.size})", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = TextPrimary)
                    Text("Tap beat for details", fontSize = 11.sp, color = TextSecondary)
                }

                Spacer(Modifier.height(10.dp))

                val sampleBeats = gisRepo.beatsList.take(4)
                sampleBeats.forEach { beat ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(6.dp))
                            .clickable {
                                selectedBeat = beat
                                mapLibreMapRef?.animateCamera(
                                    CameraUpdateFactory.newLatLngZoom(LatLng(15.90, 79.25), 12.5)
                                )
                            }
                            .padding(vertical = 6.dp, horizontal = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(10.dp)
                                    .background(ForestGreen, CircleShape)
                            )
                            Spacer(Modifier.width(8.dp))
                            Column {
                                Text(beat.name, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = TextPrimary)
                                Text("Range: ${beat.range} • Sec: ${beat.section}", fontSize = 11.sp, color = TextSecondary)
                            }
                        }
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(LightForest)
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Text("ID: ${beat.id}", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = ForestGreen)
                        }
                    }
                    Spacer(Modifier.height(4.dp))
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
                        onChecked = { layerState = layerState.copy(showMBTiles = it) }
                    )
                    Spacer(Modifier.height(8.dp))
                    LayerToggleRow(
                        title = "Forest Beat Boundaries",
                        subtitle = "44 Markapur Division beats",
                        checked = layerState.showBeats,
                        onChecked = { layerState = layerState.copy(showBeats = it) }
                    )
                    Spacer(Modifier.height(8.dp))
                    LayerToggleRow(
                        title = "Forest Compartments",
                        subtitle = "448 compartment polygons",
                        checked = layerState.showCompartments,
                        onChecked = { layerState = layerState.copy(showCompartments = it) }
                    )
                    Spacer(Modifier.height(8.dp))
                    LayerToggleRow(
                        title = "Sighting & Incident Points",
                        subtitle = "Patrol checkpoint markers",
                        checked = layerState.showIncidents,
                        onChecked = { layerState = layerState.copy(showIncidents = it) }
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
