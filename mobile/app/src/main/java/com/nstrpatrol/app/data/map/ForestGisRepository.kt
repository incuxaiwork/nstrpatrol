package com.nstrpatrol.app.data.map

import android.content.Context
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File

data class ForestBeatModel(
    val id: String,
    val name: String,
    val section: String,
    val range: String,
    val division: String,
    val circle: String,
    val district: String,
    val areaHa: String,
    val rawProperties: Map<String, String>,
    val rawJson: String
)

data class ForestCompartmentModel(
    val id: String,
    val compNo: String,
    val block: String,
    val beat: String,
    val range: String,
    val division: String,
    val section: String,
    val circle: String,
    val district: String,
    val areaHa: String,
    val rawProperties: Map<String, String>
)

data class GisLayerState(
    val showBeats: Boolean = true,
    val showCompartments: Boolean = true,
    val showMBTiles: Boolean = true,
    val showSatellite: Boolean = true,
    val showStreet: Boolean = true,
    val showTrack: Boolean = true,
    val showGrid: Boolean = false,
    val gridSizeKm2: Double = 1.0,
    val is3DModeEnabled: Boolean = false
)

/** Backend version snapshot used to decide whether a re-fetch is worthwhile. */
data class GisVersion(
    val beatCount: Int,
    val compCount: Int,
    val beatLastUpdated: String?,
    val compLastUpdated: String?
)

/**
 * Loads forest beats + compartments GeoJSON.
 *
 * Source priority:
 *   1. Bundled assets (instant, zero network — map renders immediately)
 *   2. Background sync from backend API (non-blocking, updates map if fresher data arrives)
 *   3. Local disk cache (previously synced backend data, used if backend is unreachable)
 */
class ForestGisRepository(private val context: Context) {

    private val api = BackendApiClient()
    private val cacheDir = File(context.filesDir, "gis")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    companion object {
        /**
         * Read beat names directly from the bundled mark_beat.json asset.
         * Falls back to the hardcoded list if the asset can't be read.
         */
        fun readBeatNames(context: Context): List<String> {
            return try {
                val geoJson = context.assets.open("mark_beat.json").bufferedReader().use { it.readText() }
                val root = JSONObject(geoJson)
                val features = root.optJSONArray("features") ?: return fallbackBeats()
                val names = mutableListOf<String>()
                names.add("All")
                for (i in 0 until features.length()) {
                    val feature = features.getJSONObject(i)
                    val props = feature.optJSONObject("properties") ?: JSONObject()
                    val name = props.optString("Beat", "").trim()
                    if (name.isNotEmpty() && name !in names) names.add(name)
                }
                names.sorted()
            } catch (e: Exception) {
                fallbackBeats()
            }
        }

        private fun fallbackBeats() = listOf(
            "All", "Bommilingam", "Donakonda", "Gotlagattu", "Gottipadia", "Gundamcherla",
            "Kalanuthala", "Kalzuvvalapadu", "Magutur", "Nagulavaram", "Peddarikatla",
            "Podili", "Potlapadu"
        )
    }

    var beatGeoJsonString: String = ""
        private set

    var compartmentGeoJsonString: String = ""
        private set

    var isDataLoaded by mutableStateOf(false)
        private set

    /** Where the currently displayed data came from: "backend" | "cache" | "assets" */
    var source by mutableStateOf("none")
        private set

    /** Timestamp of the last successful sync (epoch millis). 0 = never synced. */
    var lastSyncTime by mutableStateOf(0L)
        private set

    /** True while a background refresh is in progress. */
    var isSyncing by mutableStateOf(false)
        private set

    /** Latest backend version info, or null if not yet fetched. */
    var backendVersion by mutableStateOf<GisVersion?>(null)
        private set

    val beatsList = mutableStateListOf<ForestBeatModel>()
    val compartmentsList = mutableStateListOf<ForestCompartmentModel>()

    /**
     * Load GIS data. Assets-first: map renders instantly, backend syncs in background.
     * Must be called on Dispatchers.IO or will launch its own coroutine.
     */
    fun loadGisData() {
        if (isDataLoaded) return

        // Bundled assets only — instant, zero network wait.
        // Backend sync re-enabled in a future release.
        loadFromAssets()
    }

    /**
     * Force a re-sync from the backend, bypassing the "already loaded" guard.
     * Shows a spinner via [isSyncing] while the fetch runs.
     */
    fun forceRefresh() {
        if (isSyncing) return
        scope.launch { syncFromBackend(force = true) }
    }

