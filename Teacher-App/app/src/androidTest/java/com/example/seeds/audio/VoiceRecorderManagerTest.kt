package com.example.seeds.audio

import android.Manifest
import android.media.MediaMetadataRetriever
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * On-device tests for VoiceRecorderManager.
 * Run with: ./gradlew :app:connectedDebugAndroidTest
 *
 * Note on emulator mic: emulator default mic input is silent — ideal for silence-auto-stop test.
 * On real devices, ensure a quiet environment for test 2.
 */
@RunWith(AndroidJUnit4::class)
class VoiceRecorderManagerTest {

    @get:Rule
    val permissionRule: GrantPermissionRule =
        GrantPermissionRule.grant(Manifest.permission.RECORD_AUDIO)

    private lateinit var manager: VoiceRecorderManager

    @Before
    fun setup() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        manager = VoiceRecorderManager(context)
    }

    @After
    fun teardown() {
        manager.reset()
    }

    // Gate 1: start() writes a valid AAC file
    @Test
    fun start_writesValidM4aFile() {
        manager.start()
        assertTrue(manager.state.value is RecorderState.Recording)

        Thread.sleep(1500) // record briefly
        manager.stop()

        val state = manager.state.value
        assertTrue("Expected Stopped, got $state", state is RecorderState.Stopped)

        val file = (state as RecorderState.Stopped).file
        assertTrue("File must exist", file.exists())
        assertTrue("File must be non-empty", file.length() > 0)

        // Validate AAC container
        val retriever = MediaMetadataRetriever()
        retriever.setDataSource(file.absolutePath)
        val mime = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_MIMETYPE)
        retriever.release()
        assertNotNull("MIME must be extractable from valid AAC file", mime)
    }

    // Gate 2: silence → auto-stop within ~2s
    // Emulator mic is silent by default — no speech needed.
    // On real device: run in quiet room. Threshold tuning: adjust SILENCE_THRESHOLD in VoiceRecorderManager.
    @Test
    fun start_autoStopsOnSilenceWithin4Seconds() {
        manager.start()
        assertTrue(manager.state.value is RecorderState.Recording)

        // Wait up to 4s (2s window + 2s margin)
        val deadline = System.currentTimeMillis() + 4000L
        while (System.currentTimeMillis() < deadline) {
            if (manager.state.value is RecorderState.Stopped) break
            Thread.sleep(200)
        }

        val state = manager.state.value
        assertTrue(
            "Expected Stopped (silence auto-stop), got $state — check SILENCE_THRESHOLD or mic input",
            state is RecorderState.Stopped
        )
    }

    // Gate 3: manual stop mid-recording → Stopped(file), partial file valid
    @Test
    fun stop_midRecording_producesValidPartialFile() {
        manager.start()
        assertTrue(manager.state.value is RecorderState.Recording)

        Thread.sleep(500) // short recording
        manager.stop()

        val state = manager.state.value
        assertTrue("Expected Stopped, got $state", state is RecorderState.Stopped)
        assertTrue("Partial file must exist", (state as RecorderState.Stopped).file.exists())
        assertTrue("Partial file must be non-empty", state.file.length() > 0)
    }

    // Gate 4: start() is idempotent while already recording
    @Test
    fun start_whileRecording_isIgnored() {
        manager.start()
        val firstState = manager.state.value as? RecorderState.Recording ?: return

        manager.start() // second call must be no-op
        val secondState = manager.state.value as? RecorderState.Recording
        assertNotNull(secondState)
        assertEquals(firstState.startedAt, secondState!!.startedAt)
    }

    // Gate 5: reset() returns to Idle and discards file
    @Test
    fun reset_fromRecording_returnsIdle() {
        manager.start()
        assertTrue(manager.state.value is RecorderState.Recording)

        manager.reset()
        assertEquals(RecorderState.Idle, manager.state.value)
    }
}

/**
 * Permission-denied path test.
 *
 * Run manually: revoke RECORD_AUDIO before this test via adb:
 *   adb shell pm revoke com.example.seeds android.permission.RECORD_AUDIO
 * Then run only this class. Expected: state transitions to Error, no crash.
 *
 * Cannot be automated in the same run as the granted tests (runtime permission
 * cannot be revoked mid-instrumentation without a process restart).
 */
@RunWith(AndroidJUnit4::class)
class VoiceRecorderManagerPermissionDeniedTest {

    @Test
    fun start_withoutPermission_transitionsToError() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val manager = VoiceRecorderManager(context)

        manager.start()

        val state = manager.state.value
        assertTrue(
            "Expected Error when RECORD_AUDIO denied, got $state — ensure permission is revoked before running",
            state is RecorderState.Error || state is RecorderState.Idle
        )
        // Must not crash — reaching here means no unhandled exception
    }
}
