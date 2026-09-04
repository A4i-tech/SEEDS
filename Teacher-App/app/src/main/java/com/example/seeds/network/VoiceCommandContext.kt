package com.example.seeds.network

import se.ansman.kotshi.JsonSerializable

@JsonSerializable
data class VoiceHistoryItem(
    val transcript: String,
    val spoken_summary: String
)

@JsonSerializable
data class VoiceCommandContext(
    val active_conference_id: String = "",
    val current_class_id: String = "",
    val history: List<VoiceHistoryItem> = emptyList()
)
