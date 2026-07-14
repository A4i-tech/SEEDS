package com.example.seeds.utils

import kotlinx.coroutines.flow.MutableStateFlow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class VoiceCommandSessionState @Inject constructor() {
    val activeConferenceId = MutableStateFlow<String?>(null)
}
