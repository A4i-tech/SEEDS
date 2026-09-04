package com.example.seeds.network

import com.example.seeds.ApplicationJsonAdapterFactory
import com.squareup.moshi.Moshi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class VoiceCommandDtoTest {

    private val moshi = Moshi.Builder()
        .add(ApplicationJsonAdapterFactory)
        .build()

    @Test
    fun `VoiceCommandResponse full response round-trip`() {
        val json = """
            {
              "transcript": "show me all my students",
              "reasoning": {
                "intent": "list students",
                "reasoning": "teacher wants to see student list",
                "can_auto_resolve": true,
                "unresolved_note": null
              },
              "commands": [
                { "method": "GET", "path": "/class/", "body": null, "description": "Fetch all classrooms" }
              ],
              "results": [
                { "step": "Fetch all classrooms", "status": 200, "data": { "id": "abc" } }
              ],
              "spoken_summary": "You have 2 classrooms.",
              "audio_base64": "SGVsbG8="
            }
        """.trimIndent()

        val adapter = moshi.adapter(VoiceCommandResponse::class.java)
        val result = adapter.fromJson(json)

        assertNotNull(result)
        assertEquals("show me all my students", result!!.transcript)
        assertEquals(true, result.reasoning?.can_auto_resolve)
        assertEquals(1, result.commands.size)
        assertEquals("GET", result.commands[0].method)
        assertEquals(1, result.results.size)
        assertEquals(200, result.results[0].status)
        assertEquals("You have 2 classrooms.", result.spoken_summary)
        assertEquals("SGVsbG8=", result.audio_base64)
    }

    @Test
    fun `VoiceCommandResponse missing optional fields does not throw`() {
        val json = """
            {
              "transcript": "what can you do",
              "reasoning": { "can_auto_resolve": false, "unresolved_note": "Here is what I can help with" },
              "commands": [],
              "results": [],
              "spoken_summary": "Here is what I can help with"
            }
        """.trimIndent()

        val adapter = moshi.adapter(VoiceCommandResponse::class.java)
        val result = adapter.fromJson(json)

        assertNotNull(result)
        assertEquals("", result!!.audio_base64)
        assertEquals(false, result.reasoning?.can_auto_resolve)
        assertEquals(0, result.commands.size)
    }

    @Test
    fun `CommandResult with error field round-trip`() {
        val json = """{"step": "Delete classroom", "status": 404, "error": "Not found"}"""
        val adapter = moshi.adapter(CommandResult::class.java)
        val result = adapter.fromJson(json)

        assertNotNull(result)
        assertEquals(404, result!!.status)
        assertEquals("Not found", result.error)
        assertNull(result.data)
    }

    @Test
    fun `CommandResult missing error field does not throw`() {
        val json = """{"step": "Fetch all classrooms", "status": 200, "data": {"id": "abc"}}"""
        val adapter = moshi.adapter(CommandResult::class.java)
        val result = adapter.fromJson(json)

        assertNotNull(result)
        assertEquals("", result!!.error)
    }

    @Test
    fun `TextCommandRequest round-trip`() {
        val json = """
            {
              "command": "Get all my classrooms",
              "context": {
                "active_conference_id": null,
                "current_class_id": null,
                "history": []
              }
            }
        """.trimIndent()

        val adapter = moshi.adapter(TextCommandRequest::class.java)
        val result = adapter.fromJson(json)

        assertNotNull(result)
        assertEquals("Get all my classrooms", result!!.command)
        assertEquals("", result.context.active_conference_id)
        assertEquals(0, result.context.history.size)
    }

    @Test
    fun `TtsPromptResponse round-trip`() {
        val json = """{"text": "Let me think about that.", "audio_base64": "SGVsbG8="}"""
        val adapter = moshi.adapter(TtsPromptResponse::class.java)
        val result = adapter.fromJson(json)

        assertNotNull(result)
        assertEquals("Let me think about that.", result!!.text)
        assertEquals("SGVsbG8=", result.audio_base64)
    }

    @Test
    fun `TtsPromptResponse null audio_base64 does not throw`() {
        val json = """{"text": "Let me think.", "audio_base64": null}"""
        val adapter = moshi.adapter(TtsPromptResponse::class.java)
        val result = adapter.fromJson(json)

        assertNotNull(result)
        assertEquals("", result!!.audio_base64)
    }

    @Test
    fun `VoiceCommandContext with history round-trip`() {
        val json = """
            {
              "active_conference_id": "conf_abc123",
              "current_class_id": "68abc",
              "history": [
                { "transcript": "show my classrooms", "spoken_summary": "You have 3 classrooms." }
              ]
            }
        """.trimIndent()

        val adapter = moshi.adapter(VoiceCommandContext::class.java)
        val result = adapter.fromJson(json)

        assertNotNull(result)
        assertEquals("conf_abc123", result!!.active_conference_id)
        assertEquals(1, result.history.size)
        assertEquals("show my classrooms", result.history[0].transcript)
    }
}
