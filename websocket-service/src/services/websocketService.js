// src/services/websocketService.js

const azureBlobService = require("./azureBlobService");
const connectionManager = require("./connectionManager");
const { PlaybackStatus } = require("../constants");

const AUDIO_BYTES_PER_SECOND = 16000; // 320 bytes * 50 chunks per second
const CHUNK_BYTES = 320;

/**
 * Resamples 16-bit LE PCM audio from sourceSamples to targetSamples using
 * linear interpolation. Used to implement playback speed changes: reading
 * more source samples and resampling down speeds up, fewer and resampling
 * up slows down.
 */
function resampleChunk(sourceBuffer, targetBytes) {
  const sourceSamples = sourceBuffer.length / 2;
  const targetSamples = targetBytes / 2;
  if (sourceSamples === targetSamples) return sourceBuffer;

  const out = Buffer.alloc(targetBytes);
  const ratio = sourceSamples / targetSamples;

  for (let i = 0; i < targetSamples; i++) {
    const srcPos = i * ratio;
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;

    const s0 = sourceBuffer.readInt16LE(srcIdx * 2);
    const s1 =
      srcIdx + 1 < sourceSamples
        ? sourceBuffer.readInt16LE((srcIdx + 1) * 2)
        : s0;

    const val = Math.round(s0 + frac * (s1 - s0));
    out.writeInt16LE(Math.max(-32768, Math.min(32767, val)), i * 2);
  }
  return out;
}

/**
 * Handles play action for audio content (teacher's choice).
 * @param {string} id - Unique identifier for the connection.
 * @param {string} blobUrl - Azure Blob Storage URL of the audio content.
 */
async function playAudioContent(id, blobUrl) {
  const connection = connectionManager.getConnection(id);

  if (!connection) throw new Error("WebSocket connection not found");

  const { ws, state } = connection;

  if (ws.readyState === ws.OPEN) {
    if (!state.audioContentState) {
      state.audioContentState = {};
    }

    // Stop existing audio content playback
    state.audioContentState.playing = false;

    // Increment playbackId to invalidate any previous playback loops
    state.playbackId = (state.playbackId || 0) + 1;
    const currentPlaybackId = state.playbackId;

    // Reset audio content state
    state.audioContentState = {
      blobUrl,
      position: 0,
      playing: true,
      speed: 1.0,
    };

    // Discard old audio content blobData
    state.audioContentState.blobData = null;

    console.log(`playAudioContent called for ID: ${id}, Blob URL: ${blobUrl}`);

    // If no system audio content is playing, start playing audio content
    if (!state.currentAudioType || state.currentAudioType === "audioContent") {
      state.currentAudioType = "audioContent";
      const { containerName, blobName } = parseBlobUrl(blobUrl);
      const blobData = await azureBlobService.getBlobData(containerName, blobName);
      console.log(`Blob downloaded for ID: ${id}, size: ${blobData ? blobData.length : 'null'} bytes`);
      state.audioContentState.blobData = blobData;
      state.audioContentState.durationSeconds = blobData ? blobData.length / AUDIO_BYTES_PER_SECOND : 0;

      sendPlaybackStatus(id, PlaybackStatus.PLAYING);
      console.log(`Starting audio content playback for ID: ${id}`);
      sendAudioContentChunks(ws, id, blobData, state, currentPlaybackId);
    } else {
      // Keep audio content in paused state
      sendPlaybackStatus(id, PlaybackStatus.PAUSED);
      console.log(
        `Audio content playback paused for ID: ${id} due to system audio content in progress`
      );
    }
  } else {
    throw new Error("WebSocket is not open");
  }
}

/**
 * Handles play action for system audio content (system-generated messages).
 * @param {string} id - Unique identifier for the connection.
 * @param {string} blobUrl - Azure Blob Storage URL of the system audio content.
 */
