/**
 * Enum for Message Types
 */
const MessageType = {
  HEARTBEAT: "ping",
  PLAY_AUDIO: "play",
  PLAY_SYSTEM_MESSAGE: "play-system-message",
  PAUSE_AUDIO: "pause",
  RESUME_AUDIO: "resume",
  STOP_AUDIO: "stop",
  SEEK_AUDIO: "seek",
  SET_SPEED: "set-speed",
  DISCONNECT: "disconnect",
  RECONNECT: "reconnect",
  PLAYBACK_STATE_UPDATES: "playback-state-update",
  AUDIO_DATA: "AUDIO_DATA",
};

/**
 * Enum for Playback Status
 */
const PlaybackStatus = {
  PLAYING: "Playing",
  PAUSED: "Paused",
  STOPPED: "Stopped",
};

/**
 * Speeds for which pre-generated, pitch-preserving audio variants exist.
 * Must match SUPPORTED_SPEEDS in platform/app/services/fsm/instantiation/speed_control.py.
 */
const SUPPORTED_SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0];

module.exports = {
  MessageType,
  PlaybackStatus,
  SUPPORTED_SPEEDS,
};
