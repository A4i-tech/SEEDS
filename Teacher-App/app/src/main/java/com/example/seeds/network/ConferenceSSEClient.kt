package com.example.seeds.network

import android.util.Log
import com.launchdarkly.eventsource.EventHandler
import com.launchdarkly.eventsource.EventSource
import com.launchdarkly.eventsource.MessageEvent
import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.time.Duration

class ConferenceSSEClient {

    private val TAG = "CONF_SSE"
    private var eventSource: EventSource? = null

    fun connect(url: String, authToken: String, onMessage: (data: String) -> Unit) {
        disconnect()
        Log.i(TAG, ">>> Connecting to SSE: $url")

        val handler = object : EventHandler {
            override fun onOpen() {
                Log.i(TAG, ">>> SSE OPEN: connection established to $url")
            }

            override fun onClosed() {
                Log.i(TAG, ">>> SSE CLOSED")
            }

            override fun onMessage(event: String, messageEvent: MessageEvent) {
                Log.d(TAG, ">>> SSE MESSAGE received")
                Log.d(TAG, ">>> SSE event name: '$event'")
                Log.d(TAG, ">>> SSE data: ${messageEvent.data}")
                onMessage(messageEvent.data)
            }

            override fun onError(t: Throwable) {
                Log.e(TAG, ">>> SSE ERROR: ${t.javaClass.simpleName}: ${t.message}", t)
            }

            override fun onComment(comment: String) {
                Log.v(TAG, ">>> SSE HEARTBEAT: $comment")
            }
        }

        val urlWithToken = "$url?token=${URLEncoder.encode(authToken, StandardCharsets.UTF_8)}"
        eventSource = EventSource.Builder(handler, URI.create(urlWithToken))
            .reconnectTime(Duration.ofSeconds(3))
            .build()

        eventSource?.start()
        Log.i(TAG, ">>> EventSource started")
    }

    fun disconnect() {
        if (eventSource != null) {
            Log.i(TAG, ">>> Disconnecting SSE")
            try {
                eventSource?.close()
            } catch (e: Exception) {
                Log.w(TAG, ">>> SSE close error: ${e.message}")
            }
            eventSource = null
        }
    }
}
