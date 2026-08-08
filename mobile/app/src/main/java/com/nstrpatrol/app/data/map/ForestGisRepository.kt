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

    var isDataLoaded by mutableStateOf(false)
        private set

    val beatsList = mutableStateListOf<ForestBeatModel>()

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
        isDataLoaded = true
    }

    fun findBeatByName(name: String): ForestBeatModel? {
        return beatsList.find { it.name.equals(name, ignoreCase = true) }
    }
}
