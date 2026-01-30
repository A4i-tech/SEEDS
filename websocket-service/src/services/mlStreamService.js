const WebSocket = require("ws");

class MLStreamService {
  constructor() {
    this.mlServiceUrl = process.env.ML_SERVICE_URL || "ws://127.0.0.1:8000/stream";
    this.connections = new Map();
  }

  getMLConnection(clientId) {
    if (!this.connections.has(clientId)) {
      const wsUrl = `${this.mlServiceUrl}/${clientId}`;
      console.log(`Connecting to ML service at ${wsUrl}`);
      const ws = new WebSocket(wsUrl);

      ws.on("open", () => {
        console.log(`Connected to ML service for client ${clientId}`);
      });

      ws.on("error", (error) => {
        console.error(`ML service connection error for client ${clientId}:`, error);
      });

      ws.on("close", () => {
        console.log(`ML service connection closed for client ${clientId}`);
        this.connections.delete(clientId);
      });

      this.connections.set(clientId, ws);
    }
    return this.connections.get(clientId);
  }

  streamAudio(clientId, audioChunk) {
    const ws = this.getMLConnection(clientId);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(audioChunk);
    } else if (ws.readyState === WebSocket.CONNECTING) {
        // Optional: buffer logic could be added here
        // For now, we might drop packets or wait?
        // Let's just log
        // console.log("ML service connecting, dropping chunk");
    }
  }

  closeMLConnection(clientId) {
      const ws = this.connections.get(clientId);
      if (ws) {
          ws.close();
          this.connections.delete(clientId);
      }
  }
}

module.exports = new MLStreamService();
