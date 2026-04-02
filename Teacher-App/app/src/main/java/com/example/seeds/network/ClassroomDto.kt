package com.example.seeds.network

import android.content.Context
import com.example.seeds.model.Classroom
import com.example.seeds.model.Student
import com.squareup.moshi.JsonClass
import se.ansman.kotshi.JsonSerializable

@JsonSerializable
@JsonClass(generateAdapter = true)
data class StudentRefDto(
    var _id: String,
    var name: String,
    var phoneNumber: String,
)

data class ClassroomDto(
    var _id: String? = null,
    var name: String,
    var teacher: String,
    var students: List<StudentRefDto>,
    var leaders: List<StudentRefDto>,
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
    context: Context
): Classroom {
    val prefs = context.getSharedPreferences("sharedPref", Context.MODE_PRIVATE)
    val teacherId = prefs.getString("teacher_id", "") ?: ""

    return Classroom(
        _id,
        name,
        teacherId,
        students.map { Student(phoneNumber = it.phoneNumber, name = it.name, _id = it._id) },
        leaders.map { Student(phoneNumber = it.phoneNumber, name = it.name, _id = it._id) },
        contentIds ?: emptyList()
    )
}

fun List<ClassroomDto>.asDomainModel(
    context: Context
): List<Classroom> {
    return map { it.asDomainModel(context) }
}
