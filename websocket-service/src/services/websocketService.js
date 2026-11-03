// src/services/websocketService.js

const logger = require("../logger");
const azureBlobService = require("./azureBlobService");
const connectionManager = require("./connectionManager");
const { PlaybackStatus, PlaybackRefusal, SUPPORTED_SPEEDS } = require("../constants");
const { getVariantBlobName } = require("./speedVariants");
const redactUrl = require("../redactUrl");

const AUDIO_BYTES_PER_SECOND = 16000; // 320 bytes * 50 chunks per second
const CHUNK_BYTES = 320;

// Conference-level speed, keyed by connection id. Survives a new physical
// WebSocket connection (e.g. Vonage reconnecting per content item), unlike
// the per-connection `state` object which is recreated on every reconnect.
const sessionSpeeds = new Map();

function scopedLogger(id, correlationId) {
  return logger.child({ sessionId: id, clientId: id, correlationId });
}

/**
 * Returns the last speed set for *id*, or 1.0 if none was ever set.
 */
function getSessionSpeed(id) {
  return sessionSpeeds.get(id) || 1.0;
}

/**
 * Maps *position* from a buffer of length *fromLength* onto the equivalent
 * position in a buffer of length *toLength*, by duration proportion. Used to
 * convert between a speed-variant's local byte offset and the shared
 * base-timeline offset without assuming a variant's actual duration is
 * exactly baseDuration / speed (atempo output length can differ slightly).
 */
function scalePosition(position, fromLength, toLength) {
  if (!fromLength) return 0;
  return Math.trunc((position / fromLength) * toLength);
}

/**
 * Fetches the *speed* variant blob for *baseBlobName*, treating an empty
 * blob as unavailable. Returns null (and logs the fallback warning) when
 * the variant cannot be fetched, so callers fall back to the 1.0x base.
 */
async function fetchVariantOrFallback(containerName, baseBlobName, speed, id) {
  const variantBlobName = getVariantBlobName(baseBlobName, speed);
  try {
    const data = await azureBlobService.getBlobData(containerName, variantBlobName);
    if (!data.length) throw new Error("empty variant blob");
    return { data, resolvedSpeed: speed };
  } catch (error) {
    logger.warn(`No ${speed}x variant for ID: ${id} (${variantBlobName}); falling back to 1.0x`, error);
    return null;
  }
}

/**
 * Resolves the blob data for *speed*, using the per-connection variant cache
 * when available. Falls back to the cached 1.0x base blob (and reports
 * resolvedSpeed: 1.0) if the requested variant is missing.
 */
async function loadVariant(audioState, speed, id) {
  if (speed === 1.0) return { data: audioState.variantCache.get(1.0), resolvedSpeed: 1.0 };
  if (audioState.variantCache.has(speed)) {
    return { data: audioState.variantCache.get(speed), resolvedSpeed: speed };
  }
  const result = await fetchVariantOrFallback(audioState.containerName, audioState.baseBlobName, speed, id);
  if (!result) return { data: audioState.variantCache.get(1.0), resolvedSpeed: 1.0 };
  audioState.variantCache.set(speed, result.data);
  return result;
}

/**
 * Handles play action for audio content (teacher's choice).
 * @param {string} id - Unique identifier for the connection.
 * @param {string} blobUrl - Azure Blob Storage URL of the audio content.
 */
