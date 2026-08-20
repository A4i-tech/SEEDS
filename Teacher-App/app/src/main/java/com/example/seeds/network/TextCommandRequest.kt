package com.example.seeds.network

import se.ansman.kotshi.JsonSerializable

@JsonSerializable
data class TextCommandRequest(
    val command: String,
    val context: VoiceCommandContext = VoiceCommandContext()
)
