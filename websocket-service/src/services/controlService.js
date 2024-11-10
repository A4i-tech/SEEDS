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
      const parsedMessage = JSON.parse(JSON.parse(message));
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
    case MessageType.PLAY_AUDIO:
      // Implement play functionality
      // 'message' field contains the blobUrl
      websocketService.play(websocketId, content)
        .catch((error) => console.error(`Error playing audio for ID ${websocketId}:`, error));
      break;
    case MessageType.PAUSE_AUDIO:
      websocketService.pause(websocketId);
      break;
    case MessageType.RESUME_AUDIO:
      websocketService.resume(websocketId);
      break;
    case MessageType.STOP_AUDIO:
      websocketService.stop(websocketId);
      break;
    case MessageType.DISCONNECT:
      websocketService.closeConnection(websocketId);
      break;
    default:
      console.warn(`Unknown control message type: ${type}`);
  }
}

module.exports = {
  handleControlConnection
};
