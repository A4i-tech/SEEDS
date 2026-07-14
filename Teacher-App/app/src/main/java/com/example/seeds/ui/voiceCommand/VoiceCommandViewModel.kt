package com.example.seeds.ui.voiceCommand

import androidx.lifecycle.ViewModel
import androidx.lifecycle.asLiveData
import androidx.lifecycle.viewModelScope
import com.example.seeds.audio.RecorderState
import com.example.seeds.audio.TtsPlayer
import com.example.seeds.audio.VoiceRecorderManager
import com.example.seeds.network.CommandResult
import com.example.seeds.network.VoiceCommand
import com.example.seeds.network.VoiceCommandContext
import com.example.seeds.network.VoiceCommandResponse
import com.example.seeds.network.VoiceHistoryItem
import com.example.seeds.repository.VoiceCommandRepository
import com.example.seeds.utils.VoiceCommandEvent
import com.example.seeds.utils.VoiceCommandEventBus
import com.example.seeds.utils.VoiceCommandSessionState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class VoiceStatus(val label: String) {
    IDLE(""),
    RECORDING("Listening..."),
    TRANSCRIBING("Transcribing audio..."),
    PLANNING("Seeds is thinking..."),
    EXECUTING("Executing..."),
    DONE("Done"),
    ERROR("Something went wrong")
}

data class VoiceCommandUiState(
    val status: VoiceStatus = VoiceStatus.IDLE,
    val transcript: String? = null,
    val spokenSummary: String? = null,
    val error: String? = null,
    val commands: List<VoiceCommand> = emptyList(),
    val results: List<CommandResult> = emptyList(),
    val formattedResults: List<FormattedResult> = emptyList(),
    val navigationTarget: NavigationTarget? = null,
    val audioBase64: String? = null,  // consumed by Phase 8 (TTS playback)
    val needsMicPermission: Boolean = false  // RECORD_AUDIO denied — show Settings deep-link
) {
    val isBusy: Boolean
        get() = status == VoiceStatus.TRANSCRIBING || status == VoiceStatus.PLANNING || status == VoiceStatus.EXECUTING
}

