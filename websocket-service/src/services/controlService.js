// src/services/controlService.js

const websocketService = require('./websocketService');
const connectionManager = require('./connectionManager');
const { MessageType } = require('../constants')

/**
 * Handles the control WebSocket connection from the Python application.
 * @param {WebSocket} ws - The control WebSocket connection.
 */
function handleControlConnection(ws) {
  console.log('Control connection established.');

  ws.on('message', (message) => {
    try {
      // Parse the JSON string
      const parsedMessage = JSON.parse(message);
      handleControlMessage(parsedMessage);
    } catch (error) {
      console.error('Error parsing control message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Control WebSocket connection closed.');
    connectionManager.removeConnection('confv2server')
  });

  ws.on('error', (error) => {
    console.error('Control WebSocket error:', error);
  });
}

/**
 * Handles incoming control messages.
 * @param {Object} controlMessage - The control message object.
 */
function handleControlMessage(controlMessage) {
  const websocketId = controlMessage.websocket_id;
  const type = controlMessage.type;
  const content = controlMessage.message;
  console.log(`websocket id: ${websocketId}; type: ${type}; message: ${content}`)
  switch (type) {
    case MessageType.PLAY_SYSTEM_MESSAGE:
      console.log(`Attempting to play system audio for ID: ${websocketId}`);
      websocketService.playSystemAudioContent(websocketId, content)
        .catch((error) => console.error(`Error playing system audio for ID ${websocketId}:`, error));
      break;
    case MessageType.PLAY_AUDIO:
      console.log(`Attempting to play audio content for ID: ${websocketId}`);

      // Check if connection exists, if not create a mock one for testing
      const connection = connectionManager.getConnection(websocketId);
      if (!connection) {
        console.log(`No connection found for ID ${websocketId}, creating mock connection for testing`);
        // Create a mock WebSocket connection for testing purposes
        const mockWs = {
          readyState: 1, // OPEN state
          OPEN: 1,
          send: (data) => {
            console.log(`Mock WebSocket would send audio data for conference ${websocketId}`);
            console.log(`Audio data size: ${data.length} bytes`);
          },
          close: () => {
            console.log(`Mock WebSocket closed for conference ${websocketId}`);
          }
        };

        connectionManager.addConnection(websocketId, {
          ws: mockWs,
          state: { id: websocketId, playing: false, position: 0, isClosed: false }
        });

        console.log(`Mock WebSocket connection created for conference ID: ${websocketId}`);
      }

      websocketService.playAudioContent(websocketId, content)
        .catch((error) => console.error(`Error playing audio content for ID ${websocketId}:`, error));
      break;
    case MessageType.PAUSE_AUDIO:
      websocketService.pauseAudioContent(websocketId);
      break;
    case MessageType.RESUME_AUDIO:
      websocketService.resumeAudioContent(websocketId);
      break;
    case MessageType.STOP_AUDIO:
      websocketService.stopAudioContent(websocketId);
      break;
    case MessageType.DISCONNECT:
      websocketService.closeConnection(websocketId);
      break;
    case MessageType.HEARTBEAT:
      console.warn("Heartbeat message received from conf server");
      break;
    default:
      console.warn(`Unknown control message type: ${type}`);
  }
}

module.exports = {
  handleControlConnection
};
