// src/server.js

const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const websocketService = require('./services/websocketService');
const controlService = require('./services/controlService');
const connectionManager = require('./services/connectionManager');

const port = process.env.PORT || 3000;

// Create HTTP server without Express
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    data: 'Hello! I am SEEDS conference websocket server',
  }));
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  const parameters = url.parse(req.url, true);
  const id = parameters.query.id;

  if (!id) {
    ws.close();
    return;
  }

  if (id === 'confv2server') {
    // Control WebSocket connection
    console.log(`Control WebSocket connection established with id: ${id}`);
    controlService.handleControlConnection(ws);
  } else {
    // Client WebSocket connection
    connectionManager.addConnection(id, { ws, state: { id, playing: false, position: 0 } });
    console.log(`Client WebSocket connection opened for ID: ${id}`);

    ws.on('close', () => {
      console.log(`WebSocket connection closed for ID: ${id}`);
      websocketService.handleDisconnection(id);
    });
  }
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
