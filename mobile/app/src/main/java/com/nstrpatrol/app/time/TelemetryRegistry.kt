package com.nstrpatrol.app.time

/**
 * Process-wide coordination point for telemetry recording.
 *
 * [TelemetryRecorder] instances are created by the Activity layer, so an
 * Activity recreation (rotation, theme change, background kill of the UI)
 * used to abandon a still-sampling recorder whose coroutine scope kept
 * writing GPS points into an already-completed session ("ghost" points that
 * inflated distance/moving-minutes/steps in prod).
 *
 * The registry guarantees:
 *  - at most ONE recorder samples at any moment (a new registration cancels
 *    the previous instance's sampler),
 *  - a patrol id that has been finalized can never be recorded into again.
 */
object TelemetryRegistry {

    @Volatile
    private var current: TelemetryRecorder? = null

    /** Patrol ids whose sessions are COMPLETED locally — recording refused. */
    private val finalized = HashSet<String>()

    /** Called when a recorder begins sampling [pid]. Cancels any predecessor. */
    @Synchronized
    fun recorderStarted(pid: String, recorder: TelemetryRecorder): Boolean {
        if (pid in finalized) return false
        current?.takeIf { it !== recorder }?.cancelSampling()
        current = recorder
        return true
    }

    /** Called when a recorder stops sampling [pid]. */
    @Synchronized
    fun recorderStopped(pid: String?, recorder: TelemetryRecorder) {
        if (current === recorder) current = null
        if (pid != null) finalized.add(pid)
    }

    /** True once [pid] completed locally — no more points may be recorded into it. */
    @Synchronized
    fun isFinalized(pid: String): Boolean = pid in finalized

    /**
     * Marks [pid] as completed (called by the single completion writer right
     * after the Room status flip). Any straggler sampler for this patrol is
     * cancelled immediately and future recorders refuse the id.
     */
    @Synchronized
    fun markFinalized(pid: String) {
        finalized.add(pid)
        current?.takeIf { it.patrolId == pid }?.cancelSampling()
        // Keep the set bounded across a long-lived process.
        if (finalized.size > 64) {
            finalized.remove(finalized.iterator().next())
        }
    }
}
