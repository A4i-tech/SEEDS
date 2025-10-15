package com.example.seeds.network

import android.content.Context
import androidx.core.app.ActivityCompat
import com.example.seeds.model.CallerState
import com.example.seeds.model.Classroom
import com.example.seeds.model.Student
import com.example.seeds.model.StudentCallStatus
import com.example.seeds.utils.ContactUtils

data class ClassroomDto(
    var _id: String? = null,
    var name: String,
    var teacher: String,
    var students: List<String>,
    var leaders: List<String>,
    var contentIds: List<String>? = null,
)

fun ClassroomDto.asDomainModel(context: Context, contactUtils: ContactUtils): Classroom {
    val prefs = context.getSharedPreferences("sharedPref", Context.MODE_PRIVATE)
    val teacherId = prefs.getString("teacher_id", "") ?: ""

    return Classroom(
        _id ?: "",
        name,
        teacherId,
        contactUtils.getStudentsFromString(students ?: emptyList()),
        contactUtils.getStudentsFromString(leaders ?: emptyList()),
        contentIds ?: emptyList()
    )
}

fun List<ClassroomDto>.asDomainModel(context: Context, contactUtils: ContactUtils): List<Classroom> {
    return map {
        it.asDomainModel(context, contactUtils)
    }
}
