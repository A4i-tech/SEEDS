package com.example.seeds.database
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "log")
class LogEntity(
    @PrimaryKey
    val id: String,
    val logText: String,
    val time: String,
    val user: String,
    val priority: Int
)