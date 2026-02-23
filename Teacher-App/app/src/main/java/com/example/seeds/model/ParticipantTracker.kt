package com.example.seeds.model

/**
 * Tracks a participant's call state for the duration of the call.
 * Used to determine removed/disconnected participants and reconnect eligibility.
 */
data class ParticipantTracker(
    val phoneNumber: String,
    val currentState: CallerState,
    val previousState: CallerState?,
    val hasBeenInCall: Boolean
)
