package com.example.seeds.network

import se.ansman.kotshi.JsonSerializable

@JsonSerializable
data class TtsPromptResponse(
    val text: String = "",
    val audio_base64: String = ""
)
