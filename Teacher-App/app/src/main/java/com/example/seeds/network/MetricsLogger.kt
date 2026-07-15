package com.example.seeds.network

import android.content.Context
import android.util.Log
import okhttp3.Call
import okhttp3.EventListener
import okhttp3.Response
import java.io.File
import java.io.IOException

/**
 * Debug-only per-request metrics logger.
 *
 * Appends one CSV row per HTTP call to <externalFilesDir>/throttle-metrics.csv,
 * capturing the current upload throttle, byte counts, status and duration — the
 * data behind the PDF-style report. One listener instance per call (state is
 * per-call), created by [factory].
 *
 * Pull the file with:
 *   adb pull /sdcard/Android/data/com.example.seeds/files/throttle-metrics.csv
 */
class MetricsLogger private constructor(private val csv: File) : EventListener() {

    private var startNs = 0L
    private var reqBytes = 0L
    private var respBytes = 0L
    private var status = 0

    override fun callStart(call: Call) {
        startNs = System.nanoTime()
    }

    override fun requestBodyEnd(call: Call, byteCount: Long) {
        reqBytes = byteCount
    }

    override fun responseHeadersEnd(call: Call, response: Response) {
        status = response.code
    }

    override fun responseBodyEnd(call: Call, byteCount: Long) {
        respBytes = byteCount
    }

    override fun callEnd(call: Call) = write(call, "OK")

    override fun callFailed(call: Call, ioe: IOException) =
        write(call, "FAIL:${ioe.javaClass.simpleName}")

    private fun write(call: Call, result: String) {
        val durationMs = (System.nanoTime() - startNs) / 1_000_000L
        val request = call.request()
        val row = listOf(
            System.currentTimeMillis(),
            request.method,
            request.url.encodedPath,
            reqBytes,
            respBytes,
            status,
            durationMs,
            ThrottleConfig.uploadBytesPerSec,
            result,
        ).joinToString(",") + "\n"

        synchronized(LOCK) {
            try {
                val newFile = !csv.exists()
                csv.appendText(if (newFile) HEADER + row else row)
            } catch (e: Exception) {
                Log.e("MetricsLogger", "CSV write failed", e)
            }
        }
    }

    companion object {
        private val LOCK = Any()
        private const val HEADER =
            "epoch_ms,method,path,req_bytes,resp_bytes,status,duration_ms,throttle_bps,result\n"

        /** Factory for the throttled client, or null if no external files dir is available. */
        fun factory(context: Context): Factory? {
            val dir = context.getExternalFilesDir(null) ?: return null
            val csv = File(dir, "throttle-metrics.csv")
            return Factory { MetricsLogger(csv) }
        }
    }
}