@HiltViewModel
class VoiceCommandViewModel @Inject constructor(
    private val repository: VoiceCommandRepository,
    private val recorder: VoiceRecorderManager,
    private val sessionState: VoiceCommandSessionState,
    private val eventBus: VoiceCommandEventBus,
    private val ttsPlayer: TtsPlayer
) : ViewModel() {

    // Plays the "thinking" prompt during PLANNING; cancelled/stopped once a result (or error) lands.
    private var thinkingJob: Job? = null

    private val _uiState = MutableStateFlow(VoiceCommandUiState())
    val uiState = _uiState.asStateFlow()
    val uiStateLiveData = _uiState.asLiveData()

    // Set by the caller (MainActivity) from the current nav destination. VM never touches NavController.
    private var currentClassId: String? = null

    // Last 2 conversation turns, sent back to the planner for reference resolution (web: historyRef, .slice(-2)).
    private val history = mutableListOf<VoiceHistoryItem>()

    init {
        // Bridge recorder state into the command flow: auto-stop/manual-stop delivers the file here.
        viewModelScope.launch {
            recorder.state.collect { state ->
                when (state) {
                    is RecorderState.Stopped -> onAudioReady(state.file)
                    is RecorderState.Error -> setError(state.reason)
                    else -> {}
                }
            }
        }
    }

    fun setContext(classId: String?) { currentClassId = classId }

    private fun buildContext() = VoiceCommandContext(
        activeConferenceId = sessionState.activeConferenceId.value,
        currentClassId = currentClassId,
        history = history.toList()
    )

    fun onStartRecording() {
        ttsPlayer.stop()  // silence any summary/welcome still playing before a new turn
        _uiState.value = VoiceCommandUiState(status = VoiceStatus.RECORDING)
        // start() no-ops unless the recorder is Idle; a prior command leaves it Stopped, so reset first.
        recorder.reset()
        recorder.start()
    }

    fun onStopRecording() = recorder.stop()

    private fun onAudioReady(file: java.io.File) {
        _uiState.value = _uiState.value.copy(status = VoiceStatus.TRANSCRIBING)
        viewModelScope.launch {
            runCommand { repository.sendVoiceCommand(file, buildContext()) }
        }
    }

    fun onSendText(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return
        _uiState.value = VoiceCommandUiState(status = VoiceStatus.PLANNING)
        viewModelScope.launch {
            runCommand(fallbackTranscript = trimmed) { repository.sendTextCommand(trimmed, buildContext()) }
        }
    }

    private suspend fun runCommand(fallbackTranscript: String? = null, call: suspend () -> VoiceCommandResponse) {
        _uiState.value = _uiState.value.copy(status = VoiceStatus.PLANNING)
        // Play the "thinking" prompt while the planner works (web plays it on the PLANNING transition).
        thinkingJob = viewModelScope.launch { ttsPlayer.playThinking() }
        try {
            var data = call()
            // requiresClientExecution is currently a no-op stub (see VoiceCommandRepository); keep the
            // EXECUTING transition so the state machine matches web and Phase 8 can slot real work in.
            data = data.copy(results = repository.executeClientCommands(data.results))
            applyResult(data, fallbackTranscript)
        } catch (e: Exception) {
            setError(e.message ?: "Request failed")
        }
    }

    private fun applyResult(data: VoiceCommandResponse, fallbackTranscript: String?) {
        // Result landed — kill the "thinking" audio before playing the spoken summary.
        thinkingJob?.cancel()
        ttsPlayer.stop()
        val transcript = data.transcript.ifEmpty { fallbackTranscript ?: "" }
        val navTarget = getNavigationTarget(data.commands, data.results)
        val formatted = data.commands.mapIndexed { i, cmd -> formatResult(cmd, data.results.getOrNull(i)) }
        val hasError = data.results.any { it.error != null }

        _uiState.value = VoiceCommandUiState(
            status = if (hasError) VoiceStatus.ERROR else VoiceStatus.DONE,
            transcript = transcript,
            spokenSummary = data.spokenSummary,
            error = data.results.firstNotNullOfOrNull { it.error },
            commands = data.commands,
            results = data.results,
            formattedResults = formatted,
            navigationTarget = navTarget,
            audioBase64 = data.audioBase64
        )

        if (!hasError) {
            data.audioBase64?.let { ttsPlayer.playBase64(it) }  // spoken summary (Phase 8 TTS)
            recordTurn(transcript, data.spokenSummary)
            storeConferenceId(data)
            dispatchMutationEvents(data)
        }
    }

    private fun recordTurn(transcript: String, spokenSummary: String?) {
        if (transcript.isEmpty()) return
        history.add(VoiceHistoryItem(transcript, spokenSummary ?: ""))
        while (history.size > 2) history.removeAt(0)
    }

    // Pull the conference id out of a conference/create success and persist it for later commands
    // ("end call", "mute all"). Mirrors web storeConferenceIdFromResults.
    private fun storeConferenceId(data: VoiceCommandResponse) {
        for (i in data.commands.indices) {
            val cmd = data.commands[i]
            val res = data.results.getOrNull(i)
            if (cmd.path.contains("/call/conference/create") && res != null && res.status < 300) {
                val id = (res.data as? Map<*, *>)?.get("id")?.toString()
                if (!id.isNullOrEmpty()) {
                    sessionState.activeConferenceId.value = id
                    eventBus.events.tryEmit(VoiceCommandEvent.ConferenceCreated(id))
                    return
                }
            }
        }
    }

    // Fire refresh events for the write ops web refreshes on (POST/PUT/PATCH/DELETE), routed to the
    // affected screen by path. Non-mutating commands emit nothing (no spurious refresh).
    private fun dispatchMutationEvents(data: VoiceCommandResponse) {
        val mutations = setOf("POST", "PUT", "PATCH", "DELETE")
        for (cmd in data.commands) {
            if (cmd.method.uppercase() !in mutations) continue
            val path = cmd.path
            when {
                path.contains("/call/conference/create") -> {} // handled in storeConferenceId
                path.contains("/teacher/students") || path.contains("/student") ->
                    eventBus.events.tryEmit(VoiceCommandEvent.StudentMutated)
                path.contains("/class") ->
                    eventBus.events.tryEmit(VoiceCommandEvent.ClassroomMutated)
                path.contains("/call") ->
                    eventBus.events.tryEmit(VoiceCommandEvent.CallMutated)
            }
        }
    }

    private fun setError(message: String) {
        thinkingJob?.cancel()
        ttsPlayer.stop()
        _uiState.value = _uiState.value.copy(status = VoiceStatus.ERROR, error = message)
    }

    // RECORD_AUDIO denied at the recording gesture — surface a clean error + Settings deep-link (Phase 7).
    fun onPermissionDenied() {
        _uiState.value = VoiceCommandUiState(
            status = VoiceStatus.ERROR,
            error = "Microphone permission is needed to record voice commands.",
            needsMicPermission = true
        )
    }

    fun onTryAgain() {
        recorder.reset()
        _uiState.value = VoiceCommandUiState(status = VoiceStatus.IDLE)
    }

    // Sheet dismissed: reset transient state and history (web reset()). SessionState/conference id persists.
    fun onDismiss() {
        thinkingJob?.cancel()
        ttsPlayer.stop()
        recorder.reset()
        history.clear()
        _uiState.value = VoiceCommandUiState()
    }
}
