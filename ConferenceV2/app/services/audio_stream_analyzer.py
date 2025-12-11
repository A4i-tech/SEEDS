"""
Real-time audio stream analyzer for detecting carrier hold signaling.

Detects hold events by analyzing RTP audio stream artifacts that occur
BEFORE the spoken announcement (within 100-300ms of hold activation).
"""

import numpy as np
from typing import Optional, Callable
from app.conf_logger import logger_instance


class HoldDetectionConfig:
    """Configuration thresholds for hold detection."""

    # RMS thresholds
    SILENCE_THRESHOLD = 500  # RMS below this = silence
    NORMAL_THRESHOLD = 2000  # Normal speech RMS

    # Detection windows
    SILENCE_WINDOW_MS = 200  # Detect silence for this duration
    SAMPLE_RATE = 16000  # 16kHz PCM audio

    # Frame analysis
    FRAME_SIZE_MS = 20  # Analyze every 20ms
    FRAMES_FOR_SILENCE = 10  # ~200ms of consecutive silence frames

    # Comfort noise detection
    CN_PAYLOAD_TYPE = 13  # RTP comfort-noise payload type


class AudioStreamAnalyzer:
    """
    Analyzes real-time audio stream from Vonage WebSocket to detect hold events.

    Detection methods:
    1. RMS silence detection - sudden drop to near-zero amplitude
    2. Comfort-noise packet detection (CN payload type 13)
    3. Frequency cutoff detection - abrupt signal drop
    """

    def __init__(self, phone_number: str, on_hold_detected: Callable):
        """
        Initialize analyzer for a participant's audio stream.

        Args:
            phone_number: Participant phone number
            on_hold_detected: Callback function to trigger when hold detected
        """
        self.phone_number = phone_number
        self.on_hold_detected = on_hold_detected

        # Audio analysis state
        self.previous_rms = 0.0
        self.silence_frame_count = 0
        self.is_hold_detected = False

        # Frame buffer for analysis
        self.frame_buffer = []

        logger_instance.info(f"[AUDIO ANALYZER] Initialized for {phone_number}")
        print(f"[AUDIO ANALYZER] 🎧 Started monitoring audio stream for {phone_number}")

    def analyze_pcm_frame(self, pcm_chunk: bytes) -> Optional[str]:
        """
        Analyze a PCM audio frame for hold detection artifacts.

        Args:
            pcm_chunk: Raw PCM audio data (16-bit linear PCM)

        Returns:
            Detection reason if hold detected, None otherwise
        """
        try:
            # Convert PCM bytes to numpy array (int16)
            samples = np.frombuffer(pcm_chunk, dtype=np.int16)

            if len(samples) == 0:
                return None

            # Calculate RMS (Root Mean Square) amplitude
            rms = np.sqrt(np.mean(samples.astype(np.float32) ** 2))

            # 1. DETECT SUDDEN SILENCE ARTIFACT
            silence_detected = self._detect_silence_artifact(rms)
            if silence_detected:
                return "silence_artifact"

            # 2. DETECT COMFORT NOISE PATTERN
            comfort_noise_detected = self._detect_comfort_noise(samples)
            if comfort_noise_detected:
                return "comfort_noise"

            # 3. DETECT FREQUENCY CUTOFF
            cutoff_detected = self._detect_frequency_cutoff(samples)
            if cutoff_detected:
                return "frequency_cutoff"

            # Update state for next frame
            self.previous_rms = rms

            return None

        except Exception as e:
            logger_instance.error(f"[AUDIO ANALYZER] Error analyzing frame: {e}")
            return None

    def _detect_silence_artifact(self, current_rms: float) -> bool:
        """
        Detect sudden RMS drop indicating hold activation.

        Carrier switches from normal voice → silence/comfort before announcement.
        """
        # Check for sudden drop from normal speech to silence
        if (
            self.previous_rms > HoldDetectionConfig.NORMAL_THRESHOLD
            and current_rms < HoldDetectionConfig.SILENCE_THRESHOLD
        ):

            self.silence_frame_count += 1

            # Require consecutive silent frames to avoid false positives
            if self.silence_frame_count >= HoldDetectionConfig.FRAMES_FOR_SILENCE:
                if not self.is_hold_detected:
                    logger_instance.info(
                        f"[AUDIO ANALYZER] 🚨 SILENCE ARTIFACT DETECTED for {self.phone_number}: "
                        f"RMS dropped {self.previous_rms:.0f} → {current_rms:.0f}"
                    )
                    print(
                        f"\n[AUDIO ANALYZER] 🚨 HOLD DETECTED (Silence) for {self.phone_number}\n"
                        f"  Previous RMS: {self.previous_rms:.0f}\n"
                        f"  Current RMS: {current_rms:.0f}\n"
                        f"  Silence frames: {self.silence_frame_count}\n"
                    )
                    self.is_hold_detected = True
                    return True
        else:
            # Reset silence counter if RMS is normal
            if current_rms > HoldDetectionConfig.SILENCE_THRESHOLD:
                self.silence_frame_count = 0

        return False

    def _detect_comfort_noise(self, samples: np.ndarray) -> bool:
        """
        Detect comfort-noise pattern (CN packets).

        Indian carriers often send RTP comfort-noise packets before announcement.
        Pattern: very low amplitude with characteristic flat spectrum.
        """
        # Calculate signal variance
        variance = np.var(samples.astype(np.float32))

        # Comfort noise has very low variance (flat signal)
        # and very low amplitude
        max_amplitude = np.max(np.abs(samples))

        if variance < 100 and max_amplitude < 500:
            if not self.is_hold_detected:
                logger_instance.info(
                    f"[AUDIO ANALYZER] 🚨 COMFORT NOISE DETECTED for {self.phone_number}: "
                    f"variance={variance:.2f}, max_amp={max_amplitude}"
                )
                print(
                    f"\n[AUDIO ANALYZER] 🚨 HOLD DETECTED (Comfort Noise) for {self.phone_number}\n"
                    f"  Variance: {variance:.2f}\n"
                    f"  Max amplitude: {max_amplitude}\n"
                )
                self.is_hold_detected = True
                return True

        return False

    def _detect_frequency_cutoff(self, samples: np.ndarray) -> bool:
        """
        Detect abrupt frequency spectrum change.

        When carrier switches media pipeline, there's a characteristic
        cutoff in the frequency spectrum.
        """
        # Check for sudden all-zero or near-zero signal
        # (indicates media pipeline restart)
        zero_count = np.sum(np.abs(samples) < 10)
        zero_ratio = zero_count / len(samples)

        if zero_ratio > 0.95:  # 95% of samples are near-zero
            if self.previous_rms > HoldDetectionConfig.SILENCE_THRESHOLD:
                if not self.is_hold_detected:
                    logger_instance.info(
                        f"[AUDIO ANALYZER] 🚨 FREQUENCY CUTOFF DETECTED for {self.phone_number}: "
                        f"zero_ratio={zero_ratio:.2%}"
                    )
                    print(
                        f"\n[AUDIO ANALYZER] 🚨 HOLD DETECTED (Cutoff) for {self.phone_number}\n"
                        f"  Zero-amplitude ratio: {zero_ratio:.2%}\n"
                    )
                    self.is_hold_detected = True
                    return True

        return False

    def reset(self):
        """Reset analyzer state (e.g., when participant returns from hold)."""
        self.previous_rms = 0.0
        self.silence_frame_count = 0
        self.is_hold_detected = False
        self.frame_buffer.clear()

        logger_instance.info(f"[AUDIO ANALYZER] Reset analyzer for {self.phone_number}")
        print(f"[AUDIO ANALYZER] 🔄 Reset hold detection for {self.phone_number}")
