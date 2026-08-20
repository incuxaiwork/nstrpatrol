package com.nstrpatrol.app.data

import java.io.File

/**
 * In-memory + on-disk store for captured photos before any DB exists.
 * Photos are saved into the app-internal captures dir and keyed by form slot
 * (e.g. "quick_capture", "patrol_start"). A slot can hold multiple photos;
 * setting a slot replaces its previous photos.
 */
object PhotoStore {

    private val store = mutableMapOf<String, MutableList<String>>()
    private var root: File? = null

    fun init(capturesDir: File) {
        root = capturesDir
        if (!capturesDir.exists()) capturesDir.mkdirs()
        // Re-hydrate existing captures into the map. Files are named "<slot>_<epoch>.jpg";
        // match the known slot prefixes (longest first) so multi-word slot names like
        // "human_impact" rehydrate into the right key.
        val slots = listOf(
            "animal_mortality", "human_impact", "patrol_start", "quick_capture", "water_source", "sighting"
        )
        capturesDir.listFiles()?.forEach { file ->
            val slot: String? = slots.firstOrNull { file.name.startsWith("${it}_") }
            if (slot != null) {
                store.getOrPut(slot) { mutableListOf() }.add(file.absolutePath)
            }
        }
    }

    fun dir(): File {
        val tmp: String = System.getProperty("java.io.tmpdir") ?: "."
        return root ?: File(tmp)
    }

    /** Replace all photos for [slot] with [files]. */
    fun set(slot: String, files: List<File>) {
        clear(slot)
        store[slot] = files.map { it.absolutePath }.toMutableList()
    }

    /** Append a single photo for [slot]. */
    fun add(slot: String, file: File) {
        store.getOrPut(slot) { mutableListOf() }.add(file.absolutePath)
    }

    fun paths(slot: String): List<String> =
        store[slot].orEmpty().filter { File(it).exists() }

    fun has(slot: String): Boolean = paths(slot).isNotEmpty()

    fun clear(slot: String) {
        store.remove(slot)?.forEach { File(it).delete() }
    }

    fun remove(slot: String) = clear(slot)

    /** Remove a single photo at [path] from [slot]; deletes the underlying file. */
    fun removePath(slot: String, path: String): Boolean {
        val list = store[slot] ?: return false
        if (list.remove(path)) {
            File(path).delete()
            return true
        }
        return false
    }
}