    /**
     * Blocking call that loads assets only.
     * Backend sync re-enabled in a future release.
     */
    suspend fun loadGisDataBlocking() {
        if (isDataLoaded) return

        withContext(Dispatchers.IO) {
            loadFromAssets()
        }
    }

    private fun loadFromAssets() {
        try {
            val assetBeats = context.assets.open("mark_beat.json").bufferedReader().use { it.readText() }
            val assetComps = try {
                context.assets.open("mark_comp.json").bufferedReader().use { it.readText() }
            } catch (e: Exception) {
                Log.e("ForestGisRepository", "Error reading mark_comp.json", e)
                ""
            }
            applyData(assetBeats, assetComps)
            source = "assets"
            isDataLoaded = beatGeoJsonString.isNotEmpty()
            Log.d("ForestGisRepository", "Loaded ${beatsList.size} beats, ${compartmentsList.size} compartments from assets (instant)")
        } catch (e: Exception) {
            Log.e("ForestGisRepository", "Error reading bundled assets", e)
            isDataLoaded = false
        }
    }

    private suspend fun syncFromBackend(force: Boolean = false) {
        withContext(Dispatchers.IO) {
            isSyncing = true
            try {
                // Optionally check version first to skip unnecessary fetches.
                if (!force) {
                    val ver = fetchVersion()
                    if (ver != null) {
                        backendVersion = ver
                        val cachedVer = readCache("version.json")
                        if (cachedVer != null) {
                            try {
                                val cached = JSONObject(cachedVer)
                                if (cached.optInt("beatCount") == ver.beatCount &&
                                    cached.optInt("compCount") == ver.compCount
                                ) {
                                    Log.d("ForestGisRepository", "Backend version matches cache — skipping re-fetch")
                                    withContext(Dispatchers.Main) { isSyncing = false }
                                    return@withContext
                                }
                            } catch (_: Exception) { }
                        }
                        writeCache("version.json", JSONObject().apply {
                            put("beatCount", ver.beatCount)
                            put("compCount", ver.compCount)
                        }.toString())
                    }
                }

                val backendBeats = api.getText("/api/gis/beats") ?: run {
                    withContext(Dispatchers.Main) { isSyncing = false }
                    return@withContext
                }
                writeCache("beats.geojson", backendBeats)

                var backendComps = api.getText("/api/gis/compartments")
                if (backendComps == null) {
                    Log.w("ForestGisRepository", "Compartments fetch failed, retrying...")
                    backendComps = api.getText("/api/gis/compartments")
                }
                backendComps?.let { writeCache("compartments.geojson", it) }

                val compData = backendComps ?: readCache("compartments.geojson") ?: run {
                    withContext(Dispatchers.Main) { isSyncing = false }
                    return@withContext
                }

                // Update data on main thread so Compose recomposes.
                // Only overwrite if backend has at least as many features
                // as the current data — prevents backend (possibly un-imported)
                // from wiping richer bundled assets.
                val backendCompCount = countFeatures(compData)
                val currentCompCount = compartmentsList.size
                if (backendCompCount >= currentCompCount || force) {
                    withContext(Dispatchers.Main) {
                        applyData(backendBeats, compData)
                        source = "backend"
                        lastSyncTime = System.currentTimeMillis()
                        Log.d("ForestGisRepository", "Sync: ${beatsList.size} beats, ${compartmentsList.size} compartments from backend")
                    }
                } else {
                    Log.w("ForestGisRepository", "Backend has fewer compartments ($backendCompCount) than current ($currentCompCount) — keeping current data")
                }
            } catch (e: Exception) {
                Log.d("ForestGisRepository", "Sync failed (using assets): ${e.message}")
            } finally {
                withContext(Dispatchers.Main) { isSyncing = false }
            }
        }
    }

    private fun fetchVersion(): GisVersion? {
        val json = api.getJson("/api/gis/version") ?: return null
        val b = json.optJSONObject("beats") ?: JSONObject()
        val c = json.optJSONObject("compartments") ?: JSONObject()
        return GisVersion(
            beatCount = b.optInt("count", 0),
            compCount = c.optInt("count", 0),
            beatLastUpdated = b.optString("lastUpdated", null),
            compLastUpdated = c.optString("lastUpdated", null)
        )
    }

