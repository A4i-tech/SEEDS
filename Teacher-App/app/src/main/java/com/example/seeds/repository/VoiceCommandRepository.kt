package com.example.seeds.repository

import com.example.seeds.ApplicationJsonAdapterFactory
import com.example.seeds.network.CommandResult
import com.example.seeds.network.SeedsService
import com.example.seeds.network.TextCommandRequest
import com.example.seeds.network.TtsPromptRequest
import com.example.seeds.network.TtsPromptResponse
import com.example.seeds.network.VoiceCommandContext
import com.example.seeds.network.VoiceCommandResponse
import com.squareup.moshi.Moshi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import javax.inject.Inject

// ponytail: requiresClientExecution is absent from backend — executeClientCommands is a no-op stub

fun resolveClientPlaceholders(value: Any?, resultContext: Map<String, CommandResult>): Any? {
    return when (value) {
        is String -> value.replace(Regex("""\{\{step(\d+)\.data([^}]*)\}\}""")) { match ->
            val stepNum = match.groupValues[1]
            val fieldPath = match.groupValues[2]
            val stepData = resultContext["step$stepNum"]?.data ?: return@replace ""
            if (fieldPath.isEmpty()) return@replace stepData.toString()
            val parts = fieldPath.trimStart('.').split(".")
            var current: Any? = stepData
            for (part in parts) current = (current as? Map<*, *>)?.get(part)
            current?.toString() ?: ""
        }
        is Map<*, *> -> value.entries.associate { (k, v) ->
            k to resolveClientPlaceholders(v, resultContext)
        }
        else -> value
    }
}

fun normalizePhoneNumber(phoneNumber: String?): String {
    if (phoneNumber.isNullOrEmpty()) return ""
    val digitsOnly = phoneNumber.replace(Regex("\\D"), "")
    val cleaned = if (digitsOnly.startsWith("91")) digitsOnly.substring(2) else digitsOnly
    if (cleaned.length != 10) return if (cleaned.isNotEmpty()) "91$cleaned" else ""
    return "91$cleaned"
}

class VoiceCommandRepository @Inject constructor(
    private val network: SeedsService
) {
    private val moshi = Moshi.Builder().add(ApplicationJsonAdapterFactory).build()
    private val contextAdapter = moshi.adapter(VoiceCommandContext::class.java)

    suspend fun sendVoiceCommand(audioFile: File, context: VoiceCommandContext): VoiceCommandResponse {
        return withContext(Dispatchers.IO) {
            val audioPart = MultipartBody.Part.createFormData(
                "audio", audioFile.name,
                audioFile.readBytes().toRequestBody("audio/mp4".toMediaType())
            )
            val contextBody = contextAdapter.toJson(context).toRequestBody("application/json".toMediaType())
            network.sendVoiceCommand(audioPart, contextBody)
        }
    }

    suspend fun sendTextCommand(command: String, context: VoiceCommandContext): VoiceCommandResponse {
        return withContext(Dispatchers.IO) {
            network.sendTextCommand(TextCommandRequest(command, context))
        }
    }

    suspend fun fetchTtsPrompt(type: String): TtsPromptResponse {
        return withContext(Dispatchers.IO) {
            network.fetchTtsPrompt(TtsPromptRequest(type))
        }
    }

    // ponytail: requiresClientExecution not set by backend; returns results unchanged
    fun executeClientCommands(results: List<CommandResult>): List<CommandResult> = results
}
