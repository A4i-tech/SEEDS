/**
 * Enum for Message Types
 */
const MessageType = {
    PLAY_AUDIO: 'play',
    PAUSE_AUDIO: 'pause',
    RESUME_AUDIO: 'resume',
    STOP_AUDIO: 'stop',
    DISCONNECT: 'disconnect',
    RECONNECT: 'reconnect',
    PLAYBACK_STATE_UPDATES: 'playback-state-update'
  };

/**
 * Enum for Playback Status
 */
const PlaybackStatus = {
    PLAYING: "Playing",
    PAUSED: "Paused",
    STOPPED: "Stopped"
  };

module.exports = {
    MessageType,
    PlaybackStatus,
};