    private fun applyData(beatGeoJson: String, compartmentGeoJson: String) {
        beatGeoJsonString = beatGeoJson
        compartmentGeoJsonString = compartmentGeoJson
        parseBeats(beatGeoJson)
        parseCompartments(compartmentGeoJson)
    }

    fun findBeatByName(name: String): ForestBeatModel? {
        return beatsList.find { it.name.equals(name, ignoreCase = true) }
    }

    fun findCompartmentById(id: String): ForestCompartmentModel? {
        return compartmentsList.find { it.id == id }
    }

    /**
     * Offline location validation — mirrors the server's POST /api/gis/validate-location
     * using the bundled mark_beat.json GeoJSON data. Returns a JSONObject with the same
     * shape as the API response so the UI can consume it identically.
     */
    fun validateLocationOffline(lat: Double, lng: Double, beatName: String?, sectionName: String?, rangeName: String?): JSONObject {
        val geoJson = beatGeoJsonString
        if (geoJson.isBlank()) {
            return JSONObject().apply {
                put("valid", false)
                put("reason", "no_gis_data")
                put("message", "Beat geometry data not available")
            }
        }

        val features = try {
            val root = JSONObject(geoJson)
            val arr = root.optJSONArray("features") ?: return JSONObject().apply {
                put("valid", false); put("reason", "no_gis_data"); put("message", "No GIS features loaded")
            }
            (0 until arr.length()).map { arr.getJSONObject(it) }
        } catch (_: Exception) {
            return JSONObject().apply {
                put("valid", false); put("reason", "no_gis_data"); put("message", "Failed to parse GIS data")
            }
        }

        if (features.isEmpty()) {
            return JSONObject().apply {
                put("valid", false); put("reason", "no_gis_data"); put("message", "No beat geometry available")
            }
        }

        // 1. Beat-level check
        if (beatName != null) {
            val normalised = beatName.uppercase()
            val match = features.find {
                (it.optJSONObject("properties")?.optString("Beat") ?: "").uppercase() == normalised
            }
            if (match == null) {
                return JSONObject().apply {
                    put("valid", false); put("reason", "beat_not_found")
                    put("message", "Beat \"$beatName\" not found in GIS data")
                }
            }
            val inside = pointInGeometry(lng, lat, match.optJSONObject("geometry"))
            return JSONObject().apply {
                put("valid", inside)
                put("reason", if (inside) "inside_beat" else "outside_beat")
                put("beat", match.optJSONObject("properties")?.optString("Beat"))
                put("range", match.optJSONObject("properties")?.optString("Range"))
            }
        }

        // 2. Section-level check (FSO/DyRO with section but no beat)
        if (sectionName != null) {
            val normalised = sectionName.uppercase()
            val sectionBeats = features.filter {
                (it.optJSONObject("properties")?.optString("Section") ?: "").uppercase() == normalised
            }
            if (sectionBeats.isEmpty()) {
                // Section not found — fall through to range check if available
                if (rangeName == null) {
                    return JSONObject().apply {
                        put("valid", false); put("reason", "section_not_found")
                        put("message", "Section \"$sectionName\" not found in GIS data")
                    }
                }
            } else {
                val insideBeat = sectionBeats.find { pointInGeometry(lng, lat, it.optJSONObject("geometry")) }
                return JSONObject().apply {
                    put("valid", insideBeat != null)
                    put("reason", if (insideBeat != null) "inside_section" else "outside_section")
                    put("beat", insideBeat?.optJSONObject("properties")?.optString("Beat"))
                    put("range", rangeName ?: insideBeat?.optJSONObject("properties")?.optString("Range"))
                    put("section", sectionName)
                }
            }
        }

        // 3. Range-level check
        if (rangeName != null) {
            val normalised = rangeName.uppercase()
            val rangeBeats = features.filter {
                (it.optJSONObject("properties")?.optString("Range") ?: "").uppercase() == normalised
            }
            if (rangeBeats.isEmpty()) {
                return JSONObject().apply {
                    put("valid", false); put("reason", "range_not_found")
                    put("message", "Range \"$rangeName\" not found in GIS data")
                }
            }
            val insideBeat = rangeBeats.find { pointInGeometry(lng, lat, it.optJSONObject("geometry")) }
            return JSONObject().apply {
                put("valid", insideBeat != null)
                put("reason", if (insideBeat != null) "inside_range" else "outside_range")
                put("beat", insideBeat?.optJSONObject("properties")?.optString("Beat"))
                put("range", rangeName)
            }
        }

        // 4. No assignment — admin / unassigned
        return JSONObject().apply {
            put("valid", true); put("reason", "no_assignment")
            put("message", "No beat or range assignment to validate against")
        }
    }

