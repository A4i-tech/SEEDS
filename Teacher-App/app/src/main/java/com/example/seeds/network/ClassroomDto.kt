package com.example.seeds.network

import android.content.Context
import com.example.seeds.model.Classroom
import com.example.seeds.model.Student
import com.squareup.moshi.JsonClass
import se.ansman.kotshi.JsonSerializable

data class ClassroomDto(
    var _id: String? = null,
    var name: String,
    var teacher: String,
    var students: List<String>,
    var leaders: List<String>,
    var contentIds: List<String>? = null,
)

/** Separate DTO used when saving (POST /class) — sends student ObjectIds as plain strings */
data class ClassroomSaveDto(
    var _id: String? = null,
    var name: String,
    var teacher: String,
    var students: List<String>,
    var leaders: List<String>,
    var contentIds: List<String>? = null,
)

fun ClassroomDto.asDomainModel(
    context: Context,
    studentMap: Map<String, Student> = emptyMap(),
): Classroom {
    val prefs = context.getSharedPreferences("sharedPref", Context.MODE_PRIVATE)
    val teacherId = prefs.getString("teacher_id", "") ?: ""

    return Classroom(
        _id,
        name,
        teacherId,
        students.map { id -> studentMap[id] ?: Student(phoneNumber = "", name = "", _id = id) },
        leaders.map { id -> studentMap[id] ?: Student(phoneNumber = "", name = "", _id = id) },
        contentIds ?: emptyList()
    )
}

fun List<ClassroomDto>.asDomainModel(
    context: Context,
): List<Classroom> {
    return map { it.asDomainModel(context) }
}
