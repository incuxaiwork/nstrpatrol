package com.nstrpatrol.app.data

import java.io.File

/**
 * In-memory + on-disk store for captured photos before any DB exists.
 * Photos are saved into the app-internal captures dir and keyed by form slot
 * (e.g. "quick_capture", "patrol_start"). A photo for a slot is cleared when
 * the user captures a new one for the same slot.
 */
object PhotoStore {

    private val store = mutableMapOf<String, String>()
    private var root: File? = null

    fun init(capturesDir: File) {
        root = capturesDir
        if (!capturesDir.exists()) capturesDir.mkdirs()
        // Re-hydrate existing captures into the map keyed by filename (slot_epoch.jpg).
        capturesDir.listFiles()?.forEach { file ->
            val slot: String = file.name.substringBefore('_')
            if (slot.isNotEmpty()) {
                store[slot] = file.absolutePath
            }
        }
    }

    fun dir(): File {
        val tmp: String = System.getProperty("java.io.tmpdir") ?: "."
        return root ?: File(tmp)
    }

    fun put(slot: String, file: File) {
        store[slot] = file.absolutePath
    }

    fun path(slot: String): String? = store[slot]?.takeIf { File(it).exists() }

    fun has(slot: String): Boolean = path(slot) != null

    fun clear(slot: String) {
        store.remove(slot)?.let { File(it).delete() }
    }

    fun remove(slot: String) = clear(slot)
}