async function playAudioContent(id, blobUrl) {
  const connection = connectionManager.getConnection(id);

  if (!connection) throw new Error("WebSocket connection not found");

  const { ws, state } = connection;
  const log = scopedLogger(id, state.correlationId);

  if (ws.readyState === ws.OPEN) {
    if (!state.audioContentState) {
      state.audioContentState = {};
    }

    // Stop existing audio content playback
    state.audioContentState.playing = false;

    // Increment playbackId to invalidate any previous playback loops
    state.playbackId = (state.playbackId || 0) + 1;
    const currentPlaybackId = state.playbackId;

    const { containerName, blobName } = parseBlobUrl(blobUrl);
    const requestedSpeed = state.speed || 1.0;

    // Reset audio content state — speed is read from state.speed (session-level),
    // never hardcoded, so it survives across content items.
    state.audioContentState = {
      blobUrl,
      containerName,
      baseBlobName: blobName,
      position: 0,
      playing: true,
      speed: requestedSpeed,
      variantCache: new Map(),
      blobData: null,
    };

    log.info(`playAudioContent called for ID: ${id}, Blob URL: ${blobUrl.substring(0,5)}, speed: ${requestedSpeed}`, { eventType: "play_audio_requested" });

    const [baseBlobData, variantResult] = await Promise.all([
      azureBlobService.getBlobData(containerName, blobName),
      requestedSpeed !== 1.0
        ? fetchVariantOrFallback(containerName, blobName, requestedSpeed, id)
        : null,
    ]);
    const variantBlobData = variantResult ? variantResult.data : null;
    log.info(`Blob downloaded for ID: ${id}, size: ${baseBlobData ? baseBlobData.length : 'null'} bytes`, { eventType: "blob_downloaded" });
    state.audioContentState.baseDurationSeconds = baseBlobData ? baseBlobData.length / AUDIO_BYTES_PER_SECOND : 0;
    state.audioContentState.variantCache.set(1.0, baseBlobData);

    const blobData = variantBlobData || baseBlobData;
    const resolvedSpeed = variantBlobData ? requestedSpeed : 1.0;
    if (variantBlobData) state.audioContentState.variantCache.set(requestedSpeed, variantBlobData);
    state.audioContentState.blobData = blobData;
    state.audioContentState.speed = resolvedSpeed;

    // If no system audio content is playing, start playing audio content
    const channelFree = !state.currentAudioType || state.currentAudioType === "audioContent";
    if (channelFree) {
      state.currentAudioType = "audioContent";
      sendPlaybackStatus(id, PlaybackStatus.PLAYING);
      log.info(`Starting audio content playback for ID: ${id}`, { eventType: "audio_playback_start" });
      sendAudioContentChunks(ws, id, blobData, state, currentPlaybackId);
    } else {
      // Keep audio content loaded but paused so it can be resumed once system audio releases the channel
      state.audioContentState.playing = false;
      sendPlaybackStatus(id, PlaybackStatus.PAUSED, PlaybackRefusal.PLAY_DEFERRED_SYSTEM_AUDIO);
      log.info(
        `Audio content playback paused for ID: ${id} due to system audio content in progress`,
        { eventType: "audio_playback_deferred" }
      );
    }
  } else {
    throw new Error("WebSocket is not open");
  }
}

/**
 * Handles play action for system audio content (system-generated messages).
 * @param {string} id - Unique identifier for the connection.
 * @param {string} blobUrl - Azure Blob Storage URL of the system audio content.
 */
async function playSystemAudioContent(id, blobUrl) {
  const connection = connectionManager.getConnection(id);

  if (!connection) throw new Error("WebSocket connection not found");

  const { ws, state } = connection;
  const log = scopedLogger(id, state.correlationId);

  if (ws.readyState === ws.OPEN) {
    if (!state.systemAudioContentQueue) {
      state.systemAudioContentQueue = [];
    }

    // Enqueue system audio content
    state.systemAudioContentQueue.push({ blobUrl });
    log.info(`System audio content queued for ID: ${id}, Blob URL: ${redactUrl(blobUrl)}`, { eventType: "system_audio_queued" });

    if (state.currentAudioType === "systemAudioContent") {
      // Do nothing; it will play after the current system audio content
      log.info(`System audio content already playing for ID: ${id}, new content will be queued`, { eventType: "system_audio_already_playing" });
    } else {
      // Pause audio content if playing
      if (
        state.currentAudioType === "audioContent" &&
        state.audioContentState &&
        state.audioContentState.playing
      ) {
        state.audioContentState.playing = false;
        sendPlaybackStatus(id, PlaybackStatus.PAUSED);
        log.info(`Audio content playback paused for ID: ${id} to play system audio content`, { eventType: "audio_playback_preempted" });
      }

      // Set currentAudioType to 'systemAudioContent' and start playing next system audio content
      state.currentAudioType = "systemAudioContent";
      playNextSystemAudioContent(ws, id, state);
    }
  } else {
    throw new Error("WebSocket is not open");
  }
}

