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
appInsights
  .setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
  .setAutoCollectConsole(true, true) // Capture console logs
  .setDistributedTracingMode(appInsights.DistributedTracingModes.AI)
  .start();

// Create HTTP server without Express
const server = http.createServer((req, res) => {
  // Parse the request URL
  const parsedUrl = url.parse(req.url, true);


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
  const audioUrl = parameters.query.audio_url;

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

  // Check if this is a control connection (confv2server or ivrv2server)
  const isControlConnection = id === "confv2server" || id === "ivrv2server";

  if (!isControlConnection && audioUrl) {
    // Defer auto-play until first audio frame from Vonage arrives.
    // This ensures TTS announcements finish before content audio starts,
    // since Vonage only bridges audio after preceding NCCO actions complete.
    ws.once("message", () => {
      console.log(`Bridge active for ID: ${id}, starting audio playback`);
      websocketService
        .playAudioContent(id, audioUrl)
        .catch((error) =>
          console.error(`Auto-play failed for ID: ${id}, URL: ${audioUrl}`, error)
        );
    });
  }

  if (isControlConnection) {
    // Control WebSocket connection
    console.log(`Control WebSocket connection established with id: ${id}`);
    controlService.handleControlConnection(ws);
  } else {

    // Forward incoming audio to the ConferenceV2 control connection
    ws.on("message", (data) => {
      const controlConn = connectionManager.getConnection("confv2server");
      if (controlConn && controlConn.ws.readyState === WebSocket.OPEN) {
        controlConn.ws.send(JSON.stringify({
          websocket_id: id,
          type: "AUDIO_DATA",
          message: Buffer.from(data).toString("base64"),
        }));
      }
    });

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
