package com.nstrpatrol.app.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Lifecycle status of a reported incident. Mirrors the backend Incident.status
 * values; used for status chip styling in the reports UI.
 */
enum class IncidentStatus(val label: String) {
    SUBMITTED("Submitted"),
    VERIFIED("Verified"),
    RESOLVED("Resolved"),
    REJECTED("Rejected")
}

/**
 * A reported incident / observation captured in the field. Stored locally first
 * with syncStatus PENDING, then uploaded to /api/sync/upload (entity "incidents")
 * by [com.nstrpatrol.app.data.SyncManager]. Mirrors the backend Incident model.
 */
@Entity(tableName = "incidents")
data class IncidentEntity(
    @PrimaryKey val id: String,
    val patrolId: String? = null,
    val type: String,
    val title: String,
    val description: String? = null,
    val severity: String = "LOW",
    val detailsJson: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val accuracy: Float? = null,
    val photos: String? = null,
    val occurredAt: Long,
    val reportedAt: Long,
    val status: String = "SUBMITTED",
    val syncStatus: String = "PENDING"
)
