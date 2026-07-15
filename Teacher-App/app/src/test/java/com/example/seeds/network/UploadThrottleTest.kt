package com.example.seeds.network

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okio.Buffer
import okio.buffer
import okio.sink
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream

class UploadThrottleTest {

    private val payload = ByteArray(10_000) { it.toByte() }

    private fun body() =
        ThrottledRequestBody(payload.toRequestBody("application/octet-stream".toMediaType()))

    /** Writes through a real (non-Buffer) sink, returns elapsed ms and delivered bytes. */
    private fun writeThroughRealSink(): Pair<Long, Long> {
        val out = ByteArrayOutputStream()
        val sink = out.sink().buffer() // RealBufferedSink, NOT okio.Buffer -> pace path runs
        val start = System.nanoTime()
        body().writeTo(sink)
        sink.flush()
        val elapsedMs = (System.nanoTime() - start) / 1_000_000L
        return elapsedMs to out.size().toLong()
    }

    @Test
    fun `pacing a real sink takes ~size div rate and preserves all bytes`() {
        ThrottleConfig.uploadBytesPerSec = 5_000L // 10_000 bytes -> ~2000ms
        val (elapsedMs, delivered) = writeThroughRealSink()
        assertEquals("all bytes delivered", payload.size.toLong(), delivered)
        assertTrue("too fast ($elapsedMs ms)", elapsedMs >= 1_500L)
        assertTrue("too slow ($elapsedMs ms)", elapsedMs <= 4_000L)
    }

    @Test
    fun `disabled throttle writes a real sink immediately`() {
        ThrottleConfig.uploadBytesPerSec = 0L
        val (elapsedMs, delivered) = writeThroughRealSink()
        assertEquals(payload.size.toLong(), delivered)
        assertTrue("disabled must not pace ($elapsedMs ms)", elapsedMs < 500L)
    }

    @Test
    fun `download source paces reads and preserves all bytes`() {
        val src = Buffer().apply { write(payload) }
        val throttled = ThrottledSource(src, 5_000L).buffer() // ~2000ms for 10_000 bytes
        val out = Buffer()
        val start = System.nanoTime()
        throttled.readAll(out)
        val elapsedMs = (System.nanoTime() - start) / 1_000_000L
        assertEquals(payload.size.toLong(), out.size)
        assertTrue("too fast ($elapsedMs ms)", elapsedMs >= 1_500L)
        assertTrue("too slow ($elapsedMs ms)", elapsedMs <= 4_000L)
    }

    @Test
    fun `writing to a plain Buffer is never paced`() {
        ThrottleConfig.uploadBytesPerSec = 100L // absurdly slow if it wrongly paced
        val out = Buffer()
        val start = System.nanoTime()
        body().writeTo(out) // sink is okio.Buffer -> pace path skipped (logging/length probe)
        val elapsedMs = (System.nanoTime() - start) / 1_000_000L
        assertEquals(payload.size.toLong(), out.size)
        assertTrue("Buffer write must not pace ($elapsedMs ms)", elapsedMs < 500L)
    }
}
