package com.nstrpatrol.app.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        PatrolPointEntity::class,
        SensorReadingEntity::class,
        DailyActivityEntity::class,
        PatrolSessionEntity::class,
        IncidentEntity::class,
        MovementModeReadingEntity::class
    ],
    version = 6,
    exportSchema = false
)
abstract class NstrDatabase : RoomDatabase() {

    abstract fun telemetryDao(): TelemetryDao

    companion object {
        private const val NAME = "nstr_patrol.db"

        private val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE patrol_sessions ADD COLUMN detectedMethod TEXT")
            }
        }

        private val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS movement_mode_readings (
                        id TEXT NOT NULL PRIMARY KEY,
                        patrolId TEXT NOT NULL,
                        timestamp INTEGER NOT NULL,
                        mode TEXT NOT NULL,
                        confidence REAL,
                        speedKmh REAL
                    )
                """.trimIndent())
                db.execSQL("CREATE INDEX IF NOT EXISTS index_movement_mode_readings_patrolId_timestamp ON movement_mode_readings (patrolId, timestamp)")
            }
        }

        @Volatile
        private var instance: NstrDatabase? = null

        fun getInstance(context: Context): NstrDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    NstrDatabase::class.java,
                    NAME
                )
                    .addMigrations(MIGRATION_4_5, MIGRATION_5_6)
                    .fallbackToDestructiveMigration()
                    .build()
                    .also { instance = it }
            }
    }
}
