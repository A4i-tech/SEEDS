package com.example.seeds.network

import se.ansman.kotshi.JsonSerializable

@JsonSerializable
data class VoiceHistoryItem(
    val transcript: String,
    val spokenSummary: String
)

@JsonSerializable
data class VoiceCommandContext(
    val activeConferenceId: String? = null,
    val currentClassId: String? = null,
    val history: List<VoiceHistoryItem> = emptyList()
)
