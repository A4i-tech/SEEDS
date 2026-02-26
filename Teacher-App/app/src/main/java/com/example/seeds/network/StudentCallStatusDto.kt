package com.example.seeds.network

import com.example.seeds.model.CallerState
import com.example.seeds.model.Student
import com.example.seeds.model.StudentCallStatus

data class StudentCallStatusDto (
    val status: String?,
    val isMuted: Boolean?,
    val onHold: Boolean?,
    val phoneNumber: String,
    val raiseHand: Boolean
)

fun List<StudentCallStatusDto>.asDomainModel(studentsByPhone: Map<String, Student>): List<StudentCallStatus> {

    return map {
        StudentCallStatus (
       when(it.status) {
                "started" -> CallerState.STARTED
                "ringing" -> CallerState.RINGING
                "answered" -> CallerState.ANSWERED
                "joined" -> CallerState.ANSWERED
                "unanswered" -> CallerState.UNANSWERED
                "busy" -> CallerState.BUSY
                "cancelled" -> CallerState.CANCELLED
                "completed" -> CallerState.COMPLETED
                "rejected" -> CallerState.REJECTED
                "failed" -> CallerState.FAILED
                "on_hold" -> CallerState.ON_HOLD
                else -> CallerState.UNDEFINED
            },
            it.isMuted?: true,
            it.onHold?: false,
            it.phoneNumber,
            studentsByPhone[it.phoneNumber]?.name ?: it.phoneNumber,
            it.raiseHand
        )
    }
}
