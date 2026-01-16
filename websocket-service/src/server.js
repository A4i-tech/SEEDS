// src/server.js

const http = require("http");
const WebSocket = require("ws");
const url = require("url");
const appInsights = require("applicationinsights");
const websocketService = require("./services/websocketService");
const controlService = require("./services/controlService");
const connectionManager = require("./services/connectionManager");

const port = process.env.PORT || 3000;
const MAXIMUM_CONFERENCE_TIME_ALLOWED_IN_MILLISECONDS = 60 * 60 * 1000; // 1 hour in milliseconds

// Initialize Application Insights only if connection string is provided
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  appInsights
    .setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
    .setAutoCollectConsole(true, true) // Capture console logs
    .setDistributedTracingMode(appInsights.DistributedTracingModes.AI)
    .start();
} else {
  console.warn("APPLICATIONINSIGHTS_CONNECTION_STRING not set, skipping Application Insights");
}

// Create HTTP server without Express
const server = http.createServer((req, res) => {
  // Parse the request URL
  const parsedUrl = url.parse(req.url, true);

  // Health check endpoint for Azure App Service
  if (req.method === "GET" && parsedUrl.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString(),
        service: "websocket-service",
      })
    );
    return;
  }

  // Check if the request is a GET request to the root path '/'
  if (req.method === "GET" && parsedUrl.pathname === "/") {
    // Get the list of IDs of existing WebSocket connections
    const connections = connectionManager.getAllConnections();
    const ids = Array.from(connections.keys());

    // Respond with the list of IDs in JSON format
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        message: "Hello! I am SEEDS conference websocket server v1.1",
        connections: ids,
      })
    );
  } else {
    // For other paths, respond with 404 Not Found
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Not Found",
      })
    );
  }
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Handle WebSocket connections
wss.on("connection", (ws, req) => {
  const parameters = url.parse(req.url, true);
  const id = parameters.query.id;

  if (!id) {
    ws.close();
    return;
  }

  // Client WebSocket connection
  connectionManager.addConnection(id, {
    ws,
    state: { id, playing: false, position: 0, isClosed: false },
  });
  console.log(`Client WebSocket connection opened for ID: ${id}`);

  if (id === "confv2server") {
    // Control WebSocket connection
    console.log(`Control WebSocket connection established with id: ${id}`);
    controlService.handleControlConnection(ws);
  } else {
    // Start a timer to close the connection after 1 hour
    const maxConnectionTime = MAXIMUM_CONFERENCE_TIME_ALLOWED_IN_MILLISECONDS;
    const connectionTimeout = setTimeout(() => {
      console.log(`Closing WebSocket connection for ID: ${id} after 1 hour`);
      ws.close();
    }, maxConnectionTime);

    // Clear the timer when the connection is closed
    ws.on("close", () => {
      console.log(`WebSocket connection closed for ID: ${id}`);
      clearTimeout(connectionTimeout);
      const { state } = connectionManager.getConnection(id);
      connectionManager.removeConnection(id);
      if (!state.isClosed) {
        websocketService.handleAccidentalDisconnection(id);
      }
    });

    ws.on("error", (error) => {
      console.error(`WebSocket error for ID: ${id}`, error);
    });
  }
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`Received ${signal}, starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(() => {
    console.log("HTTP server closed");

    // Close all WebSocket connections
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    });

    // Close WebSocket server
    wss.close(() => {
      console.log("WebSocket server closed");
      process.exit(0);
    });
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

// Handle termination signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("unhandledRejection");
});

// Add error handler for server
server.on("error", (error) => {
  if (error.syscall !== "listen") {
    throw error;
  }

  console.error(`Server error: ${error}`);
  process.exit(1);
});
