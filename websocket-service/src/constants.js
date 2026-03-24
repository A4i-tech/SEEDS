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
};

/**
 * Enum for Playback Status
 */
const PlaybackStatus = {
  PLAYING: "Playing",
  PAUSED: "Paused",
  STOPPED: "Stopped",
};

module.exports = {
  MessageType,
  PlaybackStatus,
};