/**
 * Plays the next system audio content from the queue.
 * @param {WebSocket} ws - WebSocket connection.
 * @param {string} id - Unique identifier for the connection.
 * @param {Object} state - State object containing playback information.
 */
async function playNextSystemAudioContent(ws, id, state) {
  const log = scopedLogger(id, state.correlationId);
  if (state.systemAudioContentQueue.length === 0) {
    // No more system audio content; do not resume audio content
    log.info(`No more system audio content in queue for ID: ${id}`, { eventType: "system_audio_queue_empty" });
    state.currentAudioType = null; // Set currentAudioType to null indicating no audio is playing
    if (state.lastRefusal) {
      // Clear the refusal raised while system audio held the channel, keeping the real status
      sendPlaybackStatus(id, state.lastPlaybackStatus);
    }
    return;
  }

  const nextSystemAudioContent = state.systemAudioContentQueue.shift();
  const { blobUrl } = nextSystemAudioContent;
  log.info(`Starting system audio content playback for ID: ${id}, Blob URL: ${redactUrl(blobUrl)}`, { eventType: "system_audio_playback_start" });

  try {
    const { containerName, blobName } = parseBlobUrl(blobUrl);
    const blobData = await azureBlobService.getBlobData(containerName, blobName);

    // Start playing system audio content
    // Note: We do NOT send playback status updates for system audio content
    sendSystemAudioContentChunks(ws, id, blobData, state);
  } catch (error) {
    logger.error(
      `Failed to play system audio content for ID: ${id}, Blob URL: ${redactUrl(blobUrl)}`,
      error
    );
    clearSystemAudio(ws, id, state);
  }
}

function clearSystemAudio(ws, id, state) {
  state.systemAudioContentQueue.length = 0;
  playNextSystemAudioContent(ws, id, state);
}

/**
 * Sends audio content data over WebSocket in 320-byte chunks with 20ms delays.
 * @param {WebSocket} ws - WebSocket connection.
 * @param {string} id - Unique identifier for the connection.
 * @param {Buffer} blobData - Buffer containing the entire blob data.
 * @param {Object} state - State object containing playback information.
 * @param {number} playbackId - Unique identifier for the playback session.
 */
function sendAudioContentChunks(ws, id, blobData, state, playbackId) {
  const log = scopedLogger(id, state.correlationId);
  let position = state.audioContentState.position || 0;
  const totalLength = blobData.length;
  let chunksSinceLastReport = 0;
  const REPORT_INTERVAL_CHUNKS = 250; // ~5 seconds at 20ms/chunk

  function sendNextChunk() {
    // Check if playbackId matches and playback is still active
    if (
      ws.readyState !== ws.OPEN ||
      state.playbackId !== playbackId ||
      state.currentAudioType !== "audioContent" ||
      !state.audioContentState.playing
    ) {
      // Stop sending if playback is paused, stopped, or overridden
      log.info(`Stopping audio content streaming for ID: ${id}`, { eventType: "audio_streaming_stopped" });
      return;
    }

    if (position >= totalLength) {
      // Audio content streaming completed
      log.info(`Audio content streaming completed for ID: ${id}`, { eventType: "audio_streaming_completed" });
      state.audioContentState.playing = false;
      state.currentAudioType = null; // Set to null since playback has completed
      sendPlaybackStatus(id, PlaybackStatus.STOPPED); // Send playback status when audio content stops
      return;
    }

    const end = Math.min(position + CHUNK_BYTES, totalLength);
    const chunk = blobData.slice(position, end);
    position = end;
    state.audioContentState.position = position;
    chunksSinceLastReport++;

    // Send periodic position/duration updates (~every 5 seconds)
    if (chunksSinceLastReport >= REPORT_INTERVAL_CHUNKS) {
      chunksSinceLastReport = 0;
      sendPlaybackStatus(id, PlaybackStatus.PLAYING);
    }

    ws.send(chunk, { binary: true }, (error) => {
      if (error) {
        log.error(`Error sending data over WebSocket for ID: ${id}`, Object.assign(error, { eventType: "audio_send_error" }));
        sendPlaybackStatus(id, PlaybackStatus.STOPPED);
        ws.close();
        return;
      }

      setTimeout(sendNextChunk, 20);
    });
  }

  // Start sending chunks
  log.info(`Sending audio content chunks for ID: ${id}`, { eventType: "audio_streaming_start" });
  sendNextChunk();
}

