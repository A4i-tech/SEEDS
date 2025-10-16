// src/services/connectionManager.js
// add persistent storage for WebSocket connections
const connections = new Map();

/**
 * Adds a new WebSocket connection to the manager.
 * @param {string} id - Unique identifier for the connection.
 * @param {Object} connection - Connection object containing WebSocket and state.
 */
function addConnection(id, connection) {
  connections.set(id, connection);
}

/**
 * Retrieves a connection by its ID.
 * @param {string} id - Unique identifier for the connection.
 * @returns {Object} - Connection object.
 */
function getConnection(id) {
  return connections.get(id);
}

/**
 * Removes a connection from the manager.
 * @param {string} id - Unique identifier for the connection.
 */
function removeConnection(id) {
  connections.delete(id);
}

/**
 * Retrieves all connections.
 * @returns {Map} - All connections.
 */
function getAllConnections() {
  return connections;
}

module.exports = {
  addConnection,
  getConnection,
  removeConnection,
  getAllConnections,
};
