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
        ActivitySegmentEntity::class,
        CoverageEventEntity::class,
        IntegrityLogEntity::class
    ],
    version = 10,
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

        private val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS activity_segments (
                        id TEXT NOT NULL PRIMARY KEY,
                        patrolId TEXT NOT NULL,
                        mode TEXT NOT NULL,
                        startTime INTEGER NOT NULL,
                        endTime INTEGER NOT NULL,
                        confidence REAL,
                        syncStatus TEXT NOT NULL DEFAULT 'PENDING'
                    )
                """.trimIndent())
                db.execSQL("CREATE INDEX IF NOT EXISTS index_activity_segments_patrolId_startTime ON activity_segments (patrolId, startTime)")
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS coverage_events (
                        id TEXT NOT NULL PRIMARY KEY,
                        patrolId TEXT NOT NULL,
                        type TEXT NOT NULL,
                        latitude REAL,
                        longitude REAL,
                        timestamp INTEGER NOT NULL,
                        syncStatus TEXT NOT NULL DEFAULT 'PENDING'
                    )
                """.trimIndent())
                db.execSQL("CREATE INDEX IF NOT EXISTS index_coverage_events_patrolId_timestamp ON coverage_events (patrolId, timestamp)")
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS integrity_logs (
                        id TEXT NOT NULL PRIMARY KEY,
                        patrolId TEXT NOT NULL,
                        timestamp INTEGER NOT NULL,
                        gnssTimeAvailable INTEGER NOT NULL,
                        divergenceSeconds INTEGER NOT NULL,
                        autoTimeEnabled INTEGER NOT NULL,
                        tamperDetected INTEGER NOT NULL,
                        satellites INTEGER NOT NULL,
                        syncStatus TEXT NOT NULL DEFAULT 'PENDING'
                    )
                """.trimIndent())
                db.execSQL("CREATE INDEX IF NOT EXISTS index_integrity_logs_patrolId_timestamp ON integrity_logs (patrolId, timestamp)")
            }
        }

        private val MIGRATION_7_8 = object : Migration(7, 8) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE patrol_sessions RENAME TO patrol_sessions_old")
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS patrol_sessions (
                        patrolId TEXT NOT NULL PRIMARY KEY,
                        startTime INTEGER NOT NULL,
                        endTime INTEGER,
                        status TEXT NOT NULL,
                        patrolType TEXT,
                        patrolMethod TEXT,
                        beat TEXT,
                        detectedMethod TEXT,
                        armedStatus TEXT,
                        totalDistanceMeters REAL NOT NULL,
                        totalSteps INTEGER NOT NULL,
                        moveMinutes INTEGER NOT NULL,
                        caloriesEstimate REAL NOT NULL,
                        heartPointsEstimate REAL NOT NULL,
                        avgSpeedKmh REAL NOT NULL,
                        pointCount INTEGER NOT NULL,
                        syncStatus TEXT NOT NULL
                    )
                """.trimIndent())
                db.execSQL("""
                    INSERT INTO patrol_sessions (patrolId, startTime, endTime, status, patrolType, patrolMethod, beat, detectedMethod, armedStatus, totalDistanceMeters, totalSteps, moveMinutes, caloriesEstimate, heartPointsEstimate, avgSpeedKmh, pointCount, syncStatus)
                    SELECT patrolId, startTime, endTime, status, patrolType, patrolMethod, beat, detectedMethod, armedStatus, totalDistanceMeters, totalSteps, moveMinutes, caloriesEstimate, heartPointsEstimate, avgSpeedKmh, pointCount, syncStatus FROM patrol_sessions_old
                """.trimIndent())
                db.execSQL("DROP TABLE patrol_sessions_old")
            }
        }

        private val MIGRATION_8_9 = object : Migration(8, 9) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE patrol_sessions ADD COLUMN faceVerified INTEGER NOT NULL DEFAULT 0")
            }
        }

        private val MIGRATION_9_10 = object : Migration(9, 10) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE patrol_sessions ADD COLUMN serverUpdatedAt INTEGER NOT NULL DEFAULT 0")
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
                    .addMigrations(MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7, MIGRATION_7_8, MIGRATION_8_9, MIGRATION_9_10)
                    .fallbackToDestructiveMigration()
                    .build()
                    .also { instance = it }
            }
    }
}
