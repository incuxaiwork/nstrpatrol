package com.nstrpatrol.app.data

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Formats timestamps in Indian Standard Time (Asia/Kolkata, UTC+05:30).
 *
 * Patrol data is captured on devices as absolute epoch millis and stored
 * server-side in UTC, so any card, list or report that shows a patrol/incident
 * time renders the same wall-clock time on every device regardless of the
 * device's own timezone setting.
 */
object IndiaTime {

    private val IST = TimeZone.getTimeZone("Asia/Kolkata")

    fun format(pattern: String, millis: Long): String =
        SimpleDateFormat(pattern, Locale.US).apply { timeZone = IST }.format(Date(millis))

    /** "dd MMM, HH:mm" — compact card/list timestamp. */
    fun card(millis: Long): String = format("dd MMM, HH:mm", millis)

    /** "dd MMM yyyy, HH:mm" — report/detail timestamp. */
    fun full(millis: Long): String = format("dd MMM yyyy, HH:mm", millis)

    /** "dd MMM yyyy · hh:mm a" — form panel timestamp. */
    fun panel(millis: Long): String = format("dd MMM yyyy · hh:mm a", millis)

    /** "HH:mm:ss" — movement-segment clock. */
    fun clock(millis: Long): String = format("HH:mm:ss", millis)
}