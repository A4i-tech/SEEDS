package com.example.seeds.model

data class ConferenceCreateRequest(
    val teacher_phone: String,
    val student_phones: List<String>
)
