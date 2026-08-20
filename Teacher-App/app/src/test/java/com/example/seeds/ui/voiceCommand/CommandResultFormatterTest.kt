package com.example.seeds.ui.voiceCommand

import com.example.seeds.network.CommandResult
import com.example.seeds.network.VoiceCommand
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// Guards the ported parse logic against web (commandResultFormatter.js) drift — the bug-prone bit.
class CommandResultFormatterTest {

    // --- formatResult ---

    @Test
    fun `classroom list summarises names`() {
        val cmd = VoiceCommand("GET", "/class")
        val res = CommandResult("step0", 200, listOf(mapOf("name" to "A"), mapOf("name" to "B")))
        val f = formatResult(cmd, res)
        assertEquals("Classrooms", f.title)
        assertEquals("Found 2 classrooms", f.summary)
        assertEquals(listOf("A", "B"), f.items)
        assertTrue(f.isSuccess)
    }

    @Test
    fun `singular count drops the s`() {
        val cmd = VoiceCommand("GET", "/class")
        val res = CommandResult("step0", 200, listOf(mapOf("name" to "Solo")))
        assertEquals("Found 1 classroom", formatResult(cmd, res).summary)
    }

    @Test
    fun `error result surfaces message and is not success`() {
        val cmd = VoiceCommand("GET", "/class", description = "List classes")
        val res = CommandResult("step0", 500, error = "boom")
        val f = formatResult(cmd, res)
        assertEquals("boom", f.summary)
        assertTrue(!f.isSuccess)
    }

    @Test
    fun `students fall back to phone when no name`() {
        val cmd = VoiceCommand("GET", "/teacher/students")
        val res = CommandResult("step0", 200, listOf(mapOf("phoneNumber" to "919876543210")))
        assertEquals(listOf("919876543210"), formatResult(cmd, res).items)
    }

    // --- getNavigationTarget ---

    @Test
    fun `class list yields a nav target`() {
        val cmds = listOf(VoiceCommand("GET", "/class"))
        val res = listOf(CommandResult("step0", 200, emptyList<Any>()))
        val target = getNavigationTarget(cmds, res)
        assertEquals("Go to Classrooms", target?.label)
    }

    @Test
    fun `pure read of teacher profile yields no nav target`() {
        val cmds = listOf(VoiceCommand("GET", "/teacher/me"))
        val res = listOf(CommandResult("step0", 200, mapOf("name" to "T")))
        assertNull(getNavigationTarget(cmds, res))
    }

    @Test
    fun `new classroom offers go-to with destination`() {
        val cmds = listOf(VoiceCommand("POST", "/class"))
        val res = listOf(CommandResult("step0", 201, mapOf("_id" to "c1", "name" to "Math")))
        val target = getNavigationTarget(cmds, res)
        assertEquals("Go to Math", target?.label)
        assertTrue(target?.destinationId != null)
    }

    @Test
    fun `play content deep-links to the player carrying a Content arg`() {
        val cmds = listOf(VoiceCommand("GET", "/content/?expName=abc"))
        val data = mapOf(
            "_id" to "x1", "type" to "song", "language" to "en",
            "title" to mapOf("english" to "ABC Song", "audioUrl" to "http://a/title.mp3"),
            "audioContent" to listOf(mapOf("description" to "d", "audioUrl" to "http://a/y.mp3"))
        )
        val target = getNavigationTarget(cmds, listOf(CommandResult("step0", 200, data)))
        assertEquals("Play: ABC Song", target?.label)
        assertEquals(com.example.seeds.R.id.contentDetailsFragment, target?.destinationId)
        assertTrue(target?.autoNavigate == true)
        assertEquals("content", target?.navArgKey)
        val content = target?.navArg as? com.example.seeds.model.Content
        assertEquals("x1", content?._id)
        assertEquals("http://a/y.mp3", content?.audioContent?.firstOrNull()?.audioUrl)
    }

    @Test
    fun `buildContent falls back for missing optional fields but needs an id`() {
        assertNull(buildContent(mapOf("type" to "song")))
        val c = buildContent(mapOf("_id" to "z9"))
        assertEquals("z9", c?._id)
        assertEquals("en", c?.language)
        assertTrue(c?.audioContent?.isEmpty() == true)
    }
}
