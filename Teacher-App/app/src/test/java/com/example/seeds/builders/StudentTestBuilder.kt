package com.example.seeds.builders

import com.example.seeds.model.Student

object StudentTestBuilder {
    fun build(
        id: String = "stu-1",
        name: String = "Test Student",
        phoneNumber: String = "9999999999",
        isLeader: Boolean = false
    ) = Student(
        _id = id,
        name = name,
        phoneNumber = phoneNumber,
        isLeader = isLeader
    )
}
