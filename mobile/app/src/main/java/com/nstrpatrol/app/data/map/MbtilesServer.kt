package com.nstrpatrol.app.data.map

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import java.io.BufferedOutputStream
import java.io.BufferedReader
import java.io.File
import java.io.FileOutputStream
import java.io.InputStreamReader
import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

/**
 * Embedded local HTTP tile server that serves raster tiles directly from the offline MBTiles database.
 * MapLibre consumes tile URL: http://127.0.0.1:8888/tiles/{z}/{x}/{y}.png
 */
class MbtilesServer(private val context: Context, private val port: Int = 8888) {

    private var serverSocket: ServerSocket? = null
    private var isRunning = false
    private var db: SQLiteDatabase? = null

    val tileUrlFormat: String get() = "http://127.0.0.1:$port/tiles/{z}/{x}/{y}.png"

    fun start() {
        if (isRunning) return
        try {
            val mbtilesFile = prepareMbtilesFile()
            if (mbtilesFile != null && mbtilesFile.exists()) {
                db = SQLiteDatabase.openDatabase(mbtilesFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
                Log.d("MbtilesServer", "Opened MBTiles database: ${mbtilesFile.absolutePath}")
            }

            serverSocket = ServerSocket(port)
            isRunning = true
            Log.d("MbtilesServer", "Local MBTiles tile server listening at http://127.0.0.1:$port/")

            thread(name = "MbtilesServerThread", isDaemon = true) {
                while (isRunning) {
                    try {
                        val client = serverSocket?.accept() ?: break
                        thread(isDaemon = true) {
                            handleClient(client)
                        }
                    } catch (e: Exception) {
                        if (!isRunning) break
                    }
                }
            }
        } catch (e: Exception) {
            Log.e("MbtilesServer", "Error starting MBTiles server", e)
        }
    }

    private fun handleClient(socket: Socket) {
        try {
            socket.use { s ->
                val reader = BufferedReader(InputStreamReader(s.getInputStream()))
                val line = reader.readLine() ?: return
                val parts = line.split(" ")
                if (parts.size < 2) return
                val path = parts[1]

                if (path.startsWith("/tiles/")) {
                    serveTile(path, s.getOutputStream())
                } else {
                    send404(s.getOutputStream())
                }
            }
        } catch (e: Exception) {
            // Socket connection closed
        }
    }

    private fun serveTile(path: String, outputStream: java.io.OutputStream) {
        val cleanPath = path.substringAfter("/tiles/").substringBefore(".png").substringBefore(".jpg")
        val segments = cleanPath.split("/")
        if (segments.size != 3) {
            send404(outputStream)
            return
        }

        val z = segments[0].toIntOrNull() ?: 0
        val x = segments[1].toIntOrNull() ?: 0
        val y = segments[2].toIntOrNull() ?: 0

        // Convert XYZ y to MBTiles TMS y
        val tmsY = (1 shl z) - 1 - y

        var tileData: ByteArray? = null
        val database = db
        if (database != null && database.isOpen) {
            try {
                val cursor = database.rawQuery(
                    "SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?",
                    arrayOf(z.toString(), x.toString(), tmsY.toString())
                )
                if (cursor.moveToFirst()) {
                    tileData = cursor.getBlob(0)
                }
                cursor.close()
            } catch (e: Exception) {
                Log.e("MbtilesServer", "Query error for z=$z, x=$x, y=$y", e)
            }
        }

        if (tileData != null && tileData.isNotEmpty()) {
            val bos = BufferedOutputStream(outputStream)
            val header = ("HTTP/1.1 200 OK\r\n" +
                    "Content-Type: image/png\r\n" +
                    "Content-Length: ${tileData.size}\r\n" +
                    "Access-Control-Allow-Origin: *\r\n" +
                    "Cache-Control: public, max-age=31536000\r\n\r\n").toByteArray()
            bos.write(header)
            bos.write(tileData)
            bos.flush()
        } else {
            send404(outputStream)
        }
    }

    private fun send404(outputStream: java.io.OutputStream) {
        val bos = BufferedOutputStream(outputStream)
        val response = ("HTTP/1.1 404 Not Found\r\n" +
                "Content-Length: 0\r\n\r\n").toByteArray()
        bos.write(response)
        bos.flush()
    }

    private fun prepareMbtilesFile(): File? {
        val file = File(context.filesDir, "NSTR.mbtiles")
        if (file.exists() && file.length() > 0) return file

        return try {
            context.assets.open("NSTR.mbtiles").use { input ->
                FileOutputStream(file).use { output ->
                    input.copyTo(output)
                }
            }
            Log.d("MbtilesServer", "Copied NSTR.mbtiles from assets to ${file.absolutePath}")
            file
        } catch (e: Exception) {
            Log.e("MbtilesServer", "Failed copying MBTiles from assets", e)
            null
        }
    }

    fun stop() {
        isRunning = false
        try {
            serverSocket?.close()
            db?.close()
        } catch (e: Exception) {
            // Ignore close exceptions
        }
    }
}
