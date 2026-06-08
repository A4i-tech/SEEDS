// src/services/controlService.js

const logger = require("../logger");
const websocketService = require("./websocketService");
const connectionManager = require("./connectionManager");
const { MessageType } = require("../constants");

/**
 * Handles the control WebSocket connection from the Python application.
 * @param {WebSocket} ws - The control WebSocket connection.
 */
function handleControlConnection(ws, id) {
  logger.info(`Control connection established (${id}).`);

  ws.on("message", (message) => {
    logger.info(`Control raw message received: ${message}`);
    try {
      // Parse the JSON string
      const parsedMessage = JSON.parse(message);
      handleControlMessage(parsedMessage);
    } catch (error) {
      logger.error("Error parsing control message", error);
    }
  });

  ws.on("close", (code, reason) => {
    logger.info(`Control WebSocket connection closed (${id}): code=${code} reason=${reason}`);
    const current = connectionManager.getConnection(id);
    if (current && current.ws === ws) {
      connectionManager.removeConnection(id);
    }
  });

  ws.on("error", (error) => {
    logger.error("Control WebSocket error", error);
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
  const serializedContent = typeof content === "string" ? content : JSON.stringify(content);
  logger.info(
    `Control message received | websocket id: ${websocketId}; type: ${type}; message: ${serializedContent}`
  );
  switch (type) {
    case MessageType.PLAY_SYSTEM_MESSAGE:
      websocketService
        .playSystemAudioContent(websocketId, content)
        .catch((error) => logger.error(`Error playing audio for ID ${websocketId}`, error));
      break;
    case MessageType.PLAY_AUDIO:
      websocketService
        .playAudioContent(websocketId, content)
        .catch((error) => logger.error(`Error playing audio for ID ${websocketId}`, error));
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
    case MessageType.SEEK_AUDIO:
      websocketService
        .seekAudioContent(websocketId, content)
        .catch((error) => logger.error(`Error seeking audio for ID ${websocketId}`, error));
      break;
    case MessageType.SET_SPEED:
      try {
        websocketService.setPlaybackSpeed(websocketId, parseFloat(content));
      } catch (error) {
        logger.error(`Error setting speed for ID ${websocketId}`, error);
      }
      break;
    case MessageType.DISCONNECT:
      websocketService.closeConnection(websocketId);
      break;
    case MessageType.HEARTBEAT:
      logger.warn("Heartbeat message received from conf server");
      break;
    default:
      logger.warn(`Unknown control message type: ${type}`);
  }
}

module.exports = {
  handleControlConnection,
};
