package com.example.seeds.network

import se.ansman.kotshi.JsonSerializable

@JsonSerializable
data class CommandResult(
    val step: String,
    val status: Int,
    val data: Any? = null,
    val error: String = ""
)
