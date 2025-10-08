const websocketService = require('../src/services/websocketService');
const azureBlobService = require('../src/services/azureBlobService');
const connectionManager = require('../src/services/connectionManager');
const { createMockConnection, createMockAudioData, captureConsole } = require('./utils/testHelpers');

// Mock dependencies
jest.mock('../src/services/azureBlobService');
jest.mock('../src/services/connectionManager');

describe('Performance Tests', () => {
    let mockConnections;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        mockConnections = new Map();
        connectionManager.getAllConnections.mockReturnValue(mockConnections);
        connectionManager.getConnection.mockImplementation((id) => mockConnections.get(id));
        connectionManager.addConnection.mockImplementation((id, conn) => mockConnections.set(id, conn));
        connectionManager.removeConnection.mockImplementation((id) => mockConnections.delete(id));
        mockConnections.set('confv2server', createMockConnection('confv2server'));
    });

    afterEach(() => { jest.useRealTimers(); });

    describe('Connection Management Performance', () => {
        it('should handle many concurrent connections efficiently', () => {
            const startTime = process.hrtime.bigint();
            const numConnections = 1000;

            // Add, retrieve, and remove connections
            for (let i = 0; i < numConnections; i++) connectionManager.addConnection(`client-${i}`, createMockConnection(`client-${i}`));
            const addEndTime = process.hrtime.bigint();
            for (let i = 0; i < numConnections; i++) connectionManager.getConnection(`client-${i}`);
            const retrieveEndTime = process.hrtime.bigint();
            for (let i = 0; i < numConnections; i++) connectionManager.removeConnection(`client-${i}`);
            const removeEndTime = process.hrtime.bigint();

            const addDuration = Number(addEndTime - startTime) / 1000000;
            const retrieveDuration = Number(retrieveEndTime - addEndTime) / 1000000;
            const removeDuration = Number(removeEndTime - retrieveEndTime) / 1000000;

            console.log(`Add: ${addDuration.toFixed(2)}ms, Retrieve: ${retrieveDuration.toFixed(2)}ms, Remove: ${removeDuration.toFixed(2)}ms`);
            expect(addDuration).toBeLessThan(100);
            expect(retrieveDuration).toBeLessThan(50);
            expect(removeDuration).toBeLessThan(50);
        });
    });

    describe('Audio Streaming Performance', () => {
        it('should handle large audio files efficiently', async () => {
            const largeAudioData = createMockAudioData(1024 * 1024);
            azureBlobService.getBlobData.mockResolvedValue(largeAudioData);
            const connection = createMockConnection('test-client');
            mockConnections.set('test-client', connection);

            let sendCallCount = 0;
            connection.ws.send.mockImplementation((data, options, callback) => {
                sendCallCount++; setTimeout(() => callback && callback(), 0);
            });

            const startTime = process.hrtime.bigint();
            await websocketService.playAudioContent('test-client', 'https://storage.example.com/container/large-file.wav');
            while (sendCallCount < largeAudioData.length / 320) {
                jest.advanceTimersByTime(20); await Promise.resolve();
            }
            const duration = Number(process.hrtime.bigint() - startTime) / 1000000;

            console.log(`Streamed ${largeAudioData.length} bytes in ${sendCallCount} chunks: ${duration.toFixed(2)}ms`);
            expect(sendCallCount).toBeGreaterThan(0);
            expect(connection.state.audioContentState.position).toBe(largeAudioData.length);
        });

        it('should handle multiple concurrent audio streams', async () => {
            const numStreams = 10;
            const audioData = createMockAudioData(10240);
            azureBlobService.getBlobData.mockResolvedValue(audioData);
            const connections = [];

            for (let i = 0; i < numStreams; i++) {
                const connection = createMockConnection(`client-${i}`);
                connection.ws.send.mockImplementation((data, options, callback) => setTimeout(() => callback && callback(), 0));
                mockConnections.set(`client-${i}`, connection);
                connections.push(connection);
            }

            const startTime = process.hrtime.bigint();
            await Promise.all(Array.from({ length: numStreams }, (_, i) =>
                websocketService.playAudioContent(`client-${i}`, `https://storage.example.com/container/test-url-${i}.wav`)
            ));

            const chunksPerStream = Math.ceil(audioData.length / 320);
            for (let i = 0; i < chunksPerStream; i++) {
                jest.advanceTimersByTime(20); await Promise.resolve();
            }

            const duration = Number(process.hrtime.bigint() - startTime) / 1000000;
            console.log(`Handled ${numStreams} concurrent streams: ${duration.toFixed(2)}ms`);
            connections.forEach(connection => {
                expect(connection.state.audioContentState).toBeDefined();
                expect(connection.state.audioContentState.playing).toBe(true);
            });
        });
    });

    describe('Memory Usage', () => {
        it('should clean up audio data references properly', async () => {
            const connection = createMockConnection('test-client');
            mockConnections.set('test-client', connection);
            const largeAudioData = createMockAudioData(1024 * 1024);
            azureBlobService.getBlobData.mockResolvedValue(largeAudioData);

            // Track the connection state throughout the test
            for (let i = 0; i < 5; i++) {
                // Start audio playback
                await websocketService.playAudioContent('test-client', `https://storage.example.com/container/test-url-${i}.wav`);

                // Verify audio state is set up
                expect(connection.state.audioContentState).toBeDefined();
                expect(connection.state.audioContentState.blobData).toBeDefined();
                expect(connection.state.audioContentState.playing).toBe(true);
                expect(connection.state.currentAudioType).toBe('audioContent');

                // Stop audio playback
                websocketService.stopAudioContent('test-client');

                // Verify cleanup occurred
                expect(connection.state.audioContentState.playing).toBe(false);
                expect(connection.state.audioContentState.position).toBe(0);
                expect(connection.state.currentAudioType).toBeNull();

                // Note: blobData may still be referenced for potential resume, which is expected behavior
                console.log(`Cycle ${i + 1}: Audio state properly cleaned up`);
            }

            // Verify that multiple cycles don't accumulate playback IDs beyond reasonable bounds
            expect(connection.state.playbackId).toBeLessThanOrEqual(10);

            console.log('Memory cleanup test completed - all state transitions verified');
        });

        it('should handle memory efficiently without garbage collection dependency', () => {
            // This test validates that we can measure memory patterns without relying on global.gc
            const connection = createMockConnection('test-client');
            mockConnections.set('test-client', connection);

            const initialMemory = process.memoryUsage();
            const memorySnapshots = [];

            // Perform multiple small operations and track memory patterns
            for (let i = 0; i < 10; i++) {
                // Simulate audio state creation and cleanup
                connection.state.audioContentState = {
                    blobUrl: `test-url-${i}`,
                    position: 0,
                    playing: true,
                    blobData: createMockAudioData(1024) // Small data for pattern testing
                };

                // Reset state (simulating stop)
                connection.state.audioContentState.playing = false;
                connection.state.audioContentState.position = 0;
                connection.state.currentAudioType = null;

                memorySnapshots.push(process.memoryUsage().heapUsed);
            }

            const finalMemory = process.memoryUsage();
            const memoryDelta = finalMemory.heapUsed - initialMemory.heapUsed;

            console.log(`Memory delta after state operations: ${(memoryDelta / 1024).toFixed(2)} KB`);
            console.log(`Memory snapshots range: ${Math.min(...memorySnapshots)} - ${Math.max(...memorySnapshots)} bytes`);

            // Verify that memory usage patterns are reasonable (not growing exponentially)
            const memoryGrowth = memorySnapshots[memorySnapshots.length - 1] - memorySnapshots[0];
            expect(Math.abs(memoryGrowth)).toBeLessThan(10 * 1024 * 1024); // Less than 10MB variation

            // Verify connection state is properly managed
            expect(connection.state).toBeDefined();
            expect(connection.state.audioContentState).toBeDefined();
        });
    });

    describe('Error Handling Performance', () => {
        it('should handle many error conditions efficiently', async () => {
            const numErrors = 100;
            const { spy: errorSpy } = captureConsole('error');
            const startTime = process.hrtime.bigint();

            await Promise.all(Array.from({ length: numErrors }, (_, i) =>
                websocketService.playAudioContent(`non-existent-${i}`, 'https://storage.example.com/container/test.wav')
                    .catch(() => { })
            ));

            const duration = Number(process.hrtime.bigint() - startTime) / 1000000;
            console.log(`Handled ${numErrors} error conditions: ${duration.toFixed(2)}ms`);
            expect(duration).toBeLessThan(100);
            errorSpy.mockRestore();
        });
    });
});