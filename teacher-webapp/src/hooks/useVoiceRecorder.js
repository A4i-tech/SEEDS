import { useState, useRef, useCallback } from "react";

/**
 * Hook for recording audio from the microphone.
 * Returns { isRecording, startRecording, stopRecording, audioBlob, error }
 */
export default function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [error, setError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setAudioBlob(null);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      // --- Silence Detection ---
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let silenceStart = Date.now();
      const SILENCE_THRESHOLD = 10; // low volume threshold
      const SILENCE_DURATION = 2000; // 2 seconds
      let animationFrameId;
      let isCheckingSilence = true;

      const checkSilence = () => {
        if (!isCheckingSilence) return;

        analyser.getByteFrequencyData(dataArray);
        const maxVolume = Math.max(...dataArray);

        if (maxVolume > SILENCE_THRESHOLD) {
          silenceStart = Date.now(); // reset if noise detected
        } else {
          if (Date.now() - silenceStart > SILENCE_DURATION) {
            // Stop recording
            if (mediaRecorder.state === "recording") {
              mediaRecorder.stop();
              setIsRecording(false);
            }
            isCheckingSilence = false;
            return;
          }
        }

        if (mediaRecorder.state === "recording") {
          animationFrameId = requestAnimationFrame(checkSilence);
        }
      };

      mediaRecorder.onstop = () => {
        isCheckingSilence = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        try { audioContext.close(); } catch (_) {}

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      checkSilence();
    } catch (err) {
      setError("Microphone access denied. Please allow microphone permissions.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  return { isRecording, startRecording, stopRecording, audioBlob, error };
}
