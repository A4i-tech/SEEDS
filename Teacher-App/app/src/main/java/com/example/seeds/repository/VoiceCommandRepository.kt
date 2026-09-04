package com.example.seeds.repository

import com.example.seeds.ApplicationJsonAdapterFactory
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
}
