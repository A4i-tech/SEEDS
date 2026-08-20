package com.example.seeds.network

import se.ansman.kotshi.JsonSerializable

@JsonSerializable
data class VoiceCommandReasoning(
    val intent: String? = null,
    val reasoning: String? = null,
    val canAutoResolve: Boolean = true,
    val unresolvedNote: String? = null
)

@JsonSerializable
data class VoiceCommand(
    val method: String,
    val path: String,
    val body: Any? = null,
    val description: String? = null
)

@JsonSerializable
data class VoiceCommandResponse(
    val transcript: String,
    val reasoning: VoiceCommandReasoning? = null,
    val commands: List<VoiceCommand> = emptyList(),
    val results: List<CommandResult> = emptyList(),
    val spokenSummary: String? = null,
    val audioBase64: String? = null
)
