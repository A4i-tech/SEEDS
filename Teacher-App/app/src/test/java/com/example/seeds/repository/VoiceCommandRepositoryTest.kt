package com.example.seeds.repository

import com.example.seeds.network.CommandResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class VoiceCommandRepositoryTest {

    // --- resolveClientPlaceholders ---

    @Test
    fun `resolvePlaceholders replaces dot-path field`() {
        val ctx = mapOf("step0" to CommandResult("step0", 200, mapOf("id" to "abc123")))
        assertEquals("abc123", resolveClientPlaceholders("{{step0.data.id}}", ctx))
    }

    @Test
    fun `resolvePlaceholders replaces nested field`() {
        val ctx = mapOf("step0" to CommandResult("step0", 200, mapOf("user" to mapOf("name" to "Alice"))))
        assertEquals("Alice", resolveClientPlaceholders("{{step0.data.user.name}}", ctx))
    }

    @Test
    fun `resolvePlaceholders missing step returns empty string`() {
        assertEquals("", resolveClientPlaceholders("{{step0.data.id}}", emptyMap()))
    }

    @Test
    fun `resolvePlaceholders missing field returns empty string`() {
        val ctx = mapOf("step0" to CommandResult("step0", 200, mapOf("id" to "abc")))
        assertEquals("", resolveClientPlaceholders("{{step0.data.missing}}", ctx))
    }

    @Test
    fun `resolvePlaceholders resolves map values recursively`() {
        val ctx = mapOf("step0" to CommandResult("step0", 200, mapOf("phone" to "9876543210")))
        val input = mapOf("phoneNumber" to "{{step0.data.phone}}")
        val out = resolveClientPlaceholders(input, ctx) as? Map<*, *>
        assertEquals("9876543210", out?.get("phoneNumber"))
    }

    @Test
    fun `resolvePlaceholders passes through non-string non-map values`() {
        assertEquals(42, resolveClientPlaceholders(42, emptyMap()))
        assertNull(resolveClientPlaceholders(null, emptyMap()))
        assertEquals(true, resolveClientPlaceholders(true, emptyMap()))
    }

    @Test
    fun `resolvePlaceholders chained steps — step1 references step0 output`() {
        val ctx = mapOf(
            "step0" to CommandResult("step0", 200, mapOf("conferenceId" to "conf-99"))
        )
        val body = mapOf("id" to "{{step0.data.conferenceId}}", "action" to "mute")
        val out = resolveClientPlaceholders(body, ctx) as? Map<*, *>
        assertEquals("conf-99", out?.get("id"))
        assertEquals("mute", out?.get("action"))
    }

    // --- normalizePhoneNumber ---

    @Test
    fun `normalizePhoneNumber adds 91 to 10-digit number`() {
        assertEquals("919876543210", normalizePhoneNumber("9876543210"))
    }

    @Test
    fun `normalizePhoneNumber strips and re-adds 91 prefix`() {
        assertEquals("919876543210", normalizePhoneNumber("919876543210"))
    }

    @Test
    fun `normalizePhoneNumber strips non-digits`() {
        assertEquals("919876543210", normalizePhoneNumber("+91 98765-43210"))
    }

    @Test
    fun `normalizePhoneNumber leading zero — 11 digits gets 91 prefix as-is`() {
        // Web behavior: "09876543210" → cleaned = "09876543210" (11 digits, not 10) → "9109876543210"
        assertEquals("9109876543210", normalizePhoneNumber("09876543210"))
    }

    @Test
    fun `normalizePhoneNumber null returns empty`() {
        assertEquals("", normalizePhoneNumber(null))
    }

    @Test
    fun `normalizePhoneNumber empty returns empty`() {
        assertEquals("", normalizePhoneNumber(""))
    }

    @Test
    fun `normalizePhoneNumber no digits returns empty`() {
        assertEquals("", normalizePhoneNumber("---"))
    }
}
