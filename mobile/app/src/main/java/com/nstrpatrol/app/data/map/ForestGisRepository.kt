package com.nstrpatrol.app.data.map

import android.content.Context
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
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

/**
 * Loads forest beats + compartments GeoJSON. Source priority:
 *   1. Backend API (fresh data, written to a local cache file)
 *   2. Local cache (previously synced backend data, offline)
 *   3. Bundled assets (mark_beat.json / mark_comp.json) as a last resort
 */
class ForestGisRepository(private val context: Context) {

    private val api = BackendApiClient()
    private val cacheDir = File(context.filesDir, "gis")

    var beatGeoJsonString: String = ""
        private set

    var compartmentGeoJsonString: String = ""
        private set

    var isDataLoaded by mutableStateOf(false)
        private set

    /** Where the currently displayed data came from: "backend" | "cache" | "assets" */
    var source by mutableStateOf("none")
        private set

    val beatsList = mutableStateListOf<ForestBeatModel>()
    val compartmentsList = mutableStateListOf<ForestCompartmentModel>()

    fun loadGisData() {
        if (isDataLoaded) return

        // 1. Backend, fresh copy synced to disk.
        val backendBeats = api.getText("/api/gis/beats")
        if (backendBeats != null) {
            writeCache("beats.geojson", backendBeats)

            // Try compartments; on failure, retry independently (large 3 MB
            // payload is prone to timeout on slow connections).
            var backendComps = api.getText("/api/gis/compartments")
            if (backendComps == null) {
                Log.w("ForestGisRepository", "Compartments fetch failed, retrying...")
                backendComps = api.getText("/api/gis/compartments")
            }
            backendComps?.let { writeCache("compartments.geojson", it) }

            // Use whatever we have — cached compartments are fine as fallback.
            val compData = backendComps ?: readCache("compartments.geojson") ?: loadAssetComps()
            applyData(backendBeats, compData)

            isDataLoaded = beatGeoJsonString.isNotEmpty()
            Log.d("ForestGisRepository", "Loaded beats/compartments from backend (comps=${compartmentsList.size})")
            return
        }

        // 2. Cached copy from a previous sync (offline mode).
        val cachedBeats = readCache("beats.geojson")
        if (cachedBeats != null) {
            applyData(cachedBeats, readCache("compartments.geojson") ?: loadAssetComps())
            source = "cache"
            isDataLoaded = beatGeoJsonString.isNotEmpty()
            Log.d("ForestGisRepository", "Loaded beats/compartments from cache")
            return
        }

        // 3. Bundled assets fallback.
        loadFromAssets()
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
            Log.d("ForestGisRepository", "Loaded beats/compartments from bundled assets")
        } catch (e: Exception) {
            Log.e("ForestGisRepository", "Error reading mark_beat.json", e)
        }

        // Only signal "loaded" once the beat data (the layer the map waits for)
        // parsed successfully, so the map is never blocked forever on a bad asset.
        isDataLoaded = beatGeoJsonString.isNotEmpty()
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
        Log.d("ForestGisRepository", "Parsed ${beatsList.size} forest beats")
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
            Log.d("ForestGisRepository", "Parsed ${compartmentsList.size} compartments")
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

    private fun loadAssetComps(): String = try {
        context.assets.open("mark_comp.json").bufferedReader().use { it.readText() }
    } catch (e: Exception) {
        Log.e("ForestGisRepository", "Error reading mark_comp.json", e)
        ""
    }
}
