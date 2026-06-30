# WebSocket Audio Streaming Service

[![WebSocket Service Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/a4i-architect/dcc3788d90884aed5ef3bfc393978480/raw/websocket-service-coverage.json)](https://github.com/A4i-tech/SEEDS/actions/workflows/websocket-service-main.yml)

This module provides a WebSocket-based audio streaming service that streams audio content (teacher's choice) and system-generated audio messages from Azure Blob Storage. It supports operations such as play, pause, resume, stop, and handles WebSocket disconnections.

## Features

- **Stream Teacher's Choice Audio Content:** Play audio files selected by teachers.
- **Stream System Audio Content:** Queue and play system-generated audio messages with priority over teacher's choice content.
- **Pause and Resume:** Pause teacher's choice content during system audio playback; can be manually resumed afterward.
- **Chunked Streaming:** Audio is streamed in 320-byte chunks with a 20ms delay for smooth playback.
- **State Management:** Tracks playback state, position, and active audio type per connection.
- **Error Handling:** Manages WebSocket errors and disconnections gracefully.

## Operations

### 1. Play Teacher's Choice Audio Content

Streams an audio file chosen by the teacher. Pauses if system audio is playing.

**Method:** `playAudioContent(id, blobUrl)`

- **Parameters:**
  - `id` (string): Unique identifier for the WebSocket connection.
  - `blobUrl` (string): Azure Blob Storage URL of the audio file.
- **Behavior:**
  - Stops any currently playing teacher's choice content.
  - Starts streaming the new audio content unless system audio is playing.
  - If system audio content is active, it pauses the audio content. The audio content will remain paused even after system audio content finishes; it must be resumed manually using `resumeAudioContent`.

---

### 2. Play System Audio Content

Streams system-generated audio messages, which take precedence over teacher's choice content.

**Method:** `playSystemAudioContent(id, blobUrl)`

- **Parameters:**
  - `id` (string): Unique identifier for the WebSocket connection.
  - `blobUrl` (string): Azure Blob Storage URL of the system audio file.
- **Behavior:**
  - Pauses teacher's choice content if it is currently playing.
  - Queues system audio messages and plays them sequentially.
  - Does not send playback status updates for system audio content.

---

### 3. Pause Teacher's Choice Audio Content

Pauses the playback of teacher's choice content.

**Method:** `pauseAudioContent(id)`

- **Parameters:**
  - `id` (string): Unique identifier for the WebSocket connection.
- **Behavior:**
  - Pauses playback of the teacher's choice content and updates the playback state.
  - Sends a playback status update indicating the content is paused.

---

### 4. Resume Teacher's Choice Audio Content

Resumes paused teacher's choice content if no system audio is active.

**Method:** `resumeAudioContent(id)`

- **Parameters:**
  - `id` (string): Unique identifier for the WebSocket connection.
- **Behavior:**
  - Resumes playback if no system audio content is playing or queued.
  - If system audio content is active or queued, the resume request is ignored.
  - Does not automatically resume after system audio content finishes; `resumeAudioContent` must be called explicitly.

---

### 5. Stop Teacher's Choice Audio Content

Stops playback of teacher's choice content and resets the playback state.

**Method:** `stopAudioContent(id)`

- **Parameters:**
  - `id` (string): Unique identifier for the WebSocket connection.
- **Behavior:**
  - Stops playback and resets the playback position.
  - Updates the playback state to indicate that no audio content is currently playing.
  - Sends a playback status update indicating the content is stopped.

---

### 6. Close WebSocket Connection

Closes the WebSocket connection and cleans up resources.

**Method:** `closeConnection(id)`

- **Parameters:**
  - `id` (string): Unique identifier for the WebSocket connection.
- **Behavior:**
  - Closes the WebSocket connection.
  - Updates the playback state.
  - Sends a playback status update indicating the content is stopped.

---

### 7. Handle Disconnection

Handles accidental WebSocket disconnection and sends a reconnection message.

**Method:** `handleAccidentalDisconnection(id)`

- **Parameters:**
  - `id` (string): Unique identifier for the WebSocket connection.
- **Behavior:**
  - Sends a reconnection message to re-establish the WebSocket connection.

---

### Helper Functions

#### `sendAudioContentChunks(ws, id, blobData, state, playbackId)`

- Streams teacher's choice audio content in chunks.
- Manages playback position and state.
- Sends playback status updates when the audio content completes or stops.

#### `sendSystemAudioContentChunks(ws, id, blobData, state)`

- Streams system audio content in chunks.
- Does not send playback status updates.

#### `playNextSystemAudioContent(ws, id, state)`

- Plays the next system audio content from the queue.
- When the queue is empty, sets the current audio type to `null` and does not resume teacher's choice content automatically.

#### `sendPlaybackStatus(id, status)`

- Sends playback status updates (`PLAYING`, `PAUSED`, `STOPPED`) for teacher's choice content.

---

## Logging

The service logs key events for easier tracking and debugging:

- When audio content or system audio content starts, pauses, resumes, or stops.
- When system audio content is queued or played.
- When WebSocket connections are closed or reconnected.
- Errors during audio streaming.

## State Management

Each connection maintains its own state:

- **`audioContentState`:** Tracks the state of teacher's choice content, including:

  - `blobUrl`: URL of the audio content.
  - `position`: Current playback position in bytes.
  - `playing`: Boolean indicating if the content is currently playing.
  - `blobData`: Buffer containing the audio content data.

- **`systemAudioContentQueue`:** An array that stores queued system audio messages to be played sequentially.

- **`currentAudioType`:** Indicates the active audio type:

  - `'audioContent'`: Teacher's choice content is playing.
  - `'systemAudioContent'`: System audio content is playing.
  - `null`: No audio is currently playing.

- **`playbackId`:** A unique identifier incremented each time a new playback starts, used to prevent overlapping playback sessions.

---

## Error Handling

- **WebSocket Errors:**

  - Errors during WebSocket communication are logged.
  - If an error occurs while sending data, the playback is stopped, and the WebSocket connection is closed.

- **Disconnections:**

  - Accidental disconnections trigger a reconnection message to be sent.
  - The playback state is preserved to allow resuming after reconnection.

- **Audio Data Errors:**
  - If audio data cannot be fetched from Azure Blob Storage, an error is thrown.

---

## Example Usage

```javascript
const {
  playAudioContent,
  playSystemAudioContent,
  pauseAudioContent,
  resumeAudioContent,
  stopAudioContent,
  closeConnection,
  handleAccidentalDisconnection,
} = require("./services/websocketService");

// Play teacher's choice audio
playAudioContent(
  "connection1",
  "https://example.blob.core.windows.net/audio/teacher.mp3"
);

// Play system audio
playSystemAudioContent(
  "connection1",
  "https://example.blob.core.windows.net/audio/system.mp3"
);

// Pause audio content
pauseAudioContent("connection1");

// Resume audio content
resumeAudioContent("connection1");

// Stop audio content
stopAudioContent("connection1");

// Close connection
closeConnection("connection1");

// Handle accidental disconnection
handleAccidentalDisconnection("connection1");
```
