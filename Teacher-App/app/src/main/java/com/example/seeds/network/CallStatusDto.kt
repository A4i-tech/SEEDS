package com.example.seeds.network

import com.example.seeds.model.AudioStatus
import com.example.seeds.model.CallStatus
import com.example.seeds.model.Student

data class CallStatusDto (
    val participants: List<StudentCallStatusDto>,
    val leaderPhoneNumber: String,
    val audio: AudioStatus
)

fun CallStatusDto.asDomainModel(studentsByPhone: Map<String, Student>): CallStatus {
    return CallStatus(
        participants = participants.asDomainModel(studentsByPhone),
        leaderPhoneNumber = leaderPhoneNumber,
        audio = audio
    )
}