package com.example.seeds.network

import se.ansman.kotshi.JsonSerializable

@JsonSerializable
data class TtsPromptRequest(
    val type: String
)
