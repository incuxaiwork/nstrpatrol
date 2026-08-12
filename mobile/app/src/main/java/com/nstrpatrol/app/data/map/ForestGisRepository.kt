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

data class SightingPointModel(
    val id: String,
    val title: String,
    val category: String,
    val icon: String,
    val lat: Double,
    val lon: Double,
    val time: String,
    val beatName: String,
    val severity: String,
    val details: String
)

data class GisLayerState(
    val showBeats: Boolean = true,
    val showCompartments: Boolean = true,
    val showIncidents: Boolean = true,
    val showMBTiles: Boolean = true
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

    var incidentGeoJsonString: String = ""
        private set

    var isDataLoaded by mutableStateOf(false)
        private set

    /** Where the currently displayed data came from: "backend" | "cache" | "assets" */
    var source by mutableStateOf("none")
        private set

    val beatsList = mutableStateListOf<ForestBeatModel>()
    val incidentsList = mutableStateListOf<SightingPointModel>()

    fun loadGisData() {
        if (isDataLoaded) return
        seedIncidents()

        // 1. Backend, fresh copy synced to disk.
        val backendBeats = api.getText("/api/gis/beats")
        if (backendBeats != null) {
            val backendComps = api.getText("/api/gis/compartments")
            writeCache("beats.geojson", backendBeats)
            backendComps?.let { writeCache("compartments.geojson", it) }
            applyData(backendBeats, backendComps ?: readCache("compartments.geojson") ?: "")

            isDataLoaded = beatGeoJsonString.isNotEmpty()
            Log.d("ForestGisRepository", "Loaded beats/compartments from backend")
            return
        }

        // 2. Cached copy from a previous sync (offline mode).
        val cachedBeats = readCache("beats.geojson")
        if (cachedBeats != null) {
            applyData(cachedBeats, readCache("compartments.geojson") ?: "")
            source = "cache"
            isDataLoaded = beatGeoJsonString.isNotEmpty()
            Log.d("ForestGisRepository", "Loaded beats/compartments from cache")
            return
        }

        // 3. Bundled assets fallback.
        loadFromAssets()
    }

    fun findBeatByName(name: String): ForestBeatModel? {
        return beatsList.find { it.name.equals(name, ignoreCase = true) }
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

    /** Seeds the 12 demo sighting/incident markers so the map always has live points. */
    private fun seedIncidents() {
        if (incidentsList.isNotEmpty()) return

        // Initialize 12 Sighting & Incident Points across Markapur Division
        val sampleIncidents = listOf(
            SightingPointModel("S-101", "Tiger Direct Sighting", "Carnivore", "🐅", 15.935, 79.215, "Today · 06:45 AM", "Bommilingam", "High", "Adult male tiger spotted near waterhole T-4. Moving south-east."),
            SightingPointModel("S-102", "Leopard Pugmarks", "Wildlife Track", "🐆", 15.892, 79.280, "Today · 07:15 AM", "Nagulavaram", "Medium", "Fresh leopard pugmark track recorded along the fire line."),
            SightingPointModel("S-103", "Illegal Electric Wire", "Encroachment", "⚡", 15.960, 79.170, "Yesterday · 04:20 PM", "Gundamcherla", "Critical", "Hooked electric wire detected along boundary fence. Dismantled."),
            SightingPointModel("S-104", "Sloth Bear Active", "Carnivore", "🐻", 15.845, 79.310, "Yesterday · 05:50 PM", "Magutur", "Medium", "Mother sloth bear with two cubs feeding near termite mound."),
            SightingPointModel("S-105", "Tree Cutting Signs", "Illegal Felling", "🪓", 15.870, 79.240, "06 Aug 2026 · 11:30 AM", "Donakonda", "High", "Freshly cut teak wood logs found stacked near stream bed."),
            SightingPointModel("S-106", "Deer Mortality", "Animal Mortality", "🦌", 15.910, 79.130, "05 Aug 2026 · 09:10 AM", "Kalanuthala", "Medium", "Spotted deer carcass near tank K-9. No external injury."),
            SightingPointModel("S-107", "Wire Snare Seized", "Poaching Trap", "🪤", 15.980, 79.230, "05 Aug 2026 · 02:40 PM", "Gotlagattu", "Critical", "Metal wire snare seized near animal trail. Area swept."),
            SightingPointModel("S-108", "Water Tank Low", "Waterhole Status", "💧", 15.820, 79.200, "04 Aug 2026 · 08:00 AM", "Potlapadu", "Low", "Water level critically low at artificial saucer pit #4."),
            SightingPointModel("S-109", "Wild Elephant Herd", "Herbivore Track", "🐘", 15.940, 79.290, "04 Aug 2026 · 04:15 PM", "Podili", "High", "Herd of 4 wild elephants moving towards crop field border."),
            SightingPointModel("S-110", "Dhole Dog Pack", "Carnivore", "🐺", 15.880, 79.180, "03 Aug 2026 · 06:30 AM", "Gottipadia", "Low", "Pack of 6 Asiatic wild dogs resting near rocky outcrop."),
            SightingPointModel("S-111", "Camera Trap #T-08", "Camera Capture", "📷", 15.915, 79.260, "02 Aug 2026 · 10:05 PM", "Peddarikatla", "Medium", "Tiger image captured on motion camera trap #T-08."),
            SightingPointModel("S-112", "Camp Fire Evidence", "Human Sign", "🔥", 15.850, 79.270, "01 Aug 2026 · 03:20 PM", "Kalzuvvalapadu", "Medium", "Unextinguished camp fire remains and plastic waste cleared.")
        )

        incidentsList.clear()
        incidentsList.addAll(sampleIncidents)

        // Build GeoJSON for Incident & Sighting Points
        val featureList = sampleIncidents.map { inc ->
            """
            {
              "type": "Feature",
              "geometry": {
                "type": "Point",
                "coordinates": [${inc.lon}, ${inc.lat}]
              },
              "properties": {
                "id": "${inc.id}",
                "title": "${inc.title}",
                "category": "${inc.category}",
                "icon": "${inc.icon}",
                "time": "${inc.time}",
                "beatName": "${inc.beatName}",
                "severity": "${inc.severity}",
                "details": "${inc.details}"
              }
            }
            """.trimIndent()
        }.joinToString(",")

        incidentGeoJsonString = """
            {
              "type": "FeatureCollection",
              "features": [$featureList]
            }
        """.trimIndent()
    }

    private fun applyData(beatGeoJson: String, compartmentGeoJson: String) {
        beatGeoJsonString = beatGeoJson
        compartmentGeoJsonString = compartmentGeoJson
        parseBeats(beatGeoJson)
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

    fun findIncidentById(id: String): SightingPointModel? {
        return incidentsList.find { it.id == id }
    }
}
