package com.example.seeds.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.util.Base64
import android.util.Log
import com.example.seeds.repository.VoiceCommandRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import java.io.File

private const val TAG = "TtsPlayer"

// Phase 8: single owner of Seeds TTS playback (thinking / summary / welcome). Decodes a base64 mp3
// to a temp file and plays it via MediaPlayer. Requests transient audio focus (MAY_DUCK) so it does
// not clobber an active call's audio. Constructor-injected @Singleton — no Hilt module edit needed.
@Singleton
class TtsPlayer @Inject constructor(
    @ApplicationContext private val context: Context,
    private val repository: VoiceCommandRepository
) {
    private var player: MediaPlayer? = null
    private val audioManager by lazy { context.getSystemService(Context.AUDIO_SERVICE) as AudioManager }
    private var focusRequest: AudioFocusRequest? = null

    // The "thinking" prompt is identical every time — fetch once, reuse (web caches it in a ref).
    private var thinkingBase64: String? = null

    suspend fun playThinking() {
        val cached = thinkingBase64
        if (cached != null) {
            playBase64(cached)
            return
        }
        val fetched = repository.fetchTtsPrompt("thinking").audio_base64
        if (fetched.isEmpty()) return
        thinkingBase64 = fetched
        playBase64(fetched)
    }

    suspend fun playWelcome() {
        val b64 = repository.fetchTtsPrompt("welcome_android").audio_base64
        if (b64.isEmpty()) return
        playBase64(b64)
    }

    fun playBase64(base64: String) {
        stop()
        try {
            // Tolerate a "data:audio/mp3;base64," prefix; substringAfterLast returns the whole
            // string when no comma is present.
            val bytes = Base64.decode(base64.substringAfterLast(","), Base64.DEFAULT)
            val file = File(context.cacheDir, "seeds_tts.mp3").apply { writeBytes(bytes) }
            requestFocus()
            player = MediaPlayer().apply {
                setDataSource(file.absolutePath)
                setOnCompletionListener { this@TtsPlayer.stop() }
                setOnErrorListener { _, _, _ -> this@TtsPlayer.stop(); true }
                prepare()
                start()
            }
        } catch (e: Exception) {
            Log.e(TAG, "playBase64 failed", e)
            abandonFocus()
        }
    }

    fun stop() {
        player?.let {
            try { it.stop() } catch (e: Exception) { Log.w(TAG, "stop() on already-stopped player", e) }
            it.release()
        }
        player = null
        abandonFocus()
    }

    private fun requestFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                .build()
            focusRequest = req
            audioManager.requestAudioFocus(req)
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(
                null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
            )
        }
    }

    private fun abandonFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
            focusRequest = null
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(null)
        }
    }
}
