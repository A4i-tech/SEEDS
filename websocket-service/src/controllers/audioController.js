// src/controllers/audioController.js

const websocketService = require('../services/websocketService');

// Start playing audio for a given connection ID and blob URL
async function play(req, res) {
  const { id } = req.params;
  const { blobUrl } = req.body;

  try {
    await websocketService.play(id, blobUrl);
    res.status(200).send({
        "response": `Playing audio for WebSocket ID: ${id}`
    });
  } catch (error) {
    res.status(404).send(error.message);
  }
}

// Pause the audio playback
function pause(req, res) {
  const { id } = req.params;

  try {
    websocketService.pause(id);
    res.status(200).send(`Paused audio for WebSocket ID: ${id}`);
  } catch (error) {
    res.status(404).send(error.message);
  }
}

// Resume the audio playback
function resume(req, res) {
  const { id } = req.params;

  try {
    websocketService.resume(id);
    res.status(200).send(`Resumed audio for WebSocket ID: ${id}`);
  } catch (error) {
    res.status(404).send(error.message);
  }
}

// Stop the audio playback and reset position
function stop(req, res) {
  const { id } = req.params;

  try {
    websocketService.stop(id);
    res.status(200).send(`Stopped audio for WebSocket ID: ${id}`);
  } catch (error) {
    res.status(404).send(error.message);
  }
}

// Close the WebSocket connection
function closeConnection(req, res) {
  const { id } = req.params;

  try {
    websocketService.closeConnection(id);
    res.status(200).send(`Closed WebSocket connection for ID: ${id}`);
  } catch (error) {
    res.status(404).send(error.message);
  }
}

module.exports = {
  play,
  pause,
  resume,
  stop,
  closeConnection,
};
