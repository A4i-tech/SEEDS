"""
Real-time audio stream analyzer for detecting carrier hold signaling.

Phase 1 (DSP-only):
- Adds speech-vs-music heuristics using fixed acoustic invariants:
    - Pitch stability (music: stable; speech: varying)
    - Spectral entropy (music: lower; speech: higher)
    - Temporal modulation in 2–8 Hz (music: periodic; speech: bursty)
    - Formant motion proxies (centroid variance)

Existing fast-path artifacts remain (silence/comfort/cutoff) to catch carrier
transitions within 100–300 ms.
"""

import numpy as np
from typing import Optional, Callable, Tuple, Deque
from collections import deque
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

    # DSP heuristics
    FRAME_SIZE_MS = 20
    SAMPLE_RATE = 16000
    FRAME_SAMPLES = int(SAMPLE_RATE * FRAME_SIZE_MS / 1000)
    FFT_SIZE = 512

    # Aggregation windows
    AGG_WINDOW_SEC = 4.0  # decision window
    AGG_MIN_SEC = 2.5  # minimum continuous evidence to trigger
    AUTO_UNMUTE_SEC = 2.5  # sustained speech to auto-unmute
    JOIN_GRACE_SEC = 12.0  # ignore actions right after connect
    REARM_SEC = 20.0  # min delta between automatic actions

    # Thresholds (tunable)
    ENTROPY_MUSIC_MAX = 3.5  # lower entropy → music
    CENTROID_VAR_MUSIC_MAX = 400.0  # Hz^2 across window
    PITCH_STABILITY_MAX_HZ = 8.0  # std(f0)
    MODULATION_2_8_HZ_MIN = 0.25  # fraction of envelope energy in 2–8 Hz


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

        # Frame buffers (rolling)
        self._rms_buf: Deque[float] = deque(
            maxlen=int(
                HoldDetectionConfig.AGG_WINDOW_SEC
                * 1000
                / HoldDetectionConfig.FRAME_SIZE_MS
            )
        )
        self._entropy_buf: Deque[float] = deque(maxlen=self._rms_buf.maxlen)
        self._centroid_buf: Deque[float] = deque(maxlen=self._rms_buf.maxlen)
        self._f0_buf: Deque[float] = deque(maxlen=self._rms_buf.maxlen)

        # Action gating
        self._connected_at = None  # set on first frame timestamp
        self._last_action_ts = -1.0
        self.auto_muted = False

        logger_instance.info(f"[AUDIO ANALYZER] Initialized for {phone_number}")
        print(f"[AUDIO ANALYZER] 🎧 Started monitoring audio stream for {phone_number}")

    def analyze_pcm_frame(self, pcm_chunk: bytes) -> Optional[Tuple[str, str]]:
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

            # Timestamp baseline
            if self._connected_at is None:
                self._connected_at = 0.0  # logical time in frames

            # Calculate RMS (Root Mean Square) amplitude
            rms = np.sqrt(np.mean(samples.astype(np.float32) ** 2))

            # Update rolling buffers for DSP features
            spectrum = self._power_spectrum(samples)
            entropy = self._spectral_entropy(spectrum)
            centroid = self._spectral_centroid(spectrum)
            f0 = self._estimate_pitch(samples)

            self._rms_buf.append(float(rms))
            self._entropy_buf.append(float(entropy))
            self._centroid_buf.append(float(centroid))
            if f0 is not None:
                self._f0_buf.append(float(f0))

            # 1. DETECT SUDDEN SILENCE ARTIFACT
            silence_detected = self._detect_silence_artifact(rms)
            if silence_detected:
                return ("mute", "silence_artifact")

            # 2. DETECT COMFORT NOISE PATTERN
            comfort_noise_detected = self._detect_comfort_noise(samples)
            if comfort_noise_detected:
                return ("mute", "comfort_noise")

            # 3. DETECT FREQUENCY CUTOFF
            cutoff_detected = self._detect_frequency_cutoff(samples)
            if cutoff_detected:
                return ("mute", "frequency_cutoff")

            # 4. DSP music-vs-speech heuristic (aggregated over window)
            decision = self._music_speech_decision()
            if decision == "music" and not self.is_hold_detected:
                # Trigger only after grace and with rearm
                if self._can_fire_action():
                    self.is_hold_detected = True
                    self.auto_muted = True
                    logger_instance.info(
                        f"[AUDIO ANALYZER] 🚨 MUSIC-LIKE SEGMENT DETECTED for {self.phone_number} (auto-mute)"
                    )
                    return ("mute", "music_heuristics")

            if decision == "speech" and self.auto_muted:
                if self._can_fire_action():
                    self.auto_muted = False
                    self.is_hold_detected = False
                    logger_instance.info(
                        f"[AUDIO ANALYZER] ✅ SPEECH RESUMED for {self.phone_number} (auto-unmute)"
                    )
                    return ("unmute", "speech_resumed")

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
        self._rms_buf.clear()
        self._entropy_buf.clear()
        self._centroid_buf.clear()
        self._f0_buf.clear()
        self.auto_muted = False

        logger_instance.info(f"[AUDIO ANALYZER] Reset analyzer for {self.phone_number}")
        print(f"[AUDIO ANALYZER] 🔄 Reset hold detection for {self.phone_number}")

    # ---------------------- DSP helpers ----------------------
    def _power_spectrum(self, samples: np.ndarray) -> np.ndarray:
        x = samples.astype(np.float32)
        if len(x) < HoldDetectionConfig.FRAME_SAMPLES:
            # pad
            pad = HoldDetectionConfig.FRAME_SAMPLES - len(x)
            x = np.pad(x, (0, pad))
        win = np.hanning(HoldDetectionConfig.FRAME_SAMPLES)
        X = np.fft.rfft(
            x[: HoldDetectionConfig.FRAME_SAMPLES] * win, n=HoldDetectionConfig.FFT_SIZE
        )
        P = (np.abs(X) ** 2).astype(np.float32)
        return P + 1e-9

    def _spectral_entropy(self, spectrum: np.ndarray) -> float:
        p = spectrum / np.sum(spectrum)
        H = -np.sum(p * np.log2(p))
        return float(H)

    def _spectral_centroid(self, spectrum: np.ndarray) -> float:
        freqs = np.fft.rfftfreq(
            HoldDetectionConfig.FFT_SIZE, d=1.0 / HoldDetectionConfig.SAMPLE_RATE
        )
        c = float(np.sum(freqs * spectrum) / np.sum(spectrum))
        return c

    def _estimate_pitch(self, samples: np.ndarray) -> Optional[float]:
        # Simple AMDF/autocorr hybrid
        x = samples.astype(np.float32)
        if len(x) < HoldDetectionConfig.FRAME_SAMPLES:
            pad = HoldDetectionConfig.FRAME_SAMPLES - len(x)
            x = np.pad(x, (0, pad))
        x = x[: HoldDetectionConfig.FRAME_SAMPLES]
        x = x - np.mean(x)

        # search typical speech/music pitch range 80–500 Hz
        min_lag = int(HoldDetectionConfig.SAMPLE_RATE / 500)
        max_lag = int(HoldDetectionConfig.SAMPLE_RATE / 80)
        if max_lag <= min_lag:
            return None
        corr = np.correlate(x, x, mode="full")[len(x) - 1 :]
        seg = corr[min_lag:max_lag]
        if len(seg) == 0:
            return None
        lag = np.argmax(seg) + min_lag
        f0 = HoldDetectionConfig.SAMPLE_RATE / float(lag)
        if f0 <= 0:
            return None
        return f0

    def _modulation_energy_2_8_hz(self) -> float:
        # Use RMS envelope over frames within window
        buf = np.array(self._rms_buf, dtype=np.float32)
        if len(buf) < 16:
            return 0.0
        buf = buf - np.mean(buf)
        # Envelope FFT
        E = np.fft.rfft(buf)
        P = np.abs(E) ** 2
        # Map indices to Hz: frame_rate = 1000/FRAME_SIZE_MS per second
        frame_rate = 1000.0 / HoldDetectionConfig.FRAME_SIZE_MS
        freqs = np.fft.rfftfreq(len(buf), d=1.0 / frame_rate)
        band = (freqs >= 2.0) & (freqs <= 8.0)
        frac = float(np.sum(P[band]) / (np.sum(P) + 1e-9))
        return frac

    def _music_speech_decision(self) -> Optional[str]:
        # Need minimum aggregation window
        frames_needed = int(
            HoldDetectionConfig.AGG_MIN_SEC * 1000 / HoldDetectionConfig.FRAME_SIZE_MS
        )
        if len(self._entropy_buf) < frames_needed:
            return None

        entropy_mean = float(np.mean(self._entropy_buf))
        centroid_var = float(np.var(self._centroid_buf))
        pitch_std = float(np.std(self._f0_buf)) if len(self._f0_buf) >= 5 else 999.0
        mod_frac = self._modulation_energy_2_8_hz()

        music_votes = 0
        speech_votes = 0

        if entropy_mean <= HoldDetectionConfig.ENTROPY_MUSIC_MAX:
            music_votes += 1
        else:
            speech_votes += 1

        if centroid_var <= HoldDetectionConfig.CENTROID_VAR_MUSIC_MAX:
            music_votes += 1
        else:
            speech_votes += 1

        if pitch_std <= HoldDetectionConfig.PITCH_STABILITY_MAX_HZ:
            music_votes += 1
        else:
            speech_votes += 1

        if mod_frac >= HoldDetectionConfig.MODULATION_2_8_HZ_MIN:
            music_votes += 1
        else:
            speech_votes += 1

        if music_votes >= 3:
            return "music"
        if speech_votes >= 3:
            return "speech"
        return None

    def _can_fire_action(self) -> bool:
        # Use frame count as logical time
        # We approximate seconds by number of frames processed
        total_frames = len(self._rms_buf)
        seconds = total_frames * HoldDetectionConfig.FRAME_SIZE_MS / 1000.0
        if seconds < HoldDetectionConfig.JOIN_GRACE_SEC:
            return False
        # Rearm constraint
        if (
            self._last_action_ts >= 0
            and (seconds - self._last_action_ts) < HoldDetectionConfig.REARM_SEC
        ):
            return False
        self._last_action_ts = seconds
        return True
