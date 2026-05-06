package com.example.seeds.builders

import com.example.seeds.model.Classroom

object ClassroomTestBuilder {
    fun build(
        id: String = "cls-1",
        name: String = "Test Class",
        teacher: String = "teacher-1",
        students: List<com.example.seeds.model.Student> = emptyList(),
        leaders: List<com.example.seeds.model.Student> = emptyList(),
        contentIds: List<String> = emptyList()
    ) = Classroom.getNewClassroom(
        _id = id,
        name = name,
        teacher = teacher,
        students = students,
        leaders = leaders,
        contentIds = contentIds
    )
}
