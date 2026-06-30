/**
 * Creates a mock WebSocket object
 */
function createMockWebSocket(options = {}) {
    return {
        readyState: 1, OPEN: 1, CLOSED: 3, CONNECTING: 0, CLOSING: 2,
        send: jest.fn(), close: jest.fn(), on: jest.fn(), emit: jest.fn(),
        addEventListener: jest.fn(), removeEventListener: jest.fn(),
        ...options
    };
}

/**
 * Creates a mock connection object
 */
function createMockConnection(id, stateOverrides = {}, wsOverrides = {}) {
    return {
        ws: createMockWebSocket(wsOverrides),
        state: {
            id, playing: false, position: 0, isClosed: false, playbackId: 0,
            currentAudioType: null, audioContentState: null, systemAudioContentQueue: [],
            ...stateOverrides
        }
    };
}

/**
 * Creates mock data and URLs
 */
const createMockBlobUrl = (container = 'testcontainer', blob = 'testblob.wav', account = 'teststorage') =>
    `https://${account}.blob.core.windows.net/${container}/${blob}`;

const createMockAudioData = (size = 1000, pattern = 'a') => Buffer.alloc(size, pattern);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const createMockControlMessage = (type, websocketId = 'test-client', message = '') => ({ websocket_id: websocketId, type, message });

/**
 * Testing utilities
 */
function setupAutoAdvancingTimer(interval = 20, times = 10) {
    let count = 0;
    const originalSetTimeout = global.setTimeout;
    jest.spyOn(global, 'setTimeout').mockImplementation((callback, delay) => {
        count++;
        if (count <= times) {
            return originalSetTimeout(() => { callback(); jest.advanceTimersByTime(interval); }, 0);
        } else {
            return originalSetTimeout(callback, delay);
        }
    });
}

function captureConsole(method = 'log') {
    const spy = jest.spyOn(console, method).mockImplementation(() => { });
    return { spy, restore: () => spy.mockRestore(), getCalls: () => spy.mock.calls, getCallCount: () => spy.mock.calls.length };
}

/**
 * Validation and response utilities
 */
function createMockBlobResponse(data) {
    return {
        readableStreamBody: {
            async *[Symbol.asyncIterator]() {
                const chunkSize = 320;
                for (let i = 0; i < data.length; i += chunkSize) yield data.slice(i, i + chunkSize);
            }
        }
    };
}

function validateWebSocketMessage(message, expectedFields = {}) {
    try {
        const parsed = JSON.parse(message);
        return Object.entries(expectedFields).every(([field, expectedType]) => typeof parsed[field] === expectedType);
    } catch { return false; }
}

function createTestEnvironment() {
    const mockConnections = new Map();
    return {
        mockConnections, mockWs: createMockWebSocket(), mockConnection: createMockConnection('test-client'),
        addConnection: (id, connection) => mockConnections.set(id, connection),
        getConnection: (id) => mockConnections.get(id),
        removeConnection: (id) => mockConnections.delete(id),
        clearConnections: () => mockConnections.clear()
    };
}

module.exports = {
    createMockWebSocket,
    createMockConnection,
    createMockBlobUrl,
    createMockAudioData,
    delay,
    createMockControlMessage,
    setupAutoAdvancingTimer,
    captureConsole,
    createMockBlobResponse,
    validateWebSocketMessage,
    createTestEnvironment
};