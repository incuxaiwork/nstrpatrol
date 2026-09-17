package com.nstrpatrol.app.data.map

import com.nstrpatrol.app.data.db.PatrolPointEntity
import org.json.JSONObject
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Data model for an inspected Grid Cell.
 */
data class GridCellInfo(
    val id: String,
    val col: Int,
    val row: Int,
    val minLon: Double,
    val minLat: Double,
    val maxLon: Double,
    val maxLat: Double,
    val centerLon: Double,
    val centerLat: Double,
    val areaKm2: Double,
    val isPatrolled: Boolean,
    val patrolPointsCount: Int
)

/**
 * Internal polygon model for spatial boundary intersection.
 */
private data class BeatPolygon(
    val minLon: Double,
    val minLat: Double,
    val maxLon: Double,
    val maxLat: Double,
    val ring: List<Pair<Double, Double>>
)

/**
 * Dynamic GIS Grid Engine for Markapur / NSTR Forest Division.
 * Generates square kilometer grid meshes clipped strictly to Forest Beat boundaries
 * and performs patrol intersection analytics.
 */
object ForestGridEngine {

    // Markapur Forest Beats Bounding Box
    private const val MIN_LON = 78.75
    private const val MAX_LON = 79.60
    private const val MIN_LAT = 15.55
    private const val MAX_LAT = 16.70
    private const val REF_LAT = 16.0

    @Volatile
    private var cachedBeatPolys: List<BeatPolygon>? = null

    /**
     * Initializes or loads beat polygon boundaries for spatial clipping.
     */
    fun initBeatsGeometry(geoJsonString: String) {
        if (cachedBeatPolys != null && cachedBeatPolys!!.isNotEmpty()) return
        if (geoJsonString.isEmpty()) return

        try {
            val list = mutableListOf<BeatPolygon>()
            val root = JSONObject(geoJsonString)
            val features = root.optJSONArray("features") ?: return

            for (i in 0 until features.length()) {
                val feat = features.getJSONObject(i)
                val geom = feat.optJSONObject("geometry") ?: continue
                val type = geom.optString("type", "")
                val coords = geom.optJSONArray("coordinates") ?: continue

                if (type == "Polygon") {
                    val ringArray = coords.optJSONArray(0) ?: continue
                    val ring = parseRing(ringArray)
                    if (ring.isNotEmpty()) {
                        list.add(createBeatPoly(ring))
                    }
                } else if (type == "MultiPolygon") {
                    for (j in 0 until coords.length()) {
                        val polyArray = coords.optJSONArray(j) ?: continue
                        val ringArray = polyArray.optJSONArray(0) ?: continue
                        val ring = parseRing(ringArray)
                        if (ring.isNotEmpty()) {
                            list.add(createBeatPoly(ring))
                        }
                    }
                }
            }
            cachedBeatPolys = list
        } catch (_: Exception) {}
    }

    private fun parseRing(ringArray: org.json.JSONArray): List<Pair<Double, Double>> {
        val ring = ArrayList<Pair<Double, Double>>(ringArray.length())
        for (k in 0 until ringArray.length()) {
            val pt = ringArray.optJSONArray(k) ?: continue
            ring.add(Pair(pt.optDouble(0), pt.optDouble(1)))
        }
        return ring
    }

    private fun createBeatPoly(ring: List<Pair<Double, Double>>): BeatPolygon {
        var minX = Double.MAX_VALUE
        var maxX = -Double.MAX_VALUE
        var minY = Double.MAX_VALUE
        var maxY = -Double.MAX_VALUE
        for (p in ring) {
            if (p.first < minX) minX = p.first
            if (p.first > maxX) maxX = p.first
            if (p.second < minY) minY = p.second
            if (p.second > maxY) maxY = p.second
        }
        return BeatPolygon(minX, minY, maxX, maxY, ring)
    }

