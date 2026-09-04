import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Box,
  IconButton,
  Tooltip,
  Typography,
  CircularProgress,
  Paper,
  Divider,
  Alert,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  InputAdornment,
} from "@mui/material";
import {
  Mic as MicIcon,
  Stop as StopIcon,
  Close as CloseIcon,
  Send as SendIcon,
  CheckCircle as CheckCircleIcon,
  Refresh as RefreshIcon,
  NavigateNext as NavigateNextIcon,
  VolumeUp as VolumeUpIcon,
} from "@mui/icons-material";
import { useNavigate, useLocation } from "react-router-dom";
import useVoiceRecorder from "../hooks/useVoiceRecorder";
import { sendVoiceCommand, sendTextCommand, fetchTTSPrompt, executeClientCommands } from "../services/voiceCommandService";
import { formatResult, getNavigationTarget } from "../utils/commandResultFormatter";
import { useConference } from "../context/ConferenceContext";

const STATUS = {
  IDLE: "idle",
  RECORDING: "recording",
  TRANSCRIBING: "transcribing",
  PLANNING: "planning",
  EXECUTING: "executing",
  DONE: "done",
  ERROR: "error",
};

const STATUS_LABELS = {
  [STATUS.RECORDING]: "Listening...",
  [STATUS.TRANSCRIBING]: "Transcribing audio...",
  [STATUS.PLANNING]: "Seeds is thinking...",
  [STATUS.EXECUTING]: "Executing...",
  [STATUS.DONE]: "Done",
  [STATUS.ERROR]: "Something went wrong",
};

const PANEL_WIDTH = 420;

const PANEL_BASE_STYLES = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: PANEL_WIDTH,
  bgcolor: "background.paper",
  borderLeft: 1,
  borderColor: "divider",
  boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
  // Above the play-content drawer (MUI modal = 1300) so it slides in behind this panel.
  zIndex: 1301,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  transition: "transform 0.25s ease",
};

const PANEL_HEADER_STYLES = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  px: 2,
  py: 1.5,
  borderBottom: 1,
  borderColor: "divider",
  flexShrink: 0,
};

const SPOKEN_SUMMARY_STYLES = {
  p: 2,
  mb: 2,
  bgcolor: "primary.50",
  borderLeft: 4,
  borderColor: "primary.main",
  display: "flex",
  alignItems: "center",
  gap: 1.5,
};

