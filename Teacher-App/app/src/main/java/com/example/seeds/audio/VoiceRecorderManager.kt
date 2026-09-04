package com.example.seeds.audio

import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.abs

sealed class RecorderState {
    object Idle : RecorderState()
    data class Recording(val startedAt: Long) : RecorderState()
    data class Stopped(val file: File) : RecorderState()
    data class Error(val reason: String) : RecorderState()
}

@Singleton
class VoiceRecorderManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "VoiceRecorderManager"
        private const val SILENCE_THRESHOLD = 500
        private const val SILENCE_WINDOW_MS = 2000L
        private const val SAMPLE_RATE = 44100
    }

    private val _state = MutableStateFlow<RecorderState>(RecorderState.Idle)
    val state: StateFlow<RecorderState> = _state.asStateFlow()

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var mediaRecorder: MediaRecorder? = null
    private var silenceJob: Job? = null
    private var outputFile: File? = null

    fun start() {
        if (_state.value !is RecorderState.Idle) return
        val file = File(context.cacheDir, "voice_cmd_${System.currentTimeMillis()}.m4a")
        outputFile = file

        val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }
        try {
            recorder.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setOutputFile(file.absolutePath)
                prepare()
                start()
            }
        } catch (e: Exception) {
            recorder.release()
            outputFile = null
            _state.value = RecorderState.Error(e.message ?: "Failed to start recorder")
            return
        }
        mediaRecorder = recorder
        _state.value = RecorderState.Recording(System.currentTimeMillis())
        startSilenceDetector()
    }

    fun stop() {
        silenceJob?.cancel()
        silenceJob = null
        val file = outputFile ?: return
        try {
            mediaRecorder?.apply { stop(); release() }
        } catch (e: RuntimeException) {
            // MediaRecorder.stop() throws if called before any data is written
            mediaRecorder?.release()
            mediaRecorder = null
            _state.value = RecorderState.Error("Recording too short")
            return
        }
        mediaRecorder = null
        _state.value = RecorderState.Stopped(file)
    }

    fun reset() {
        silenceJob?.cancel()
        silenceJob = null
        mediaRecorder?.apply { try { stop() } catch (_: Exception) {}; release() }
        mediaRecorder = null
        outputFile = null
        _state.value = RecorderState.Idle
    }

    private fun startSilenceDetector() {
        val minBuf = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        if (minBuf <= 0) return // device doesn't support this config

        val audioRecord = try {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                minBuf
            )
        } catch (e: SecurityException) {
            Log.w(TAG, "RECORD_AUDIO not granted, silence detection disabled", e)
            return
        }

        if (audioRecord.state != AudioRecord.STATE_INITIALIZED) {
            audioRecord.release()
            return
        }

        silenceJob = scope.launch {
            audioRecord.startRecording()
            val buf = ShortArray(minBuf / 2)
            var silenceStart = -1L
            try {
                while (isActive && _state.value is RecorderState.Recording) {
                    val read = audioRecord.read(buf, 0, buf.size)
                    if (read > 0) {
                        val maxAmp = (0 until read).maxOf { abs(buf[it].toInt()) }
                        val now = System.currentTimeMillis()
                        if (maxAmp < SILENCE_THRESHOLD) {
                            if (silenceStart < 0) silenceStart = now
                            else if (now - silenceStart >= SILENCE_WINDOW_MS) {
                                withContext(Dispatchers.Main) { stop() }
                                break
                            }
                        } else {
                            silenceStart = -1L
                        }
                    }
                }
            } finally {
                audioRecord.stop()
                audioRecord.release()
            }
        }
    }
}