    /**
     * Checks if a point lies inside a polygon using ray casting algorithm.
     */
    private fun isPointInPolygon(x: Double, y: Double, poly: List<Pair<Double, Double>>): Boolean {
        val n = poly.size
        var inside = false
        var p1 = poly[0]
        for (i in 1..n) {
            val p2 = poly[i % n]
            if (y > min(p1.second, p2.second)) {
                if (y <= max(p1.second, p2.second)) {
                    if (x <= max(p1.first, p2.first)) {
                        val xinters = if (p1.second != p2.second) {
                            (y - p1.second) * (p2.first - p1.first) / (p2.second - p1.second) + p1.first
                        } else p1.first
                        if (p1.first == p2.first || x <= xinters) {
                            inside = !inside
                        }
                    }
                }
            }
            p1 = p2
        }
        return inside
    }

    /**
     * Checks if a rectangular grid cell intersects the Forest Beats region.
     */
    fun isCellInsideBeats(minLon: Double, minLat: Double, maxLon: Double, maxLat: Double): Boolean {
        val polys = cachedBeatPolys
        if (polys.isNullOrEmpty()) return true // Fallback if beat polygons not yet initialized

        // Fast bounding-box candidate filter
        val candidates = polys.filter { p ->
            !(maxLon < p.minLon || minLon > p.maxLon || maxLat < p.minLat || minLat > p.maxLat)
        }
        if (candidates.isEmpty()) return false

        // Test center and 4 corners
        val testPoints = listOf(
            Pair((minLon + maxLon) / 2.0, (minLat + maxLat) / 2.0),
            Pair(minLon, minLat),
            Pair(maxLon, minLat),
            Pair(maxLon, maxLat),
            Pair(minLon, maxLat)
        )

        for (pt in testPoints) {
            for (p in candidates) {
                if (pt.first in p.minLon..p.maxLon && pt.second in p.minLat..p.maxLat) {
                    if (isPointInPolygon(pt.first, pt.second, p.ring)) {
                        return true
                    }
                }
            }
        }
        return false
    }

    /**
     * Converts an area in square kilometers to approximate degree steps (lonStep, latStep).
     */
    fun calculateStepDegrees(areaKm2: Double): Pair<Double, Double> {
        val sideKm = sqrt(areaKm2.coerceAtLeast(0.01))
        val latStep = sideKm / 111.0
        val lonStep = sideKm / (111.0 * cos(Math.toRadians(REF_LAT)))
        return Pair(lonStep, latStep)
    }

    /**
     * Generates a GeoJSON FeatureCollection containing only grid cells that fall
     * within the Forest Beats region.
     */
    fun generateAllGridsGeoJson(areaKm2: Double, beatGeoJson: String = ""): String {
        if (beatGeoJson.isNotEmpty()) {
            initBeatsGeometry(beatGeoJson)
        }
        val (lonStep, latStep) = calculateStepDegrees(areaKm2)
        val sb = StringBuilder()
        sb.append("{\"type\":\"FeatureCollection\",\"features\":[")

        var col = 0
        var isFirst = true

        var lon = MIN_LON
        while (lon < MAX_LON) {
            val nextLon = lon + lonStep
            var lat = MIN_LAT
            var row = 0

            while (lat < MAX_LAT) {
                val nextLat = lat + latStep
                val cellId = "G-${col + 1}-${row + 1}"

                // Clip: Only include grid cells inside the Forest Beats region
                if (isCellInsideBeats(lon, lat, nextLon, nextLat)) {
                    val cLon = (lon + nextLon) / 2.0
                    val cLat = (lat + nextLat) / 2.0

                    if (!isFirst) sb.append(",")
                    isFirst = false

                    // Polygon Feature
                    sb.append("{\"type\":\"Feature\",")
                    sb.append("\"properties\":{\"id\":\"$cellId\",\"col\":${col + 1},\"row\":${row + 1},\"centerLon\":$cLon,\"centerLat\":$cLat,\"area\":\"$areaKm2\"},")
                    sb.append("\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[")
                    sb.append("[$lon,$lat],[$nextLon,$lat],[$nextLon,$nextLat],[$lon,$nextLat],[$lon,$lat]")
                    sb.append("]]}}")
                }

                lat += latStep
                row++
            }
            lon += lonStep
            col++
        }

        sb.append("]}")
        return sb.toString()
    }