/**
 * Sends system audio content data over WebSocket in 320-byte chunks with 20ms delays.
 * @param {WebSocket} ws - WebSocket connection.
 * @param {string} id - Unique identifier for the connection.
 * @param {Buffer} blobData - Buffer containing the entire blob data.
 * @param {Object} state - State object containing playback information.
 */
function sendSystemAudioContentChunks(ws, id, blobData, state) {
  const log = scopedLogger(id, state.correlationId);
  const totalLength = blobData.length;
  let position = 0;

  function sendNextChunk() {
    // Check if WebSocket is open and currentAudioType is 'systemAudioContent'
    if (state.currentAudioType !== "systemAudioContent") {
      // Stop sending if overridden or WebSocket closed
      log.info(`Stopping system audio content streaming for ID: ${id}`, { eventType: "system_audio_streaming_stopped" });
      return;
    }

    if (ws.readyState !== ws.OPEN) {
      logger.info(`Stopping system audio content streaming for ID: ${id}; WebSocket closed`);
      clearSystemAudio(ws, id, state);
      return;
    }

    if (position >= totalLength) {
      // System audio content streaming completed
      log.info(`System audio content streaming completed for ID: ${id}`, { eventType: "system_audio_streaming_completed" });
      // Play next system audio content or set currentAudioType to null
      playNextSystemAudioContent(ws, id, state);
      return;
    }

    const end = Math.min(position + 320, totalLength);
    const chunk = blobData.slice(position, end);
    position = end;

    ws.send(chunk, { binary: true }, (error) => {
      if (error) {
        log.error(`Error sending data over WebSocket for ID: ${id}`, Object.assign(error, { eventType: "system_audio_send_error" }));
        ws.close();
        return;
      }

      // Schedule the next chunk after 20ms
      setTimeout(sendNextChunk, 20);
    });
  }

  // Start sending chunks
  log.info(`Sending system audio content chunks for ID: ${id}`, { eventType: "system_audio_streaming_start" });
  sendNextChunk();
}

/**
 * Pauses the audio content playback.
 * @param {string} id - Unique identifier for the connection.
 */
function pauseAudioContent(id) {
  const connection = connectionManager.getConnection(id);

  if (!connection) throw new Error("WebSocket connection not found");

  const { state } = connection;
  const log = scopedLogger(id, state.correlationId);

  if (
    state.currentAudioType === "audioContent" &&
    state.audioContentState &&
    state.audioContentState.playing
  ) {
    state.audioContentState.playing = false;
    sendPlaybackStatus(id, PlaybackStatus.PAUSED);
    log.info(`Audio content playback paused for ID: ${id}`, { eventType: "audio_playback_paused" });
  }
}

/**
 * Resumes the audio content playback.
 * @param {string} id - Unique identifier for the connection.
 */
function resumeAudioContent(id) {
  const connection = connectionManager.getConnection(id);

  if (!connection) throw new Error("WebSocket connection not found");

  const { ws, state } = connection;
  const log = scopedLogger(id, state.correlationId);

  if (
    state.currentAudioType === "systemAudioContent" ||
    (state.systemAudioContentQueue && state.systemAudioContentQueue.length > 0)
  ) {
    // Ignore resume request; system audio content is playing or queued
    sendPlaybackStatus(id, PlaybackStatus.PAUSED, PlaybackRefusal.RESUME_REFUSED_SYSTEM_AUDIO);
    log.info(`Resume request ignored for ID: ${id}; system audio content is playing or queued`, { eventType: "audio_resume_ignored" });
    return;
  }

  if (state.audioContentState && state.audioContentState.blobData) {
    state.playbackId = (state.playbackId || 0) + 1;
    const currentPlaybackId = state.playbackId;

    state.currentAudioType = "audioContent";
    state.audioContentState.playing = true;
    sendPlaybackStatus(id, PlaybackStatus.PLAYING);
    log.info(`Resuming audio content playback for ID: ${id}`, { eventType: "audio_playback_resumed" });
    sendAudioContentChunks(ws, id, state.audioContentState.blobData, state, currentPlaybackId);
  } else {
    throw new Error("No audio content data to resume");
  }
}

