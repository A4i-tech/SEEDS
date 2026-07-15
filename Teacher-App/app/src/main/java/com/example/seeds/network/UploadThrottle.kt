package com.example.seeds.network

import okhttp3.Interceptor
import okhttp3.MediaType
import okhttp3.RequestBody
import okhttp3.Response
import okhttp3.ResponseBody.Companion.asResponseBody
import okio.Buffer
import okio.BufferedSink
import okio.ForwardingSource
import okio.Source
import okio.buffer

/**
 * Debug-only network bandwidth throttle (upload + download).
 *
 * Set [ThrottleConfig.uploadBytesPerSec] / [ThrottleConfig.downloadBytesPerSec] to
 * positive values to cap the request-body write rate / response-body read rate for
 * every request through the throttled OkHttpClient. 0 = that direction is off.
 *
 * Throttling happens above TLS, inside the app's own OkHttp stack, so it works with
 * HTTPS and cert pinning (unlike an external proxy such as Charles).
 */
object ThrottleConfig {
    /** Upload cap in bytes/sec. 0 = off. */
    @Volatile
    var uploadBytesPerSec: Long = 0L

    /** Download cap in bytes/sec. 0 = off. */
    @Volatile
    var downloadBytesPerSec: Long = 0L
}

/** Wraps a [RequestBody], pacing socket writes to [ThrottleConfig.uploadBytesPerSec]. */
class ThrottledRequestBody(private val delegate: RequestBody) : RequestBody() {
    override fun contentType(): MediaType? = delegate.contentType()
    override fun contentLength(): Long = delegate.contentLength()
    override fun isOneShot(): Boolean = delegate.isOneShot()
    override fun isDuplex(): Boolean = delegate.isDuplex()

    override fun writeTo(sink: BufferedSink) {
        val bps = ThrottleConfig.uploadBytesPerSec
        // Skip pacing when disabled, or when the sink is an in-memory Buffer:
        // OkHttp/logging probe the body by writing into a Buffer (length,
        // request logging) — pacing those would double-count and add fake delay.
        if (bps <= 0L || sink is Buffer) {
            delegate.writeTo(sink)
            return
        }

        // ponytail: buffers the whole body in memory before pacing. Fine for this
        // app (voice clips + small JSON). Switch to a streaming source copy if a
        // large/duplex upload is ever added.
        val body = Buffer()
        delegate.writeTo(body)

        val chunk = maxOf(1L, bps / 10)              // ~10 flushes/sec
        val nanosPerChunk = 1_000_000_000L * chunk / bps
        var nextAt = System.nanoTime()
        while (!body.exhausted()) {
            val n = minOf(chunk, body.size)
            sink.write(body, n)
            sink.flush()
            nextAt += nanosPerChunk
            val waitNs = nextAt - System.nanoTime()
            if (waitNs > 0) {
                Thread.sleep(waitNs / 1_000_000L, (waitNs % 1_000_000L).toInt())
            }
        }
    }
}

/** Wraps a response body [Source], pacing reads to [bytesPerSec] (streaming, no full buffer). */
class ThrottledSource(delegate: Source, private val bytesPerSec: Long) : ForwardingSource(delegate) {
    private var nextAt = System.nanoTime()

    override fun read(sink: Buffer, byteCount: Long): Long {
        val chunk = maxOf(1L, bytesPerSec / 10)      // cap per read so pacing stays smooth
        val n = super.read(sink, minOf(byteCount, chunk))
        if (n > 0) {
            nextAt += 1_000_000_000L * n / bytesPerSec
            val waitNs = nextAt - System.nanoTime()
            if (waitNs > 0) {
                Thread.sleep(waitNs / 1_000_000L, (waitNs % 1_000_000L).toInt())
            }
        }
        return n
    }
}

/** Debug-only interceptor: paces the request body (upload) and response body (download). */
class NetworkThrottleInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        var request = chain.request()

        val body = request.body
        if (body != null && ThrottleConfig.uploadBytesPerSec > 0L) {
            request = request.newBuilder()
                .method(request.method, ThrottledRequestBody(body))
                .build()
        }

        val response = chain.proceed(request)

        val dbps = ThrottleConfig.downloadBytesPerSec
        val respBody = response.body
        if (dbps > 0L && respBody != null) {
            val throttled = ThrottledSource(respBody.source(), dbps).buffer()
            return response.newBuilder()
                .body(throttled.asResponseBody(respBody.contentType(), respBody.contentLength()))
                .build()
        }
        return response
    }
}
