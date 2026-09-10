package com.example.seeds.utils

import kotlinx.coroutines.flow.MutableSharedFlow
import javax.inject.Inject
import javax.inject.Singleton

sealed class VoiceCommandEvent {
    object ClassroomMutated : VoiceCommandEvent()
    object StudentMutated : VoiceCommandEvent()
    data class ConferenceCreated(val conferenceId: String) : VoiceCommandEvent()
    object CallMutated : VoiceCommandEvent()
}

@Singleton
class VoiceCommandEventBus @Inject constructor() {
    // ponytail: extraBufferCapacity=64 prevents emit from suspending on slow collectors
    val events = MutableSharedFlow<VoiceCommandEvent>(extraBufferCapacity = 64)
}
