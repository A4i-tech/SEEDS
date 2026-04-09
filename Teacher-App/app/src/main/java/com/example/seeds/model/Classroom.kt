package com.example.seeds.model

import android.os.Parcelable
import com.example.seeds.network.ClassroomSaveDto
import com.squareup.moshi.JsonClass
import kotlinx.parcelize.Parcelize
import se.ansman.kotshi.JsonSerializable

@Parcelize
@JsonSerializable
@JsonClass(generateAdapter = true)
data class Classroom(
    var _id: String? = null,
    var name: String,
    var teacher : String,
    var students: List<Student>,
    var leaders: List<Student>,
    var contentIds: List<String>,
    var contents: List<Content>? = null
    ): Parcelable{
    companion object {
        fun getNewClassroom(_id:String? = null,
                        name: String ="",
                        teacher : String="",   
                        students: List<Student> = listOf(),
                        leaders: List<Student> = listOf(),
                        contentIds: List<String> = listOf()): Classroom {
            return Classroom(
                _id = _id, 
                name=name ,
                teacher = teacher, 
                students = students, 
                leaders = leaders, 
                contentIds = contentIds)
        }
    }
}

fun Classroom.asDto(): ClassroomSaveDto {
    return ClassroomSaveDto(
        _id,
        name,
        teacher,
        students.map { requireNotNull(it._id) { "Student ${it.name} missing _id" } },
        leaders.map { requireNotNull(it._id) { "Leader ${it.name} missing _id" } },
        contentIds
    )
}
