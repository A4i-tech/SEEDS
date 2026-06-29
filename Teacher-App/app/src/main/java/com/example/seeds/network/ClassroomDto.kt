package com.example.seeds.network

import android.content.Context
import com.example.seeds.model.Classroom
import com.example.seeds.model.Student
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import se.ansman.kotshi.JsonSerializable

@JsonSerializable
@JsonClass(generateAdapter = true)
data class StudentRefDto(
    val id: String,
    val name: String,
    @Json(name = "phone_number") val phoneNumber: String,
)

@JsonClass(generateAdapter = true)
data class ClassroomDto(
    val id: String? = null,
    val name: String,
    val teacher: String,
    val students: List<StudentRefDto>,
    val leaders: List<StudentRefDto>,
    @Json(name = "content_ids") val contentIds: List<String>? = null,
)

/** Separate DTO used when saving (POST /class) — sends student ObjectIds as plain strings */
@JsonClass(generateAdapter = true)
data class ClassroomSaveDto(
    val id: String? = null,
    val name: String,
    val teacher: String,
    val students: List<String>,
    val leaders: List<String>,
    @Json(name = "content_ids") val contentIds: List<String>? = null,
)

fun ClassroomDto.asDomainModel(
    context: Context
): Classroom {
    val prefs = context.getSharedPreferences("sharedPref", Context.MODE_PRIVATE)
    val teacherId = prefs.getString("teacher_id", "") ?: ""

    return Classroom(
        id,
        name,
        teacherId,
        students.map { Student(phoneNumber = it.phoneNumber, name = it.name, _id = it.id) },
        leaders.map { Student(phoneNumber = it.phoneNumber, name = it.name, _id = it.id) },
        contentIds ?: emptyList()
    )
}

fun List<ClassroomDto>.asDomainModel(
    context: Context
): List<Classroom> {
    return map { it.asDomainModel(context) }
}
