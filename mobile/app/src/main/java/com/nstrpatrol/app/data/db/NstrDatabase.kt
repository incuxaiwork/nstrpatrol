package com.nstrpatrol.app.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        PatrolPointEntity::class,
        SensorReadingEntity::class,
        DailyActivityEntity::class,
        PatrolSessionEntity::class,
        IncidentEntity::class
    ],
    version = 4,
    exportSchema = false
)
abstract class NstrDatabase : RoomDatabase() {

    abstract fun telemetryDao(): TelemetryDao

    companion object {
        private const val NAME = "nstr_patrol.db"

        @Volatile
        private var instance: NstrDatabase? = null

        fun getInstance(context: Context): NstrDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    NstrDatabase::class.java,
                    NAME
                )
                    .fallbackToDestructiveMigration()
                    .build()
                    .also { instance = it }
            }
    }
}
