package com.example.seeds.network

import se.ansman.kotshi.JsonSerializable

@JsonSerializable
data class TtsPromptResponse(
    val text: String? = null,
    val audioBase64: String? = null
)
