package com.example.seeds.network

import android.content.Context
import com.example.seeds.model.Classroom
import com.example.seeds.utils.ContactUtils

data class ClassroomDto(
    var _id: String? = null,
    var name: String,
    var teacher: String,
    var students: List<String>,
    var leaders: List<String>,
    var contentIds: List<String>? = null,
)

// Helper function to normalize phone numbers
private fun normalizePhoneNumber(number: String): String {
    return when {   
        number.startsWith("91") -> number          // Already in correct format
        else -> "91$number"                     // Local number
    }
}

fun ClassroomDto.asDomainModel(context: Context, contactUtils: ContactUtils): Classroom {
    val prefs = context.getSharedPreferences("sharedPref", Context.MODE_PRIVATE)
    val teacherId = prefs.getString("teacher_id", "") ?: ""

    // Normalize students and leaders
    val normalizedStudents = students.map { normalizePhoneNumber(it) }
    val normalizedLeaders = leaders.map { normalizePhoneNumber(it) }

    return Classroom(
        _id ?: "",
        name,
        teacherId,
        contactUtils.getStudentsFromString(normalizedStudents),
        contactUtils.getStudentsFromString(normalizedLeaders),
        contentIds ?: emptyList()
    )
}

fun List<ClassroomDto>.asDomainModel(context: Context, contactUtils: ContactUtils): List<Classroom> {
    return map { it.asDomainModel(context, contactUtils) }
}
