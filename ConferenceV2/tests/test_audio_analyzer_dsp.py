import numpy as np
from app.services.audio_stream_analyzer import AudioStreamAnalyzer, HoldDetectionConfig


def gen_sine_frames(
    freq_hz: float, seconds: float, sample_rate: int, frame_ms: int, amp: float = 0.2
):
    total_samples = int(seconds * sample_rate)
    t = np.arange(total_samples) / sample_rate
    x = amp * np.sin(2 * np.pi * freq_hz * t)
    x = np.clip(x, -1.0, 1.0)
    frames = []
    frame_samples = int(sample_rate * frame_ms / 1000)
    for i in range(0, total_samples, frame_samples):
        frame = x[i : i + frame_samples]
        if len(frame) < frame_samples:
            pad = np.zeros(frame_samples - len(frame))
            frame = np.concatenate([frame, pad])
        frames.append((frame * 32767.0).astype(np.int16).tobytes())
    return frames


def gen_noise_frames(seconds: float, sample_rate: int, frame_ms: int, amp: float = 0.2):
    total_samples = int(seconds * sample_rate)
    x = amp * np.random.randn(total_samples)
    x = np.clip(x, -1.0, 1.0)
    frames = []
    frame_samples = int(sample_rate * frame_ms / 1000)
    for i in range(0, total_samples, frame_samples):
        frame = x[i : i + frame_samples]
        if len(frame) < frame_samples:
            pad = np.zeros(frame_samples - len(frame))
            frame = np.concatenate([frame, pad])
        frames.append((frame * 32767.0).astype(np.int16).tobytes())
    return frames


async def dummy_cb(_reason: str):
    return None


def test_music_detection_triggers_mute_decision():
    # Speed up config for unit test
    HoldDetectionConfig.JOIN_GRACE_SEC = 0.0
    HoldDetectionConfig.AGG_MIN_SEC = 0.6
    HoldDetectionConfig.AGG_WINDOW_SEC = 1.2
    HoldDetectionConfig.REARM_SEC = 0.1

    analyzer = AudioStreamAnalyzer(
        phone_number="+10000000001", on_hold_detected=dummy_cb
    )

    frames = gen_sine_frames(
        freq_hz=440.0,
        seconds=1.5,
        sample_rate=HoldDetectionConfig.SAMPLE_RATE,
        frame_ms=HoldDetectionConfig.FRAME_SIZE_MS,
    )

    decision = None
    for f in frames:
        decision = analyzer.analyze_pcm_frame(f) or decision

    assert decision is not None
    action, reason = decision
    assert action == "mute"
    assert reason in (
        "music_heuristics",
        "silence_artifact",
        "comfort_noise",
        "frequency_cutoff",
    )


def test_sustained_speech_triggers_unmute_when_auto_muted():
    # Speed up config for unit test
    HoldDetectionConfig.JOIN_GRACE_SEC = 0.0
    HoldDetectionConfig.AGG_MIN_SEC = 0.6
    HoldDetectionConfig.AGG_WINDOW_SEC = 1.2
    HoldDetectionConfig.REARM_SEC = 0.1

    analyzer = AudioStreamAnalyzer(
        phone_number="+10000000002", on_hold_detected=dummy_cb
    )
    analyzer.auto_muted = True
    analyzer.is_hold_detected = True

    frames = gen_noise_frames(
        seconds=1.5,
        sample_rate=HoldDetectionConfig.SAMPLE_RATE,
        frame_ms=HoldDetectionConfig.FRAME_SIZE_MS,
    )

    decision = None
    for f in frames:
        decision = analyzer.analyze_pcm_frame(f) or decision

    assert decision is not None
    action, reason = decision
    assert action == "unmute"
    assert reason == "speech_resumed"
