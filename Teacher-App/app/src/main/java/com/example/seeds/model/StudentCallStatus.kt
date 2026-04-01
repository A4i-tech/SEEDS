package com.example.seeds.model

import com.squareup.moshi.Json
import se.ansman.kotshi.JsonSerializable

enum class CallerState {
    STARTED, RINGING, ANSWERED, UNANSWERED, BUSY, CANCELLED, COMPLETED, REJECTED, FAILED, UNDEFINED, TIMEOUT,
    CONNECTING, CONNECTED, DISCONNECTED
}

@JsonSerializable // Tells Kotshi to process this class
data class StudentCallStatus (
    @Json(name = "call_status")
    val callerState: CallerState?,

    @Json(name = "muted")
    val isMuted: Boolean = false,

    val onHold: Boolean = false,
    val phoneNumber: String? = null,
    val name: String? = null,
    val raiseHand: Boolean = false,
    var isMuteUnmuteDone: Boolean = true
)

@JsonSerializable
data class CallerStateResponse(
    @Json(name = "is_running")
    val isRunning: Boolean,

    @Json(name = "participants")
    val participants: Map<String, StudentCallStatus>
)