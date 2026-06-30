const connectionManager = require('../../src/services/connectionManager');

describe('ConnectionManager', () => {
    let mockConnection, mockWebSocket;

    beforeEach(() => {
        connectionManager.getAllConnections().clear();
        mockWebSocket = { readyState: 1, send: jest.fn(), close: jest.fn(), OPEN: 1, CLOSED: 3 };
        mockConnection = { ws: mockWebSocket, state: { id: 'test-id', playing: false, position: 0, isClosed: false } };
    });

    describe('CRUD operations', () => {
        it('should add, get, and remove connections', () => {
            // Add connection
            connectionManager.addConnection('test-1', mockConnection);
            expect(connectionManager.getConnection('test-1')).toBe(mockConnection);

            // Overwrite existing connection
            const newConnection = { ...mockConnection, state: { ...mockConnection.state, playing: true } };
            connectionManager.addConnection('test-1', newConnection);
            expect(connectionManager.getConnection('test-1').state.playing).toBe(true);

            // Get non-existent connection
            expect(connectionManager.getConnection('non-existent')).toBeUndefined();

            // Remove connection
            connectionManager.removeConnection('test-1');
            expect(connectionManager.getConnection('test-1')).toBeUndefined();

            // Remove non-existent connection (should not throw)
            expect(() => connectionManager.removeConnection('non-existent')).not.toThrow();
        });

        it('should handle getAllConnections and multiple concurrent connections', () => {
            // Empty map
            const connections = connectionManager.getAllConnections();
            expect(connections).toBeInstanceOf(Map);
            expect(connections.size).toBe(0);

            // Multiple connections
            const connection2 = { ...mockConnection, state: { ...mockConnection.state, id: 'test-id-2' } };
            connectionManager.addConnection('conn-1', mockConnection);
            connectionManager.addConnection('conn-2', connection2);

            const allConnections = connectionManager.getAllConnections();
            expect(allConnections.size).toBe(2);
            expect(allConnections.get('conn-1')).toBe(mockConnection);
            expect(allConnections.get('conn-2')).toBe(connection2);
            expect(allConnections).toBe(connectionManager.getAllConnections()); // Same reference

            // Concurrent operations
            for (let i = 0; i < 3; i++) {
                const conn = { ws: mockWebSocket, state: { id: `test-${i}`, position: i * 10 } };
                connectionManager.addConnection(`test-${i}`, conn);
            }
            expect(connectionManager.getAllConnections().size).toBe(5);

            // Remove every other connection
            connectionManager.removeConnection('test-0');
            connectionManager.removeConnection('test-2');
            expect(connectionManager.getAllConnections().size).toBe(3);
            expect(connectionManager.getConnection('test-1')).toBeDefined();
        });
    });
});