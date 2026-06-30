package com.example.seeds.model

data class ConferenceCreateRequest(
    val teacher_phone: String,
    val student_phones: List<String>,
    val teacher_name: String? = null,
    val student_names: List<String?>? = null
)
