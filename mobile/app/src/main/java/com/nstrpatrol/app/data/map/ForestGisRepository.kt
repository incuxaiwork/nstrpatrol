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
    val showTrack: Boolean = true
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

            val beat = ForestBeatModel(
                id = props.optString("OBJECTID_1", "BEAT-${i + 1}"),
                name = props.optString("Beat", "UNNAMED BEAT"),
                section = props.optString("Section", "N/A"),
                range = props.optString("Range", "MARKAPUR"),
                division = props.optString("Division", "DD MARKAPUR"),
                circle = props.optString("Circle", "PT Circle"),
                district = props.optString("District", "PALNADU"),
                areaHa = props.optString("Area_ha", "0.00"),
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
                    areaHa = props.optString("AREA_HA", "0.00"),
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