async function playSystemAudioContent(id, blobUrl) {
  const connection = connectionManager.getConnection(id);

  if (!connection) throw new Error("WebSocket connection not found");

  const { ws, state } = connection;

  if (ws.readyState === ws.OPEN) {
    if (!state.systemAudioContentQueue) {
      state.systemAudioContentQueue = [];
    }

    // Enqueue system audio content
    state.systemAudioContentQueue.push({ blobUrl });
    console.log(`System audio content queued for ID: ${id}, Blob URL: ${blobUrl}`);

    if (state.currentAudioType === "systemAudioContent") {
      // Do nothing; it will play after the current system audio content
      console.log(`System audio content already playing for ID: ${id}, new content will be queued`);
    } else {
      // Pause audio content if playing
      if (
        state.currentAudioType === "audioContent" &&
        state.audioContentState &&
        state.audioContentState.playing
      ) {
        state.audioContentState.playing = false;
        sendPlaybackStatus(id, PlaybackStatus.PAUSED);
        console.log(`Audio content playback paused for ID: ${id} to play system audio content`);
      }

      // Set currentAudioType to 'systemAudioContent' and start playing next system audio content
      state.currentAudioType = "systemAudioContent";
      playNextSystemAudioContent(ws, id, state);
    }
  } else {
    throw new Error("WebSocket is not open");
  }
}

/**
 * Plays the next system audio content from the queue.
 * @param {WebSocket} ws - WebSocket connection.
 * @param {string} id - Unique identifier for the connection.
 * @param {Object} state - State object containing playback information.
 */
async function playNextSystemAudioContent(ws, id, state) {
  if (state.systemAudioContentQueue.length === 0) {
    // No more system audio content; do not resume audio content
    console.log(`No more system audio content in queue for ID: ${id}`);
    state.currentAudioType = null; // Set currentAudioType to null indicating no audio is playing
    return;
  }

  const nextSystemAudioContent = state.systemAudioContentQueue.shift();
  const { blobUrl } = nextSystemAudioContent;
  console.log(`Starting system audio content playback for ID: ${id}, Blob URL: ${blobUrl}`);

  const { containerName, blobName } = parseBlobUrl(blobUrl);
  const blobData = await azureBlobService.getBlobData(containerName, blobName);

  // Start playing system audio content
  // Note: We do NOT send playback status updates for system audio content
  sendSystemAudioContentChunks(ws, id, blobData, state);
}

/**
 * Sends audio content data over WebSocket in 320-byte chunks with 20ms delays.
 * @param {WebSocket} ws - WebSocket connection.
 * @param {string} id - Unique identifier for the connection.
 * @param {Buffer} blobData - Buffer containing the entire blob data.
 * @param {Object} state - State object containing playback information.
 * @param {number} playbackId - Unique identifier for the playback session.
 */
function sendAudioContentChunks(ws, id, blobData, state, playbackId) {
  let position = state.audioContentState.position || 0;
  const totalLength = blobData.length;
  let chunksSinceLastReport = 0;
  const REPORT_INTERVAL_CHUNKS = 250; // ~5 seconds at 20ms/chunk

  function sendNextChunk() {
    // Check if playbackId matches and playback is still active
    if (
      ws.readyState !== ws.OPEN ||
      state.playbackId !== playbackId ||
      state.currentAudioType !== "audioContent" ||
      !state.audioContentState.playing
    ) {
      // Stop sending if playback is paused, stopped, or overridden
      console.log(`Stopping audio content streaming for ID: ${id}`);
      return;
    }

    if (position >= totalLength) {
      // Audio content streaming completed
      console.log(`Audio content streaming completed for ID: ${id}`);
      state.audioContentState.playing = false;
      state.currentAudioType = null; // Set to null since playback has completed
      sendPlaybackStatus(id, PlaybackStatus.STOPPED); // Send playback status when audio content stops
      return;
    }

    const speed = state.audioContentState.speed || 1.0;
    const sourceBytes = Math.min(
      Math.round(CHUNK_BYTES * speed),
      totalLength - position
    );
    // Ensure sourceBytes is even (16-bit samples = 2 bytes each)
    const alignedSourceBytes = sourceBytes & ~1;
    if (alignedSourceBytes === 0) {
      // Remaining data too small to form a sample; treat as end of file
      console.log(`Audio content streaming completed for ID: ${id}`);
      state.audioContentState.playing = false;
      state.currentAudioType = null;
      sendPlaybackStatus(id, PlaybackStatus.STOPPED);
      return;
    }

    const sourceSlice = blobData.slice(position, position + alignedSourceBytes);
    const chunk =
      speed === 1.0 && alignedSourceBytes === CHUNK_BYTES
        ? sourceSlice
        : resampleChunk(sourceSlice, CHUNK_BYTES);
    position += alignedSourceBytes;
    state.audioContentState.position = position;
    chunksSinceLastReport++;

    // Send periodic position/duration updates (~every 5 seconds)
    if (chunksSinceLastReport >= REPORT_INTERVAL_CHUNKS) {
      chunksSinceLastReport = 0;
      sendPlaybackStatus(id, PlaybackStatus.PLAYING);
    }

    ws.send(chunk, { binary: true }, (error) => {
      if (error) {
        console.error(`Error sending data over WebSocket for ID: ${id}`, error);
        sendPlaybackStatus(id, PlaybackStatus.STOPPED);
        ws.close();
        return;
      }

      setTimeout(sendNextChunk, 20);
    });
  }

  // Start sending chunks
  console.log(`Sending audio content chunks for ID: ${id}`);
  sendNextChunk();
}