    /**
     * Generates a GeoJSON FeatureCollection containing only patrolled cells inside beats.
     */
    fun generatePatrolledGridsGeoJson(areaKm2: Double, points: List<PatrolPointEntity>, beatGeoJson: String = ""): String {
        if (points.isEmpty()) {
            return "{\"type\":\"FeatureCollection\",\"features\":[]}"
        }
        if (beatGeoJson.isNotEmpty()) {
            initBeatsGeometry(beatGeoJson)
        }

        val (lonStep, latStep) = calculateStepDegrees(areaKm2)
        val visitedCells = mutableMapOf<String, Int>()

        for (p in points) {
            if (p.longitude < MIN_LON || p.longitude > MAX_LON || p.latitude < MIN_LAT || p.latitude > MAX_LAT) {
                continue
            }
            val col = floor((p.longitude - MIN_LON) / lonStep).toInt()
            val row = floor((p.latitude - MIN_LAT) / latStep).toInt()
            val cellId = "G-${col + 1}-${row + 1}"
            visitedCells[cellId] = (visitedCells[cellId] ?: 0) + 1
        }

        val sb = StringBuilder()
        sb.append("{\"type\":\"FeatureCollection\",\"features\":[")
        var isFirst = true

        for ((cellId, count) in visitedCells) {
            val parts = cellId.split("-")
            if (parts.size != 3) continue
            val col = (parts[1].toIntOrNull() ?: 1) - 1
            val row = (parts[2].toIntOrNull() ?: 1) - 1

            val lon = MIN_LON + col * lonStep
            val nextLon = lon + lonStep
            val lat = MIN_LAT + row * latStep
            val nextLat = lat + latStep

            if (isCellInsideBeats(lon, lat, nextLon, nextLat)) {
                val cLon = (lon + nextLon) / 2.0
                val cLat = (lat + nextLat) / 2.0

                if (!isFirst) sb.append(",")
                isFirst = false

                sb.append("{\"type\":\"Feature\",")
                sb.append("\"properties\":{\"id\":\"$cellId\",\"col\":${col + 1},\"row\":${row + 1},\"centerLon\":$cLon,\"centerLat\":$cLat,\"points\":$count,\"area\":\"$areaKm2\"},")
                sb.append("\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[")
                sb.append("[$lon,$lat],[$nextLon,$lat],[$nextLon,$nextLat],[$lon,$nextLat],[$lon,$lat]")
                sb.append("]]}}")
            }
        }

        sb.append("]}")
        return sb.toString()
    }

    /**
     * Inspects a specific coordinate to return GridCellInfo if inside beats.
     */
    fun getCellAt(lon: Double, lat: Double, areaKm2: Double, points: List<PatrolPointEntity>): GridCellInfo? {
        if (lon < MIN_LON || lon > MAX_LON || lat < MIN_LAT || lat > MAX_LAT) return null
        val (lonStep, latStep) = calculateStepDegrees(areaKm2)
        val col = floor((lon - MIN_LON) / lonStep).toInt()
        val row = floor((lat - MIN_LAT) / latStep).toInt()

        val minCellLon = MIN_LON + col * lonStep
        val maxCellLon = minCellLon + lonStep
        val minCellLat = MIN_LAT + row * latStep
        val maxCellLat = minCellLat + latStep

        if (!isCellInsideBeats(minCellLon, minCellLat, maxCellLon, maxCellLat)) {
            return null
        }

        val cellId = "G-${col + 1}-${row + 1}"
        val pointsInCell = points.count { p ->
            p.longitude in minCellLon..maxCellLon && p.latitude in minCellLat..maxCellLat
        }

        return GridCellInfo(
            id = cellId,
            col = col + 1,
            row = row + 1,
            minLon = minCellLon,
            minLat = minCellLat,
            maxLon = maxCellLon,
            maxLat = maxCellLat,
            centerLon = (minCellLon + maxCellLon) / 2.0,
            centerLat = (minCellLat + maxCellLat) / 2.0,
            areaKm2 = areaKm2,
            isPatrolled = pointsInCell > 0,
            patrolPointsCount = pointsInCell
        )
    }

