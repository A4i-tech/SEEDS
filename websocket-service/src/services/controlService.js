// src/services/controlService.js

const websocketService = require('./websocketService');

/**
 * Handles the control WebSocket connection from the Python application.
 * @param {WebSocket} ws - The control WebSocket connection.
 */
function handleControlConnection(ws) {
  console.log('Control connection established.');

  ws.on('message', (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      handleControlMessage(parsedMessage);
    } catch (error) {
      console.error('Error parsing control message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Control WebSocket connection closed.');
  });

  ws.on('error', (error) => {
    console.error('Control WebSocket error:', error);
  });
}

/**
 * Handles incoming control messages.
 * @param {Object} message - The control message object.
 */
function handleControlMessage(message) {
  const { websocket_id, type, message: content } = message;

  switch (type) {
    case 'play':
      // Implement play functionality
      // 'message' field contains the blobUrl
      websocketService.play(websocket_id, content)
        .catch((error) => console.error(`Error playing audio for ID ${websocket_id}:`, error));
      break;
    case 'pause':
      websocketService.pause(websocket_id);
      break;
    case 'resume':
      websocketService.resume(websocket_id);
      break;
    case 'stop':
      websocketService.stop(websocket_id);
      break;
    case 'disconnect':
      websocketService.closeConnection(websocket_id);
      break;
    default:
      console.warn(`Unknown control message type: ${type}`);
  }
}

module.exports = {
  handleControlConnection,
};
