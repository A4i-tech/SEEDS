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
 * Enum for Playback Refusal Reasons
 */
const PlaybackRefusal = {
  PLAY_DEFERRED_SYSTEM_AUDIO: "play-deferred-system-audio",
  RESUME_REFUSED_SYSTEM_AUDIO: "resume-refused-system-audio",
  SEEK_DEFERRED_SYSTEM_AUDIO: "seek-deferred-system-audio",
};

module.exports = {
  MessageType,
  PlaybackStatus,
  PlaybackRefusal,
};