    /** Ray-casting point-in-polygon. Coordinates are [lng, lat] (GeoJSON order). */
    private fun pointInPolygon(lng: Double, lat: Double, ring: org.json.JSONArray): Boolean {
        var inside = false
        val n = ring.length()
        var i = 0
        var j = n - 1
        while (i < n) {
            val xi = ring.getJSONArray(i).getDouble(0)
            val yi = ring.getJSONArray(i).getDouble(1)
            val xj = ring.getJSONArray(j).getDouble(0)
            val yj = ring.getJSONArray(j).getDouble(1)
            if ((yi > lat) != (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
                inside = !inside
            }
            j = i++
        }
        return inside
    }

    /** Check if a point is inside a GeoJSON geometry (Polygon or MultiPolygon). */
    private fun pointInGeometry(lng: Double, lat: Double, geom: org.json.JSONObject?): Boolean {
        if (geom == null) return false
        val type = geom.optString("type")
        val coords = geom.optJSONArray("coordinates") ?: return false
        if (type == "Polygon") {
            return pointInPolygon(lng, lat, coords.getJSONArray(0))
        }
        if (type == "MultiPolygon") {
            for (i in 0 until coords.length()) {
                if (pointInPolygon(lng, lat, coords.getJSONArray(i).getJSONArray(0))) return true
            }
        }
        return false
    }

    /**
     * Calculates geodesic polygon area in Hectares from a GeoJSON Feature JSONObject.
     */
    private fun calculateGeometryAreaHa(feature: JSONObject): Double {
        val geom = feature.optJSONObject("geometry") ?: return 0.0
        val type = geom.optString("type")
        val coords = geom.optJSONArray("coordinates") ?: return 0.0

        val rings = ArrayList<List<Pair<Double, Double>>>()
        try {
            if (type == "Polygon") {
                if (coords.length() > 0) {
                    val outer = coords.optJSONArray(0)
                    if (outer != null) rings.add(parseCoordRing(outer))
                }
            } else if (type == "MultiPolygon") {
                for (m in 0 until coords.length()) {
                    val poly = coords.optJSONArray(m) ?: continue
                    if (poly.length() > 0) {
                        val outer = poly.optJSONArray(0)
                        if (outer != null) rings.add(parseCoordRing(outer))
                    }
                }
            }
        } catch (e: Exception) {
            return 0.0
        }

        if (rings.isEmpty()) return 0.0

        var totalAreaSqM = 0.0
        for (ring in rings) {
            if (ring.size < 3) continue
            var sumLat = 0.0
            for (pt in ring) sumLat += pt.second
            val refLat = sumLat / ring.size

            val latScale = 111139.0
            val lonScale = 111139.0 * kotlin.math.cos(Math.toRadians(refLat))

            var ringArea = 0.0
            val n = ring.size
            for (i in 0 until n) {
                val p1 = ring[i]
                val p2 = ring[(i + 1) % n]
                val x1 = p1.first * lonScale
                val y1 = p1.second * latScale
                val x2 = p2.first * lonScale
                val y2 = p2.second * latScale
                ringArea += (x1 * y2 - x2 * y1)
            }
            totalAreaSqM += Math.abs(ringArea) / 2.0
        }
        return totalAreaSqM / 10000.0
    }

    private fun parseCoordRing(ringArray: org.json.JSONArray): List<Pair<Double, Double>> {
        val list = ArrayList<Pair<Double, Double>>(ringArray.length())
        for (k in 0 until ringArray.length()) {
            val pt = ringArray.optJSONArray(k) ?: continue
            list.add(Pair(pt.optDouble(0), pt.optDouble(1)))
        }
        return list
    }

    private fun parseBeats(geoJson: String) {
        val root = JSONObject(geoJson)
        val features = root.optJSONArray("features") ?: return
        val newBeats = mutableListOf<ForestBeatModel>()
        for (i in 0 until features.length()) {
            val feature = features.getJSONObject(i)
            val props = feature.optJSONObject("properties") ?: JSONObject()

            val propMap = mutableMapOf<String, String>()
            val keys = props.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                propMap[k] = props.optString(k, "")
            }

            val rawAreaStr = props.optString("Area_ha", "0.00")
            val rawAreaVal = rawAreaStr.toDoubleOrNull() ?: 0.0
            val areaFormatted = if (rawAreaVal > 0.0) {
                String.format(java.util.Locale.US, "%,.2f ha (%,.2f km²)", rawAreaVal, rawAreaVal / 100.0)
            } else {
                val computedHa = calculateGeometryAreaHa(feature)
                if (computedHa > 0.0) {
                    String.format(java.util.Locale.US, "%,.2f ha (%,.2f km²)", computedHa, computedHa / 100.0)
                } else "0.00 ha"
            }

            val beat = ForestBeatModel(
                id = props.optString("OBJECTID_1", "BEAT-${i + 1}"),
                name = props.optString("Beat", "UNNAMED BEAT"),
                section = props.optString("Section", "N/A"),
                range = props.optString("Range", "MARKAPUR"),
                division = props.optString("Division", "DD MARKAPUR"),
                circle = props.optString("Circle", "PT Circle"),
                district = props.optString("District", "PALNADU"),
                areaHa = areaFormatted,
                rawProperties = propMap,
                rawJson = feature.toString()
            )
            newBeats.add(beat)
        }
        beatsList.clear()
        beatsList.addAll(newBeats)
    }

