// src/services/controlService.js

const websocketService = require("./websocketService");
const connectionManager = require("./connectionManager");
const { MessageType } = require("../constants");

/**
 * Handles the control WebSocket connection from the Python application.
 * @param {WebSocket} ws - The control WebSocket connection.
 */
function handleControlConnection(ws) {
  console.log("Control connection established (confv2server).");

  ws.on("message", (message) => {
    console.log(`Control raw message received: ${message}`);
    try {
      // Parse the JSON string
      const parsedMessage = JSON.parse(message);
      handleControlMessage(parsedMessage);
    } catch (error) {
      console.error("Error parsing control message:", error);
    }
  });

  ws.on("close", () => {
    console.log("Control WebSocket connection closed.");
    connectionManager.removeConnection("confv2server");
  });

  ws.on("error", (error) => {
    console.error("Control WebSocket error:", error);
  });
}

/**
 * Handles incoming control messages.
 * @param {Object} controlMessage - The control message object.
 */
function handleControlMessage(controlMessage) {
  const websocketId = controlMessage.websocket_id;
  const type = controlMessage.type;
  const rawContent = controlMessage.message;
  // If the message payload is a JSON-encoded string, parse it so downstream
  // handlers receive an object. Otherwise, keep it as-is (string or object).
  let content = rawContent;
  if (typeof rawContent === "string") {
    try {
      content = JSON.parse(rawContent);
    } catch (err) {
      // not JSON — keep raw string
      content = rawContent;
    }
  }
  const serializedContent =
    typeof content === "string" ? content : JSON.stringify(content);
  console.log(
    `Control message received | websocket id: ${websocketId}; type: ${type}; message: ${serializedContent}`
  );
  switch (type) {
    case MessageType.PLAY_SYSTEM_MESSAGE:
      websocketService
        .playSystemAudioContent(websocketId, content)
        .catch((error) =>
          console.error(`Error playing audio for ID ${websocketId}:`, error)
        );
      break;
    case MessageType.PLAY_AUDIO:
      websocketService
        .playAudioContent(websocketId, content)
        .catch((error) =>
          console.error(`Error playing audio for ID ${websocketId}:`, error)
        );
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
        .catch((error) =>
          console.error(`Error seeking audio for ID ${websocketId}:`, error)
        );
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
  handleControlConnection,
};
