package com.example.seeds.network

import se.ansman.kotshi.JsonSerializable

@JsonSerializable
data class TtsPromptResponse(
    val text: String = "",
    val audioBase64: String = ""
)
