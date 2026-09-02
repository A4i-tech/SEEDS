package com.example.seeds.network

import se.ansman.kotshi.JsonSerializable

@JsonSerializable
data class VoiceCommandReasoning(
    val intent: String = "",
    val reasoning: String = "",
    val canAutoResolve: Boolean = true,
    val unresolvedNote: String = ""
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
    val spokenSummary: String = "",
    val audioBase64: String = ""
)