    private fun parseCompartments(geoJson: String) {
        if (geoJson.isBlank()) return
        try {
            val root = JSONObject(geoJson)
            val features = root.optJSONArray("features") ?: return
            val newComps = mutableListOf<ForestCompartmentModel>()
            for (i in 0 until features.length()) {
                val feature = features.getJSONObject(i)
                val props = feature.optJSONObject("properties") ?: JSONObject()

                val propMap = mutableMapOf<String, String>()
                val keys = props.keys()
                while (keys.hasNext()) {
                    val k = keys.next()
                    propMap[k] = props.optString(k, "")
                }

                val rawAreaStr = props.optString("AREA_HA", "0.00")
                val rawAreaVal = rawAreaStr.toDoubleOrNull() ?: 0.0
                val areaFormatted = if (rawAreaVal > 0.0) {
                    String.format(java.util.Locale.US, "%,.2f ha (%,.2f km²)", rawAreaVal, rawAreaVal / 100.0)
                } else {
                    val computedHa = calculateGeometryAreaHa(feature)
                    if (computedHa > 0.0) {
                        String.format(java.util.Locale.US, "%,.2f ha (%,.2f km²)", computedHa, computedHa / 100.0)
                    } else "0.00 ha"
                }

                val comp = ForestCompartmentModel(
                    id = props.optString("OBJECTID_1", "COMP-${i + 1}"),
                    compNo = props.optString("COMP_NO", "N/A"),
                    block = props.optString("BLOCK", "N/A"),
                    beat = props.optString("BEAT", "N/A"),
                    range = props.optString("RANGE", "N/A"),
                    division = props.optString("DIVISION", "N/A"),
                    section = props.optString("SECTION", "N/A"),
                    circle = props.optString("CIRCLE", "N/A"),
                    district = props.optString("DISTRICT", "N/A"),
                    areaHa = areaFormatted,
                    rawProperties = propMap
                )
                newComps.add(comp)
            }
            compartmentsList.clear()
            compartmentsList.addAll(newComps)
        } catch (e: Exception) {
            Log.e("ForestGisRepository", "Error parsing compartments", e)
        }
    }

    private fun writeCache(fileName: String, content: String) {
        try {
            cacheDir.mkdirs()
            File(cacheDir, fileName).writeText(content)
        } catch (e: Exception) {
            Log.w("ForestGisRepository", "Failed writing cache $fileName", e)
        }
    }

    private fun readCache(fileName: String): String? {
        return try {
            val f = File(cacheDir, fileName)
            if (f.exists()) f.readText() else null
        } catch (e: Exception) {
            Log.w("ForestGisRepository", "Failed reading cache $fileName", e)
            null
        }
    }

    /** Count features in a GeoJSON string without full parsing. */
    private fun countFeatures(geoJson: String): Int {
        return try {
            val root = JSONObject(geoJson)
            root.optJSONArray("features")?.length() ?: 0
        } catch (e: Exception) {
            0
        }
    }
}
