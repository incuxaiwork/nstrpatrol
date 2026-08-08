package com.nstrpatrol.app.data.map

import android.content.Context
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONObject

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

class ForestGisRepository(private val context: Context) {

    var beatGeoJsonString: String = ""
        private set

    var compartmentGeoJsonString: String = ""
        private set

    var incidentGeoJsonString: String = ""
        private set

    var isDataLoaded by mutableStateOf(false)
        private set

    val beatsList = mutableStateListOf<ForestBeatModel>()
    val incidentsList = mutableStateListOf<SightingPointModel>()

    init {
        loadGisData()
    }

    fun loadGisData() {
        if (isDataLoaded) return
        try {
            beatGeoJsonString = context.assets.open("mark_beat.json").bufferedReader().use { it.readText() }
            val root = JSONObject(beatGeoJsonString)
            val features = root.optJSONArray("features")
            if (features != null) {
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
            Log.d("ForestGisRepository", "Loaded ${beatsList.size} forest beats from mark_beat.json")
        } catch (e: Exception) {
            Log.e("ForestGisRepository", "Error reading mark_beat.json", e)
        }

        try {
            compartmentGeoJsonString = context.assets.open("mark_comp.json").bufferedReader().use { it.readText() }
            Log.d("ForestGisRepository", "Loaded mark_comp.json (${compartmentGeoJsonString.length} chars)")
        } catch (e: Exception) {
            Log.e("ForestGisRepository", "Error reading mark_comp.json", e)
        }

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

        isDataLoaded = true
    }

    fun findBeatByName(name: String): ForestBeatModel? {
        return beatsList.find { it.name.equals(name, ignoreCase = true) }
    }

    fun findIncidentById(id: String): SightingPointModel? {
        return incidentsList.find { it.id == id }
    }
}
