package com.example.seeds.network

import se.ansman.kotshi.JsonSerializable

@JsonSerializable
data class VoiceCommandReasoning(
    val intent: String = "",
    val reasoning: String = "",
    val can_auto_resolve: Boolean = true,
    val unresolved_note: String = ""
)

@JsonSerializable
data class VoiceCommand(
    val method: String,
    val path: String,
    val body: Any? = null,
    val description: String = ""
)

@JsonSerializable
data class VoiceCommandResponse(
    val transcript: String,
    val reasoning: VoiceCommandReasoning? = null,
    val commands: List<VoiceCommand> = emptyList(),
    val results: List<CommandResult> = emptyList(),
    val spoken_summary: String = "",
    val audio_base64: String = ""
)