/**
 * Applies a signed delta offset and restarts playback from the new position when possible.
 * @param {string} id - Unique identifier for the connection.
 * @param {Object} seekPayload - Payload containing deltaSeconds.
 */
async function seekAudioContent(id, seekPayload) {
  const connection = connectionManager.getConnection(id);

  if (!connection) throw new Error("WebSocket connection not found");

  const { ws, state } = connection;
  const audioState = state.audioContentState;
  const log = scopedLogger(id, state.correlationId);

  if (!audioState || !audioState.blobData) {
    throw new Error("No audio content data to seek");
  }
  const seekTarget = extractSeekTarget(seekPayload);
  const totalLogicalLength = (audioState.baseDurationSeconds || 0) * AUDIO_BYTES_PER_SECOND;
  const currentLogicalPosition = scalePosition(audioState.position || 0, audioState.blobData.length, totalLogicalLength);
  log.info(
    `Seek request received for ID: ${id}; ${seekTarget.type}: ${seekTarget.value}; currentLogicalPosition: ${currentLogicalPosition}`,
    { eventType: "audio_seek_requested" }
  );
  const targetLogicalPosition =
    seekTarget.type === "absolute"
      ? clampPosition(Math.trunc(seekTarget.value * AUDIO_BYTES_PER_SECOND), totalLogicalLength)
      : clampPosition(
          Math.trunc(currentLogicalPosition + seekTarget.value * AUDIO_BYTES_PER_SECOND),
          totalLogicalLength
        );
  const targetPosition = clampPosition(
    scalePosition(targetLogicalPosition, totalLogicalLength, audioState.blobData.length),
    audioState.blobData.length
  );

  audioState.position = targetPosition;

  if (state.currentAudioType === "systemAudioContent") {
    // Acknowledge the seek but leave playback paused until announcements finish.
    audioState.playing = false;
    log.info(
      `Seek for ID: ${id} applied while system audio playing; new buffered position: ${targetPosition}`,
      { eventType: "audio_seek_buffered" }
    );
    sendPlaybackStatus(id, PlaybackStatus.PAUSED, PlaybackRefusal.SEEK_DEFERRED_SYSTEM_AUDIO);
    return;
  }

  state.playbackId = (state.playbackId || 0) + 1;
  const currentPlaybackId = state.playbackId;
  state.currentAudioType = "audioContent";
  audioState.playing = true;

  sendPlaybackStatus(id, PlaybackStatus.PLAYING);
  log.info(
    `Restarting audio stream after seek for ID: ${id}; playbackId: ${currentPlaybackId}; startByte: ${targetPosition}`,
    { eventType: "audio_seek_restart" }
  );
  sendAudioContentChunks(ws, id, audioState.blobData, state, currentPlaybackId);
}

/**
 * Changes the playback speed, swapping to the matching pre-generated variant
 * and continuing streaming from the equivalent logical position.
 * @param {string} id - Unique identifier for the connection.
 * @param {number} speed - Requested playback speed multiplier.
 */
