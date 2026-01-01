// src/services/websocketService.js

const azureBlobService = require("./azureBlobService");
const connectionManager = require("./connectionManager");
const { PlaybackStatus } = require("../constants");

const AUDIO_BYTES_PER_SECOND = 16000; // 320 bytes * 50 chunks per second

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
    };

    // Discard old audio content blobData
    state.audioContentState.blobData = null;

    console.log(`playAudioContent called for ID: ${id}, Blob URL: ${blobUrl}`);

    // If no system audio content is playing, start playing audio content
    if (!state.currentAudioType || state.currentAudioType === "audioContent") {
      state.currentAudioType = "audioContent";
      const { containerName, blobName } = parseBlobUrl(blobUrl);
      const blobData = await azureBlobService.getBlobData(containerName, blobName);
      state.audioContentState.blobData = blobData;

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

    const end = Math.min(position + 320, totalLength);
    const chunk = blobData.slice(position, end);
    position = end;
    state.audioContentState.position = position; // Update position in state

    ws.send(chunk, { binary: true }, (error) => {
      if (error) {
        console.error(`Error sending data over WebSocket for ID: ${id}`, error);
        sendPlaybackStatus(id, PlaybackStatus.STOPPED);
        ws.close();
        return;
      }

      // Schedule the next chunk after 20ms
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
  console.log(`this is current audio state ${JSON.stringify(audioState)}`);
  const deltaSeconds = extractDeltaSeconds(seekPayload);
  console.log(
    `Seek request received for ID: ${id}; deltaSeconds: ${deltaSeconds}; currentPosition: ${audioState.position}`
  );
  const totalLength = audioState.blobData.length;
  const currentPosition = audioState.position || 0;
  const targetPosition = clampPosition(
    Math.trunc(currentPosition + deltaSeconds * AUDIO_BYTES_PER_SECOND),
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
  const { ws } = connectionManager.getConnection("confv2server");
  ws.send(
    JSON.stringify({
      websocket_id: id,
      type: "playback-state-update",
      message: status,
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

function extractDeltaSeconds(payload) {
  if (!payload || (payload.deltaSeconds ?? payload.delta_seconds) === undefined) {
    throw new Error("Seek payload must include deltaSeconds");
  }
  const delta = Number(payload.deltaSeconds ?? payload.delta_seconds);
  if (!Number.isFinite(delta)) {
    throw new Error("Seek payload deltaSeconds must be a finite number");
  }
  return delta;
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
  stopAudioContent,
  closeConnection,
  handleAccidentalDisconnection,
};