    /**
     * Generates a Point FeatureCollection GeoJSON representing the geometric centroid
     * of each Forest Beat for clean, perfectly centered label badges.
     */
    fun generateBeatCentroidsGeoJson(geoJsonString: String): String {
        if (geoJsonString.isBlank()) return "{\"type\":\"FeatureCollection\",\"features\":[]}"
        try {
            val root = JSONObject(geoJsonString)
            val features = root.optJSONArray("features") ?: return "{\"type\":\"FeatureCollection\",\"features\":[]}"
            val outFeatures = mutableListOf<String>()

            for (i in 0 until features.length()) {
                val feat = features.getJSONObject(i)
                val geom = feat.optJSONObject("geometry") ?: continue
                val props = feat.optJSONObject("properties") ?: JSONObject()
                val beatName = props.optString("Beat", props.optString("name", "")).trim()
                if (beatName.isEmpty()) continue

                val type = geom.optString("type")
                val coords = geom.optJSONArray("coordinates") ?: continue

                // Compute centroid of the largest outer ring
                var bestRing: List<Pair<Double, Double>>? = null
                var maxRingPts = 0

                if (type == "Polygon" && coords.length() > 0) {
                    val outer = coords.optJSONArray(0)
                    if (outer != null) {
                        val ring = parseRing(outer)
                        if (ring.size > maxRingPts) {
                            bestRing = ring
                            maxRingPts = ring.size
                        }
                    }
                } else if (type == "MultiPolygon") {
                    for (m in 0 until coords.length()) {
                        val poly = coords.optJSONArray(m) ?: continue
                        if (poly.length() > 0) {
                            val outer = poly.optJSONArray(0)
                            if (outer != null) {
                                val ring = parseRing(outer)
                                if (ring.size > maxRingPts) {
                                    bestRing = ring
                                    maxRingPts = ring.size
                                }
                            }
                        }
                    }
                }

                if (bestRing != null && bestRing.isNotEmpty()) {
                    var sumLon = 0.0
                    var sumLat = 0.0
                    var signedArea = 0.0
                    val n = bestRing.size
                    for (j in 0 until n - 1) {
                        val (x0, y0) = bestRing[j]
                        val (x1, y1) = bestRing[j + 1]
                        val a = (x0 * y1) - (x1 * y0)
                        signedArea += a
                        sumLon += (x0 + x1) * a
                        sumLat += (y0 + y1) * a
                    }

                    val (cLon, cLat) = if (Math.abs(signedArea) > 1e-7) {
                        val factor = 6.0 * (signedArea / 2.0)
                        Pair(sumLon / factor, sumLat / factor)
                    } else {
                        // Bounding box center fallback
                        var minX = Double.MAX_VALUE
                        var maxX = -Double.MAX_VALUE
                        var minY = Double.MAX_VALUE
                        var maxY = -Double.MAX_VALUE
                        for ((x, y) in bestRing) {
                            if (x < minX) minX = x
                            if (x > maxX) maxX = x
                            if (y < minY) minY = y
                            if (y > maxY) maxY = y
                        }
                        Pair((minX + maxX) / 2.0, (minY + maxY) / 2.0)
                    }

                    val safeProps = JSONObject().apply {
                        put("Beat", beatName)
                        put("id", props.optString("OBJECTID_1", "BEAT-$i"))
                    }
                    outFeatures.add("{\"type\":\"Feature\",\"geometry\":{\"type\":\"Point\",\"coordinates\":[$cLon,$cLat]},\"properties\":$safeProps}")
                }
            }

            return "{\"type\":\"FeatureCollection\",\"features\":[${outFeatures.joinToString(",")}]}"
        } catch (e: Exception) {
            return "{\"type\":\"FeatureCollection\",\"features\":[]}"
        }
    }
}
