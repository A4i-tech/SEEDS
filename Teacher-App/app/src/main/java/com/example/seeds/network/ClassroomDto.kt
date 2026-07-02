package com.example.seeds.network

import android.content.Context
import com.example.seeds.model.Classroom
import com.example.seeds.model.Student
import com.squareup.moshi.FromJson
import com.squareup.moshi.JsonReader
import com.squareup.moshi.JsonWriter
import com.squareup.moshi.ToJson

data class ClassroomDto(
    var id: String? = null,
    var name: String,
    var teacher: String,
    var students: List<String>,
    var leaders: List<String>,
    var contentIds: List<String>? = null,
) {
    companion object {
        @FromJson
        fun fromJson(reader: JsonReader): ClassroomDto {
            var id: String? = null
            var name = ""
            var teacher = ""
            val students = mutableListOf<String>()
            val leaders = mutableListOf<String>()
            var contentIds: List<String>? = null

            reader.beginObject()
            while (reader.hasNext()) {
                when (reader.nextName()) {
                    "id" -> id = reader.nextString()
                    "name" -> name = reader.nextString()
                    "teacher" -> teacher = reader.nextString()
                    "students" -> readFlexibleIds(reader, students)
                    "leaders" -> readFlexibleIds(reader, leaders)
                    "contentIds" -> contentIds = mutableListOf<String>().also { list ->
                        reader.beginArray()
                        while (reader.hasNext()) list.add(reader.nextString())
                        reader.endArray()
                    }
                    else -> reader.skipValue()
                }
            }
            reader.endObject()
            return ClassroomDto(id = id, name = name, teacher = teacher,
                students = students, leaders = leaders, contentIds = contentIds)
        }

        private fun readFlexibleIds(reader: JsonReader, out: MutableList<String>) {
            reader.beginArray()
            while (reader.hasNext()) {
                when (reader.peek()) {
                    JsonReader.Token.STRING -> out.add(reader.nextString())
                    JsonReader.Token.BEGIN_OBJECT -> {
                        reader.beginObject()
                        var sid: String? = null
                        while (reader.hasNext()) {
                            if (reader.nextName() == "id") sid = reader.nextString() else reader.skipValue()
                        }
                        reader.endObject()
                        sid?.let { out.add(it) }
                    }
                    else -> reader.skipValue()
                }
            }
            reader.endArray()
        }

        @ToJson
        fun toJson(writer: JsonWriter, value: ClassroomDto) {
            writer.beginObject()
            writer.name("id").value(value.id)
            writer.name("name").value(value.name)
            writer.name("teacher").value(value.teacher)
            writer.name("students").beginArray(); value.students.forEach { writer.value(it) }; writer.endArray()
            writer.name("leaders").beginArray(); value.leaders.forEach { writer.value(it) }; writer.endArray()
            value.contentIds?.let { ids ->
                writer.name("contentIds").beginArray(); ids.forEach { writer.value(it) }; writer.endArray()
            }
            writer.endObject()
        }
    }
}

/** Separate DTO used when saving (POST /class) — sends student ObjectIds as plain strings */
data class ClassroomSaveDto(
    var _id: String? = null,
    var name: String,
    var teacher: String,
    var students: List<String>,
    var leaders: List<String>,
    var contentIds: List<String>? = null,
)

fun ClassroomDto.asDomainModel(context: Context): Classroom {
    val prefs = context.getSharedPreferences("sharedPref", Context.MODE_PRIVATE)
    val teacherId = prefs.getString("teacher_id", "") ?: ""
    return Classroom(
        id,
        name,
        teacherId,
        students.map { Student(phoneNumber = "", name = "", _id = it) },
        leaders.map { Student(phoneNumber = "", name = "", _id = it) },
        contentIds ?: emptyList()
    )
}

fun List<ClassroomDto>.asDomainModel(context: Context): List<Classroom> = map { it.asDomainModel(context) }
