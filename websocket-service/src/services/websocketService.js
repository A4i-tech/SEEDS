// src/services/websocketService.js

const azureBlobService = require('./azureBlobService');
const connectionManager = require('./connectionManager');
const { PlaybackStatus } = require('../constants')

/**
 * Handles play action for a WebSocket connection.
 * @param {string} id - Unique identifier for the connection.
 * @param {string} blobUrl - Azure Blob Storage URL of the audio file.
 */
async function play(id, blobUrl) {
  const connection = connectionManager.getConnection(id);

  if (!connection) throw new Error('WebSocket connection not found');

  const { ws, state } = connection;

  if (ws.readyState === ws.OPEN) {
    state.playing = true;
    state.blobUrl = blobUrl; // Store blobUrl for resuming if needed

    const { containerName, blobName } = parseBlobUrl(blobUrl);

    // Get the entire blob data
    const blobData = await azureBlobService.getBlobData(containerName, blobName);

    // Start sending audio chunks
    sendPlaybackStatus(id, PlaybackStatus.PLAYING)
    sendAudioChunks(ws, id, blobData, state);
  } else {
    throw new Error('WebSocket is not open');
  }
}

/**
 * Sends audio data over WebSocket in 320-byte chunks with 20ms delays.
 * @param {WebSocket} ws - WebSocket connection.
 * @param {Buffer} blobData - Buffer containing the entire blob data.
 * @param {Object} state - State object containing playback information.
 */
function sendAudioChunks(ws, confId, blobData, state) {
  let position = state.position || 0; // Start from last known position
  const totalLength = blobData.length;

  function sendNextChunk() {
    if (!state.playing || ws.readyState !== ws.OPEN) {
      // Stop sending if playback is paused or WebSocket is closed
      return;
    }

    if (position >= totalLength) {
      // All data has been sent
      console.log(`Audio streaming completed for ID: ${state.id}`);
      state.playing = false;
      return;
    }

    const end = Math.min(position + 320, totalLength);
    const chunk = blobData.slice(position, end);
    position = end;
    state.position = position; // Update position in state
    
    ws.send(chunk, { binary: true }, (error) => {
      if (error) {
        console.error(`Error sending data over WebSocket for ID: ${state.id}`, error);
        sendPlaybackStatus(confId, PlaybackStatus.STOPPED)
        ws.close();
        return;
      }

      // Schedule the next chunk after 20ms
      setTimeout(sendNextChunk, 20);
    });
  }

  // Start sending chunks
  sendNextChunk();
}

/**
 * Pauses the audio playback.
 * @param {string} id - Unique identifier for the connection.
 */
function pause(id) {
  const connection = connectionManager.getConnection(id);

  if (!connection) throw new Error('WebSocket connection not found');

  const { state } = connection;
  state.playing = false;
  sendPlaybackStatus(id, PlaybackStatus.PAUSED)
}

/**
 * Resumes the audio playback.
 * @param {string} id - Unique identifier for the connection.
 */
function resume(id) {
  const connection = connectionManager.getConnection(id);

  if (!connection) throw new Error('WebSocket connection not found');

  const { ws, state } = connection;
  state.playing = true;

  // Restart sending chunks from the current position
  sendPlaybackStatus(id, PlaybackStatus.PLAYING)
  sendAudioChunks(ws, state.blobData, state);
}

/**
 * Stops the audio playback and resets position.
 * @param {string} id - Unique identifier for the connection.
 */
function stop(id) {
  const connection = connectionManager.getConnection(id);

  if (!connection) throw new Error('WebSocket connection not found');

  const { state } = connection;
  state.playing = false;
  state.position = 0;
  sendPlaybackStatus(id, PlaybackStatus.STOPPED)
}

/**
 * Closes the WebSocket connection.
 * @param {string} id - Unique identifier for the connection.
 */
function closeConnection(id) {
  const connection = connectionManager.getConnection(id);

  if (!connection) throw new Error('WebSocket connection not found');

  const { ws, state } = connection;
  state.isClosed = true
  ws.close();
  sendPlaybackStatus(id, PlaybackStatus.STOPPED)
}

/**
 * Handles WebSocket disconnection.
 * @param {string} id - Unique identifier for the connection.
 */
function handleAccidentalDisconnection(id) {
  console.log(`Sending reconnection message for websocket ${id}`);
  sendReconnectionMessage(id)
}

/**
 * Parses the blob URL to extract container and blob names.
 * @param {string} blobUrl - Azure Blob Storage URL of the audio file.
 * @returns {Object} - Object containing containerName and blobName.
 */
function parseBlobUrl(blobUrl) {
  const url = new URL(blobUrl);
  const pathSegments = url.pathname.split('/');
  const containerName = pathSegments[1];
  const blobName = pathSegments.slice(2).join('/');
  return { containerName, blobName };
}

function sendPlaybackStatus(confId, status) {
  const { ws } = connectionManager.getConnection('confv2server')
  ws.send(JSON.stringify({
      "websocket_id": confId,
      "type": "playback-state-update",
      "message": status
    }), (error) => {
      if (error) {
        console.error(`Error sending data over WebSocket for ID: ${state.id}`, error);
        ws.close();
        return;
      }
    })
}

function sendReconnectionMessage(id){
  const { ws } = connectionManager.getConnection('confv2server')
  ws.send(JSON.stringify({
      "websocket_id": id,
      "type": MessageType.RECONNECT,
    }), (error) => {
      if (error) {
        console.error(`Error sending data over WebSocket for ID: ${state.id}`, error);
        ws.close();
        return;
      }
    })
}

module.exports = {
  play,
  pause,
  resume,
  stop,
  closeConnection,
  handleAccidentalDisconnection,
};
