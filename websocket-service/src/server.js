// src/server.js

const http = require('http');
const WebSocket = require('ws');
const app = require('./app');
const url = require('url');
const websocketService = require('./services/websocketService');
const connectionManager = require('./services/connectionManager');

const port = process.env.PORT || 3000;

const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  // Extract ID from query parameters
  const parameters = url.parse(req.url, true);
  const id = parameters.query.id;

  if (!id) {
    ws.close();
    return;
  }

  // Add connection to the manager
  connectionManager.addConnection(id, { ws, state: { id, playing: false, position: 0 } });

  console.log(`WebSocket connection opened for ID: ${id}`);

  ws.on('close', () => {
    console.log(`WebSocket connection closed for ID: ${id}`);
    websocketService.handleDisconnection(id);
  });
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