async function setPlaybackSpeed(id, speed) {
  const connection = connectionManager.getConnection(id);
  if (!connection) throw new Error("WebSocket connection not found");

  const { ws, state } = connection;
  const log = scopedLogger(id, state.correlationId);

  if (!SUPPORTED_SPEEDS.includes(speed)) {
    log.warn(`Ignoring unsupported playback speed for ID: ${id}: ${speed}`, { eventType: "audio_speed_rejected" });
    return;
  }

  state.speed = speed;
  sessionSpeeds.set(id, speed);

  const audioState = state.audioContentState;
  if (!audioState || !audioState.blobData) {
    log.info(`Playback speed set to ${speed}x for ID: ${id} (no active content)`, { eventType: "audio_speed_changed" });
    return;
  }

  // Guard against a slower-resolving earlier call clobbering a newer one, or
  // the content item changing entirely, while this variant load is in flight.
  state.speedChangeSeq = (state.speedChangeSeq || 0) + 1;
  const speedChangeSeq = state.speedChangeSeq;

  const oldBufferLength = audioState.blobData.length;
  const { data: variantData, resolvedSpeed } = await loadVariant(audioState, speed, id);

  if (state.speedChangeSeq !== speedChangeSeq || state.audioContentState !== audioState) {
    log.info(`Ignoring stale setPlaybackSpeed result for ID: ${id} (superseded)`, { eventType: "audio_speed_stale" });
    return;
  }

  audioState.blobData = variantData;
  audioState.speed = resolvedSpeed;
  audioState.position = clampPosition(scalePosition(audioState.position || 0, oldBufferLength, variantData.length), variantData.length);

  log.info(`Playback speed set to ${resolvedSpeed}x for ID: ${id}`, { eventType: "audio_speed_changed" });

  if (state.currentAudioType === "audioContent" && audioState.playing) {
    state.playbackId = (state.playbackId || 0) + 1;
    const currentPlaybackId = state.playbackId;

    sendPlaybackStatus(id, PlaybackStatus.PLAYING);
    sendAudioContentChunks(ws, id, audioState.blobData, state, currentPlaybackId);
  } else {
    sendPlaybackStatus(id, audioState.playing ? PlaybackStatus.PLAYING : PlaybackStatus.PAUSED);
  }
}

/**
 * Stops the audio content playback and resets position.
 * @param {string} id - Unique identifier for the connection.
 */
function stopAudioContent(id) {
  const connection = connectionManager.getConnection(id);

  if (!connection) throw new Error("WebSocket connection not found");

  const { state } = connection;
  const log = scopedLogger(id, state.correlationId);

  if (state.audioContentState) {
    state.audioContentState.playing = false;
    state.audioContentState.position = 0;
    sendPlaybackStatus(id, PlaybackStatus.STOPPED);
    state.currentAudioType = null; // Set currentAudioType to null since playback is stopped
    log.info(`Audio content playback stopped for ID: ${id}`, { eventType: "audio_playback_stopped" });
  }
}

/**
 * Closes the WebSocket connection.
 * @param {string} id - Unique identifier for the connection.
 */
function closeConnection(id) {
  sessionSpeeds.delete(id);

  const connection = connectionManager.getConnection(id);

  if (!connection) {
    logger.info(`Conference end for ID: ${id}; no active WebSocket connection (already disconnected)`);
    return;
  }

  const { ws, state } = connection;
  const log = scopedLogger(id, state.correlationId);
  state.isClosed = true;
  ws.close();
  sendPlaybackStatus(id, PlaybackStatus.STOPPED);
  log.info(`WebSocket connection closed for ID: ${id}`, { eventType: "connection_close_requested" });
}

/**
 * Handles WebSocket disconnection.
 * @param {string} id - Unique identifier for the connection.
 */
function handleAccidentalDisconnection(id, correlationId) {
  const log = scopedLogger(id, correlationId);
  log.info(`Sending reconnection message for WebSocket ID: ${id}`, { eventType: "accidental_disconnection" });
  sendReconnectionMessage(id, correlationId);
}

/**
 * Parses the blob URL to extract container and blob names.
 * @param {string} blobUrl - Azure Blob Storage URL of the audio file.
 * @returns {Object} - Object containing containerName and blobName.
 */
function parseBlobUrl(blobUrl) {
  const url = new URL(blobUrl);
  const pathSegments = url.pathname.split("/");
  const containerName = pathSegments[1];
  const blobName = pathSegments.slice(2).join("/");
  return { containerName, blobName };
}