export default function VoiceCommandButton() {
  const navigate = useNavigate();
  const location = useLocation();
  // Sent to the backend so "start a call" can default to this class without asking.
  const currentClassId = location.pathname.match(/\/classrooms\/detail\/([^/]+)/)?.[1] || null;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(STATUS.IDLE);
  const [result, setResult] = useState(null);
  const [textInput, setTextInput] = useState("");
  const { isRecording, startRecording, stopRecording, audioBlob, error: recorderError } =
    useVoiceRecorder();
  const { confId: activeConferenceId, setConfId } = useConference();
  const thinkingAudioRef = useRef(null);
  const thinkingPlayerRef = useRef(null);
  const historyRef = useRef([]);
  // Mirrored into refs so the audioBlob effect reads latest values without
  // listing them as deps — a conf-id/route change would otherwise re-fire the
  // effect with the same blob and re-send the command (rate-limit storm).
  const activeConferenceIdRef = useRef(activeConferenceId);
  const currentClassIdRef = useRef(currentClassId);
  activeConferenceIdRef.current = activeConferenceId;
  currentClassIdRef.current = currentClassId;
  const processedBlobRef = useRef(null);
  const isBusy = status === STATUS.PLANNING || status === STATUS.EXECUTING || status === STATUS.TRANSCRIBING;

  const recordTurn = useCallback((data) => {
    if (!data || data.error || !data.transcript) return;
    historyRef.current = [
      ...historyRef.current,
      { transcript: data.transcript, spoken_summary: data.spoken_summary || "" },
    ].slice(-2);
  }, []);

  // History must survive this reset — it lets a follow-up command resolve
  // against the previous turn.
  const reset = useCallback(() => {
    setStatus(STATUS.IDLE);
    setResult(null);
    setTextInput("");
  }, []);

  const resetSession = useCallback(() => {
    reset();
    historyRef.current = [];
  }, [reset]);

  // Toggle the global partition class so the app shrinks left and any
  // right-anchored drawer is inset (see App.css).
  useEffect(() => {
    document.body.classList.toggle("seeds-open", open);
    return () => document.body.classList.remove("seeds-open");
  }, [open]);

  const handleOpen = useCallback(() => {
    if (isBusy) return;
    resetSession();
    setOpen(true);
  }, [resetSession, isBusy]);

  const handleClose = () => {
    if (isRecording) stopRecording();
    if (thinkingPlayerRef.current) { thinkingPlayerRef.current.pause(); thinkingPlayerRef.current = null; }
    setOpen(false);
    resetSession();
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === "Space" && !e.repeat) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
        e.preventDefault();
        handleOpen();
        if (!isRecording && !isBusy) {
          startRecording();
          setStatus(STATUS.RECORDING);
        }
      }
    };
    const onKeyUp = (e) => {
      if (e.code === "Space") {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
        if (isRecording) {
          stopRecording();
          setStatus(STATUS.TRANSCRIBING);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [isRecording, startRecording, stopRecording, handleOpen, isBusy]);

  useEffect(() => {
    if (status !== STATUS.PLANNING) return;
    let cancelled = false;
    (async () => {
      try {
        if (!thinkingAudioRef.current) {
          const { audio_base64 } = await fetchTTSPrompt("thinking");
          if (audio_base64) thinkingAudioRef.current = audio_base64;
        }
        if (!cancelled && thinkingAudioRef.current) {
          const player = new Audio(`data:audio/mp3;base64,${thinkingAudioRef.current}`);
          thinkingPlayerRef.current = player;
          player.play().catch(() => {});
        }
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [status]);

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
      setStatus(STATUS.TRANSCRIBING);
    } else {
      reset();
      startRecording();
      setStatus(STATUS.RECORDING);
    }
  };

  const dispatchCommandComplete = useCallback((data) => {
    if (!data?.commands) return;
    const hasMutation = data.commands.some((cmd) =>
      ["POST", "PATCH", "PUT", "DELETE"].includes(cmd.method?.toUpperCase())
    );
    if (hasMutation) {
      window.dispatchEvent(new CustomEvent("voice-command-complete", { detail: data }));
    }
  }, []);

  const storeConferenceIdFromResults = useCallback((data) => {
    if (!data?.results || !data?.commands) return;
    for (let i = 0; i < data.commands.length; i++) {
      const cmd = data.commands[i];
      const res = data.results?.[i];
      if (cmd.path?.match(/\/conference\/create/) && res?.status < 300 && res?.data?.id) {
        setConfId(res.data.id);
        return;
      }
    }
  }, [setConfId]);

  // Conference steps only work client-side (ConferenceV2 isn't reachable from the backend).
  const runClientCommands = async (data) => {
    if (!data.results?.some((r) => r.requiresClientExecution)) return data;
    setStatus(STATUS.EXECUTING);
    return { ...data, results: await executeClientCommands([...data.results]) };
  };

  const finishCommand = useCallback((data, transcriptFallback) => {
    setResult(data);
    setStatus(data.error ? STATUS.ERROR : STATUS.DONE);
    if (!data.error) {
      recordTurn(transcriptFallback ? { ...data, transcript: data.transcript || transcriptFallback } : data);
      storeConferenceIdFromResults(data);
      dispatchCommandComplete(data);
    }
  }, [recordTurn, storeConferenceIdFromResults, dispatchCommandComplete]);

  const handleSendText = useCallback(async () => {
    const text = textInput.trim();
    if (!text) return;

    try {
      setStatus(STATUS.PLANNING);
      const data = await runClientCommands(
        await sendTextCommand(text, { active_conference_id: activeConferenceId, current_class_id: currentClassId, history: historyRef.current })
      );
      finishCommand(data, text);
    } catch (err) {
      setResult({ error: err.message || "Request failed" });
      setStatus(STATUS.ERROR);
    }
  }, [textInput, finishCommand, activeConferenceId, currentClassId]);

  const handleTextKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  useEffect(() => {
    if (!audioBlob || processedBlobRef.current === audioBlob) return;
    processedBlobRef.current = audioBlob;
    let cancelled = false;

    (async () => {
      try {
        setStatus(STATUS.PLANNING);
        let data = await sendVoiceCommand(audioBlob, {
          active_conference_id: activeConferenceIdRef.current,
          current_class_id: currentClassIdRef.current,
          history: historyRef.current,
        });
        if (cancelled) return;
        data = await runClientCommands(data);
        if (cancelled) return;
        finishCommand(data);
      } catch (err) {
        if (!cancelled) {
          setResult({ error: err.message || "Request failed" });
          setStatus(STATUS.ERROR);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [audioBlob, finishCommand]);

  const navTarget = result?.commands ? getNavigationTarget(result.commands, result.results) : null;
  const NAV_ACTION_EVENTS = {
    OPEN_CONTENT_DRAWER: "open-content-drawer",
    CONTENT_LOAD_MORE: "content-load-more",
    CONTENT_STOP: "content-stop-playback",
  };
  const dispatchNavAction = (action) => {
    const eventName = NAV_ACTION_EVENTS[action];
    if (!eventName) return false;
    window.dispatchEvent(new CustomEvent(eventName));
    return true;
  };

  useEffect(() => {
    if (status === STATUS.DONE && result?.audio_base64) {
      try {
        const audio = new Audio(`data:audio/mp3;base64,${result.audio_base64}`);
        audio.play().catch((e) => console.warn("TTS auto-play blocked:", e));
      } catch (e) {
        console.warn("TTS playback error:", e);
      }
    }
  }, [status, result?.audio_base64]);

  // Panel stays open on auto-navigate — navigation happens in the main partition beside it.
  useEffect(() => {
    if (status !== STATUS.DONE || dispatchNavAction(navTarget?.action)) return;
    if (navTarget?.autoNavigate) {
      navigate(navTarget.path, navTarget.state ? { state: navTarget.state } : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, navTarget]);

  const handleNavigate = () => {
    if (!dispatchNavAction(navTarget?.action) && navTarget?.path) {
      navigate(navTarget.path, navTarget.state ? { state: navTarget.state } : undefined);
    }
  };

  const handleTryAgain = () => {
    setStatus(STATUS.IDLE);
    setResult(null);
  };

  return createPortal(
    <>
      {!open && (
        <Tooltip
          title={<Typography variant="caption">Hold <b>Space</b> to talk to Seeds AI</Typography>}
          arrow
          placement="left"
        >
          <Box sx={{ position: "fixed", bottom: 24, right: 24, zIndex: 1300 }}>
            <IconButton
              onClick={handleOpen}
              sx={{
                bgcolor: "primary.main",
                color: "white",
                "&:hover": { bgcolor: "primary.dark" },
                width: 48,
                height: 48,
              }}
            >
              <MicIcon />
            </IconButton>
          </Box>
        </Tooltip>
      )}

      <Box
        sx={{ ...PANEL_BASE_STYLES, transform: open ? "translateX(0)" : "translateX(100%)" }}
      >
        <Box sx={PANEL_HEADER_STYLES}>
          <Typography variant="h6">🌱 Seeds AI</Typography>
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
          {recorderError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {recorderError}
            </Alert>
          )}

          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 2 }}>
            <IconButton
              onClick={handleToggleRecording}
              disabled={isBusy}
              sx={{
                width: 80,
                height: 80,
                bgcolor: isRecording ? "error.main" : "primary.main",
                color: "white",
                "&:hover": { bgcolor: isRecording ? "error.dark" : "primary.dark" },
                mb: 1,
              }}
            >
              {isRecording ? <StopIcon sx={{ fontSize: 40 }} /> : <MicIcon sx={{ fontSize: 40 }} />}
            </IconButton>

            {status !== STATUS.IDLE && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {status !== STATUS.DONE && status !== STATUS.ERROR && (
                  <CircularProgress size={16} />
                )}
                <Typography variant="body2" color="text.secondary">
                  {STATUS_LABELS[status]}
                </Typography>
              </Box>
            )}
          </Box>

          <Divider sx={{ my: 1 }}>
            <Typography variant="caption" color="text.secondary">
              or type a command
            </Typography>
          </Divider>
          <TextField
            fullWidth
            size="small"
            placeholder="e.g. Show me all my classrooms"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={handleTextKeyDown}
            disabled={isBusy}
            sx={{ mb: 2 }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={handleSendText}
                    disabled={isBusy || !textInput.trim()}
                    color="primary"
                    size="small"
                  >
                    <SendIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          {result?.transcript && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography variant="caption" color="text.secondary">
                You said:
              </Typography>
              <Typography variant="body1">{result.transcript}</Typography>
            </Paper>
          )}

          {result?.error && (
            <Alert
              severity="error"
              sx={{ mb: 2 }}
              action={
                <Button
                  color="inherit"
                  size="small"
                  startIcon={<RefreshIcon />}
                  onClick={handleTryAgain}
                >
                  Try again
                </Button>
              }
            >
              {result.error}
            </Alert>
          )}

          {status === STATUS.DONE && result?.spoken_summary && (
            <Paper sx={SPOKEN_SUMMARY_STYLES}>
              <VolumeUpIcon color="primary" />
              <Typography variant="body2" sx={{ fontStyle: "italic" }}>
                {result.spoken_summary}
              </Typography>
            </Paper>
          )}

          {result?.commands && result?.results && (
            <>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Results:
              </Typography>
              {result.commands.map((cmd, i) => {
                const res = result.results?.[i];
                const formatted = formatResult(cmd, res);
                const isSuccess = res && !res.error && res.status < 300;

                return (
                  <Paper
                    key={i}
                    variant="outlined"
                    sx={{
                      p: 2,
                      mb: 1.5,
                      borderColor: isSuccess ? "success.main" : "error.main",
                      borderLeftWidth: 4,
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                      {isSuccess ? (
                        <CheckCircleIcon color="success" fontSize="small" />
                      ) : (
                        <Alert severity="error" sx={{ p: 0, bgcolor: "transparent" }} icon={false}>
                          Error
                        </Alert>
                      )}
                      <Typography variant="subtitle2">{formatted.title}</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {formatted.summary}
                    </Typography>
                    {formatted.items.length > 0 && (
                      <List dense disablePadding sx={{ mt: 0.5 }}>
                        {formatted.items.slice(0, 10).map((item, j) => (
                          <ListItem key={j} disableGutters sx={{ py: 0 }}>
                            <ListItemText
                              primary={item}
                              primaryTypographyProps={{ variant: "body2" }}
                            />
                          </ListItem>
                        ))}
                        {formatted.items.length > 10 && (
                          <Typography variant="caption" color="text.secondary">
                            ...and {formatted.items.length - 10} more
                          </Typography>
                        )}
                      </List>
                    )}
                  </Paper>
                );
              })}
            </>
          )}

          {status === STATUS.DONE && navTarget && (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
              <Button
                variant="outlined"
                endIcon={<NavigateNextIcon />}
                onClick={handleNavigate}
              >
                {navTarget.label}
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    </>,
    document.body
  );
}