/**
 * Sends system audio content data over WebSocket in 320-byte chunks with 20ms delays.
 * @param {WebSocket} ws - WebSocket connection.
 * @param {string} id - Unique identifier for the connection.
 * @param {Buffer} blobData - Buffer containing the entire blob data.
 * @param {Object} state - State object containing playback information.
 */
function sendSystemAudioContentChunks(ws, id, blobData, state) {
  const totalLength = blobData.length;
  let position = 0;

  function sendNextChunk() {
    // Check if WebSocket is open and currentAudioType is 'systemAudioContent'
    if (ws.readyState !== ws.OPEN || state.currentAudioType !== "systemAudioContent") {
      // Stop sending if overridden or WebSocket closed
      console.log(`Stopping system audio content streaming for ID: ${id}`);
      return;
    }

    if (position >= totalLength) {
      // System audio content streaming completed
      console.log(`System audio content streaming completed for ID: ${id}`);
      // Play next system audio content or set currentAudioType to null
      playNextSystemAudioContent(ws, id, state);
      return;
    }

    const end = Math.min(position + 320, totalLength);
    const chunk = blobData.slice(position, end);
    position = end;

    ws.send(chunk, { binary: true }, (error) => {
      if (error) {
        console.error(`Error sending data over WebSocket for ID: ${id}`, error);
        ws.close();
        return;
      }

      // Schedule the next chunk after 20ms
      setTimeout(sendNextChunk, 20);
    });
  }

  // Start sending chunks
  console.log(`Sending system audio content chunks for ID: ${id}`);
  sendNextChunk();
}

/**
 * Pauses the audio content playback.
 * @param {string} id - Unique identifier for the connection.
 */
function pauseAudioContent(id) {
  const connection = connectionManager.getConnection(id);

  if (!connection) throw new Error("WebSocket connection not found");

  const { state } = connection;

  if (
    state.currentAudioType === "audioContent" &&
    state.audioContentState &&
    state.audioContentState.playing
  ) {
    state.audioContentState.playing = false;
    sendPlaybackStatus(id, PlaybackStatus.PAUSED);
    console.log(`Audio content playback paused for ID: ${id}`);
  }
}

/**
 * Resumes the audio content playback.
 * @param {string} id - Unique identifier for the connection.
 */
function resumeAudioContent(id) {
  const connection = connectionManager.getConnection(id);

  if (!connection) throw new Error("WebSocket connection not found");

  const { ws, state } = connection;

  if (
    state.currentAudioType === "systemAudioContent" ||
    (state.systemAudioContentQueue && state.systemAudioContentQueue.length > 0)
  ) {
    // Ignore resume request; system audio content is playing or queued
    console.log(`Resume request ignored for ID: ${id}; system audio content is playing or queued`);
    return;
  }

  if (state.audioContentState && state.audioContentState.blobData) {
    state.playbackId = (state.playbackId || 0) + 1;
    const currentPlaybackId = state.playbackId;

    state.currentAudioType = "audioContent";
    state.audioContentState.playing = true;
    sendPlaybackStatus(id, PlaybackStatus.PLAYING);
    console.log(`Resuming audio content playback for ID: ${id}`);
    sendAudioContentChunks(ws, id, state.audioContentState.blobData, state, currentPlaybackId);
  } else {
    throw new Error("No audio content data to resume");
  }
}