function sendPlaybackStatus(id, status, refusal) {
  const conn = connectionManager.getConnection(id);
  const log = scopedLogger(id, conn && conn.state.correlationId);
  try {
    const confv2Conn = connectionManager.getConnection("confv2server");
    if (!confv2Conn || !confv2Conn.ws) {
      log.error(`sendPlaybackStatus [${id}]: No confv2server connection available`, { eventType: "playback_status_no_confv2_connection" });
      return;
    }
    const { ws } = confv2Conn;
    const audioState = conn?.state?.audioContentState;
    if (conn?.state) {
      conn.state.lastPlaybackStatus = status;
      conn.state.lastRefusal = refusal || null;
    }

    const speed = audioState?.speed || 1.0;
    const totalLogicalLength = (audioState?.baseDurationSeconds || 0) * AUDIO_BYTES_PER_SECOND;
    const positionSec = audioState?.blobData
      ? parseFloat((scalePosition(audioState.position || 0, audioState.blobData.length, totalLogicalLength) / AUDIO_BYTES_PER_SECOND).toFixed(2))
      : 0;
    const durationSec = parseFloat((audioState?.baseDurationSeconds || 0).toFixed(2));

    const payload = {
      websocket_id: id,
      type: "playback-state-update",
      message: status,
      position_seconds: positionSec,
      duration_seconds: durationSec,
      speed,
    };
    if (refusal) payload.refusal = refusal;
    logger.info(`sendPlaybackStatus [${id}]: status=${status}, position=${payload.position_seconds}, duration=${payload.duration_seconds}, speed=${payload.speed}, blobData=${audioState?.blobData ? audioState.blobData.length + ' bytes' : 'null'}`);

    ws.send(
      JSON.stringify(payload),
      (error) => {
        if (error) {
          log.error(`Error sending playback status over WebSocket for ID: ${id}`, Object.assign(error, { eventType: "playback_status_send_error" }));
        }
      }
    );
  } catch (err) {
    log.error(`sendPlaybackStatus [${id}] CRASHED`, Object.assign(err, { eventType: "playback_status_crash" }));
  }
}

function sendReconnectionMessage(id, correlationId) {
  const { ws } = connectionManager.getConnection("confv2server");
  const log = scopedLogger(id, correlationId);
  ws.send(
    JSON.stringify({
      websocket_id: id,
      type: "RECONNECT",
    }),
    (error) => {
      if (error) {
        log.error(`Error sending data over WebSocket for ID: ${id}`, Object.assign(error, { eventType: "reconnection_message_send_error" }));
        ws.close();
        return;
      }
    }
  );
}

function extractSeekTarget(payload) {
  if (!payload) {
    throw new Error("Seek payload is required");
  }
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (parsed.positionSeconds !== undefined || parsed.position_seconds !== undefined) {
    const pos = Number(parsed.positionSeconds ?? parsed.position_seconds);
    if (!Number.isFinite(pos) || pos < 0) {
      throw new Error("Seek payload positionSeconds must be a non-negative finite number");
    }
    return { type: "absolute", value: pos };
  }
  if ((parsed.deltaSeconds ?? parsed.delta_seconds) !== undefined) {
    const delta = Number(parsed.deltaSeconds ?? parsed.delta_seconds);
    if (!Number.isFinite(delta)) {
      throw new Error("Seek payload deltaSeconds must be a finite number");
    }
    return { type: "relative", value: delta };
  }
  throw new Error("Seek payload must include deltaSeconds or positionSeconds");
}

function clampPosition(position, totalLength) {
  const upperBound = typeof totalLength === "number" ? totalLength : 0;
  if (upperBound <= 0) {
    return 0;
  }
  let clamped = position;
  if (clamped < 0) {
    clamped = 0;
  }
  if (clamped > upperBound) {
    clamped = upperBound;
  }
  // Audio is 16-bit PCM (2 bytes/sample) — round down to an even byte offset
  // so we never split a sample across a chunk boundary.
  return clamped - (clamped % 2);
}

module.exports = {
  playAudioContent,
  playSystemAudioContent,
  pauseAudioContent,
  resumeAudioContent,
  seekAudioContent,
  setPlaybackSpeed,
  stopAudioContent,
  closeConnection,
  handleAccidentalDisconnection,
  getSessionSpeed,
};
