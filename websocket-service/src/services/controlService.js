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
  const correlationId = connectionManager.getConnection(id)?.state?.correlationId;
  const log = logger.withContext({ sessionId: id, clientId: id, correlationId });

  log.info(`Control connection established (${id}).`, { eventType: "control_connection_established" });

  ws.on("message", (message) => {
    log.info(`Control raw message received: ${message}`, { eventType: "control_message_received" });
    try {
      // Parse the JSON string
      const parsedMessage = JSON.parse(message);
      handleControlMessage(parsedMessage, log);
    } catch (error) {
      log.error("Error parsing control message", error, { eventType: "control_message_parse_error" });
    }
  });

  ws.on("close", (code, reason) => {
    log.info(`Control WebSocket connection closed (${id}): code=${code} reason=${reason}`, { eventType: "control_connection_closed" });
    const current = connectionManager.getConnection(id);
    if (current && current.ws === ws) {
      connectionManager.removeConnection(id);
    }
  });

  ws.on("error", (error) => {
    log.error("Control WebSocket error", error, { eventType: "control_connection_error" });
  });
}

/**
 * Handles incoming control messages.
 * @param {Object} controlMessage - The control message object.
 */
function handleControlMessage(controlMessage, log = logger) {
  const websocketId = controlMessage.websocket_id;
  const type = controlMessage.type;
  const content = controlMessage.message;
  const serializedContent = typeof content === "string" ? content : JSON.stringify(content);
  log.info(
    `Control message received | websocket id: ${websocketId}; type: ${type}; message: ${serializedContent}`,
    { eventType: "control_message_received", websocketId }
  );
  switch (type) {
    case MessageType.PLAY_SYSTEM_MESSAGE:
      log.info(`Handling play system message command for ID ${websocketId}`, { eventType: "control_command_play_system_message", websocketId });
      websocketService
        .playSystemAudioContent(websocketId, content)
        .catch((error) => log.error(`Error playing audio for ID ${websocketId}`, error, { eventType: "control_command_play_system_message", websocketId }));
      break;
    case MessageType.PLAY_AUDIO:
      log.info(`Handling play audio command for ID ${websocketId}`, { eventType: "control_command_play_audio", websocketId });
      websocketService
        .playAudioContent(websocketId, content)
        .catch((error) => log.error(`Error playing audio for ID ${websocketId}`, error, { eventType: "control_command_play_audio", websocketId }));
      break;
    case MessageType.PAUSE_AUDIO:
      log.info(`Handling pause audio command for ID ${websocketId}`, { eventType: "control_command_pause_audio", websocketId });
      websocketService.pauseAudioContent(websocketId);
      break;
    case MessageType.RESUME_AUDIO:
      log.info(`Handling resume audio command for ID ${websocketId}`, { eventType: "control_command_resume_audio", websocketId });
      websocketService.resumeAudioContent(websocketId);
      break;
    case MessageType.STOP_AUDIO:
      log.info(`Handling stop audio command for ID ${websocketId}`, { eventType: "control_command_stop_audio", websocketId });
      websocketService.stopAudioContent(websocketId);
      break;
    case MessageType.SEEK_AUDIO:
      log.info(`Handling seek audio command for ID ${websocketId}`, { eventType: "control_command_seek_audio", websocketId });
      websocketService
        .seekAudioContent(websocketId, content)
        .catch((error) => log.error(`Error seeking audio for ID ${websocketId}`, error, { eventType: "control_command_seek_audio", websocketId }));
      break;
    case MessageType.SET_SPEED:
      log.info(`Handling set speed command for ID ${websocketId}`, { eventType: "control_command_set_speed", websocketId });
      try {
        websocketService.setPlaybackSpeed(websocketId, parseFloat(content));
      } catch (error) {
        log.error(`Error setting speed for ID ${websocketId}`, error, { eventType: "control_command_set_speed", websocketId });
      }
      break;
    case MessageType.DISCONNECT:
      log.info(`Handling disconnect command for ID ${websocketId}`, { eventType: "control_command_disconnect", websocketId });
      websocketService.closeConnection(websocketId);
      break;
    case MessageType.HEARTBEAT:
      log.warn("Heartbeat message received from conf server", { eventType: "control_command_heartbeat" });
      break;
    default:
      log.warn(`Unknown control message type: ${type}`, { eventType: "control_command_unknown", websocketId });
  }
}

module.exports = {
  handleControlConnection,
};