/**
 * Applies a signed delta offset and restarts playback from the new position when possible.
 * @param {string} id - Unique identifier for the connection.
 * @param {Object} seekPayload - Payload containing deltaSeconds.
 */
async function seekAudioContent(id, seekPayload) {
  const connection = connectionManager.getConnection(id);

  if (!connection) throw new Error("WebSocket connection not found");

  const { ws, state } = connection;
  const audioState = state.audioContentState;

  if (!audioState || !audioState.blobData) {
    throw new Error("No audio content data to seek");
  }
  const seekTarget = extractSeekTarget(seekPayload);
  console.log(
    `Seek request received for ID: ${id}; ${seekTarget.type}: ${seekTarget.value}; currentPosition: ${audioState.position}`
  );
  const totalLength = audioState.blobData.length;
  const currentPosition = audioState.position || 0;
  const targetPosition =
    seekTarget.type === "absolute"
      ? clampPosition(Math.trunc(seekTarget.value * AUDIO_BYTES_PER_SECOND), totalLength)
      : clampPosition(
          Math.trunc(currentPosition + seekTarget.value * AUDIO_BYTES_PER_SECOND),
          totalLength
        );

  audioState.position = targetPosition;

  if (state.currentAudioType === "systemAudioContent") {
    // Acknowledge the seek but leave playback paused until announcements finish.
    audioState.playing = false;
    console.log(
      `Seek for ID: ${id} applied while system audio playing; new buffered position: ${targetPosition}`
    );
    return;
  }

  state.playbackId = (state.playbackId || 0) + 1;
  const currentPlaybackId = state.playbackId;
  state.currentAudioType = "audioContent";
  audioState.playing = true;

  sendPlaybackStatus(id, PlaybackStatus.PLAYING);
  console.log(
    `Restarting audio stream after seek for ID: ${id}; playbackId: ${currentPlaybackId}; startByte: ${targetPosition}`
  );
  sendAudioContentChunks(ws, id, audioState.blobData, state, currentPlaybackId);
}

/**
 * Changes the playback speed and restarts streaming from the current position.
 * @param {string} id - Unique identifier for the connection.
 * @param {number} speed - Playback speed multiplier (e.g. 0.75, 1.0, 1.5, 2.0).
 */
function setPlaybackSpeed(id, speed) {
  const connection = connectionManager.getConnection(id);
  if (!connection) throw new Error("WebSocket connection not found");

  const { ws, state } = connection;
  const audioState = state.audioContentState;

  if (!audioState || !audioState.blobData) {
    throw new Error("No audio content data to change speed");
  }

  const clampedSpeed = Math.max(0.5, Math.min(3.0, speed));
  audioState.speed = clampedSpeed;
  console.log(`Playback speed set to ${clampedSpeed}x for ID: ${id}`);

  if (state.currentAudioType === "audioContent" && audioState.playing) {
    state.playbackId = (state.playbackId || 0) + 1;
    const currentPlaybackId = state.playbackId;

    sendPlaybackStatus(id, PlaybackStatus.PLAYING);
    sendAudioContentChunks(ws, id, audioState.blobData, state, currentPlaybackId);
  } else {
    sendPlaybackStatus(id, audioState.playing ? PlaybackStatus.PLAYING : PlaybackStatus.PAUSED);
  }
}

/**
 * Stops the audio content playback and resets position.
 * @param {string} id - Unique identifier for the connection.
 */
function stopAudioContent(id) {
  const connection = connectionManager.getConnection(id);

  if (!connection) throw new Error("WebSocket connection not found");

  const { state } = connection;

  if (state.audioContentState) {
    state.audioContentState.playing = false;
    state.audioContentState.position = 0;
    sendPlaybackStatus(id, PlaybackStatus.STOPPED);
    state.currentAudioType = null; // Set currentAudioType to null since playback is stopped
    console.log(`Audio content playback stopped for ID: ${id}`);
  }
}

/**
 * Closes the WebSocket connection.
 * @param {string} id - Unique identifier for the connection.
 */
function closeConnection(id) {
  const connection = connectionManager.getConnection(id);

  if (!connection) throw new Error("WebSocket connection not found");

  const { ws, state } = connection;
  state.isClosed = true;
  ws.close();
  sendPlaybackStatus(id, PlaybackStatus.STOPPED);
  console.log(`WebSocket connection closed for ID: ${id}`);
}

/**
 * Handles WebSocket disconnection.
 * @param {string} id - Unique identifier for the connection.
 */
function handleAccidentalDisconnection(id) {
  console.log(`Sending reconnection message for WebSocket ID: ${id}`);
  sendReconnectionMessage(id);
}

/**
 * Parses the blob URL to extract container and blob names.
 * @param {string} blobUrl - Azure Blob Storage URL of the audio file.
 * @returns {Object} - Object containing containerName and blobName.
 */
function parseBlobUrl(blobUrl) {
  const url = new URL(blobUrl);
  const pathSegments = url.pathname.split("/");
  const containerName = pathSegments[1];
  const blobName = pathSegments.slice(2).join("/");
  return { containerName, blobName };
}

function sendPlaybackStatus(id, status) {
  try {
    const confv2Conn = connectionManager.getConnection("confv2server");
    if (!confv2Conn || !confv2Conn.ws) {
      console.error(`sendPlaybackStatus [${id}]: No confv2server connection available`);
      return;
    }
    const { ws } = confv2Conn;
    const conn = connectionManager.getConnection(id);
    const audioState = conn?.state?.audioContentState;

    const positionSec = audioState
      ? parseFloat(((audioState.position || 0) / AUDIO_BYTES_PER_SECOND).toFixed(2))
      : 0;
    const durationSec = audioState?.blobData
      ? parseFloat((audioState.blobData.length / AUDIO_BYTES_PER_SECOND).toFixed(2))
      : (audioState?.durationSeconds || 0);

    const payload = {
      websocket_id: id,
      type: "playback-state-update",
      message: status,
      position_seconds: positionSec,
      duration_seconds: durationSec,
      speed: audioState?.speed || 1.0,
    };
    console.log(`sendPlaybackStatus [${id}]: status=${status}, position=${payload.position_seconds}, duration=${payload.duration_seconds}, speed=${payload.speed}, blobData=${audioState?.blobData ? audioState.blobData.length + ' bytes' : 'null'}`);

    ws.send(
      JSON.stringify(payload),
      (error) => {
        if (error) {
          console.error(`Error sending playback status over WebSocket for ID: ${id}`, error);
        }
      }
    );
  } catch (err) {
    console.error(`sendPlaybackStatus [${id}] CRASHED:`, err);
  }
}

function sendReconnectionMessage(id) {
  const { ws } = connectionManager.getConnection("confv2server");
  ws.send(
    JSON.stringify({
      websocket_id: id,
      type: "RECONNECT",
    }),
    (error) => {
      if (error) {
        console.error(`Error sending data over WebSocket for ID: ${id}`, error);
        ws.close();
        return;
      }
    }
  );
}

function extractSeekTarget(payload) {
  if (!payload) {
    throw new Error("Seek payload is required");
  }
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (parsed.positionSeconds !== undefined || parsed.position_seconds !== undefined) {
    const pos = Number(parsed.positionSeconds ?? parsed.position_seconds);
    if (!Number.isFinite(pos) || pos < 0) {
      throw new Error("Seek payload positionSeconds must be a non-negative finite number");
    }
    return { type: "absolute", value: pos };
  }
  if ((parsed.deltaSeconds ?? parsed.delta_seconds) !== undefined) {
    const delta = Number(parsed.deltaSeconds ?? parsed.delta_seconds);
    if (!Number.isFinite(delta)) {
      throw new Error("Seek payload deltaSeconds must be a finite number");
    }
    return { type: "relative", value: delta };
  }
  throw new Error("Seek payload must include deltaSeconds or positionSeconds");
}

function clampPosition(position, totalLength) {
  const upperBound = typeof totalLength === "number" ? totalLength : 0;
  if (upperBound <= 0) {
    return 0;
  }
  if (position < 0) {
    return 0;
  }
  if (position > upperBound) {
    return upperBound;
  }
  return position;
}

module.exports = {
  playAudioContent,
  playSystemAudioContent,
  pauseAudioContent,
  resumeAudioContent,
  seekAudioContent,
  setPlaybackSpeed,
  stopAudioContent,
  closeConnection,
  handleAccidentalDisconnection,
};
