# WebSocket Service Tests

This directory contains comprehensive tests for the SEEDS WebSocket service. The test suite covers unit tests, integration tests, and performance tests.

## Test Structure

```
tests/
├── setup.js                     # Global test setup and configuration
├── constants.test.js             # Tests for application constants
├── server.integration.test.js    # Integration tests for the HTTP/WebSocket server
├── performance.test.js           # Performance and stress tests
├── services/                     # Service layer tests
│   ├── connectionManager.test.js # Tests for connection management
│   ├── websocketService.test.js  # Tests for WebSocket service (core functionality)
│   ├── controlService.test.js    # Tests for control message handling
│   └── azureBlobService.test.js  # Tests for Azure Blob storage integration
└── utils/
    └── testHelpers.js            # Test utility functions and helpers
```

## Test Categories

### Unit Tests
- **connectionManager.test.js**: Tests the connection management functionality including adding, removing, and retrieving WebSocket connections
- **websocketService.test.js**: Comprehensive tests for audio streaming, playback controls, and WebSocket communication
- **controlService.test.js**: Tests for handling control messages from the conference server
- **azureBlobService.test.js**: Tests for Azure Blob Storage integration and data retrieval
- **constants.test.js**: Tests for application constants and enums

### Integration Tests
- **server.integration.test.js**: End-to-end tests for the HTTP server and WebSocket server integration

### Performance Tests
- **performance.test.js**: Performance benchmarks and stress tests for high-load scenarios

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with coverage report
```bash
npm run test:coverage
```

### Run specific test files
```bash
# Run only unit tests for services
npm test -- tests/services/

# Run only integration tests
npm test -- tests/server.integration.test.js

# Run only performance tests
npm test -- tests/performance.test.js
```

## Test Features

### Mocking Strategy
- **Azure Services**: Azure Blob Storage and Azure Identity are mocked to avoid external dependencies
- **Application Insights**: Telemetry is mocked to prevent actual data collection during tests
- **WebSocket Connections**: Mock WebSocket objects with controllable behavior
- **Timers**: Fake timers for predictable timing in audio streaming tests

### Test Utilities
The `tests/utils/testHelpers.js` file provides utility functions for:
- Creating mock WebSocket connections
- Generating test audio data
- Managing fake timers
- Capturing console output
- Validating message formats

### Coverage Goals
- **Service Layer**: 95%+ coverage for all service modules
- **Core Logic**: 100% coverage for critical audio streaming and connection management
- **Error Handling**: All error paths tested
- **Edge Cases**: Boundary conditions and unexpected inputs

## Test Data

### Mock Audio Data
Tests use generated Buffer data to simulate audio files of various sizes:
- Small files (320 bytes) for single-chunk tests
- Medium files (1-10KB) for multi-chunk streaming
- Large files (1MB+) for performance testing

### Mock WebSocket Messages
Control messages follow the application's message format:
```json
{
  "websocket_id": "client-id",
  "type": "message-type",
  "message": "content"
}
```

## Performance Benchmarks

The performance tests establish benchmarks for:
- **Connection Management**: Adding/removing 1000 connections < 100ms
- **Audio Streaming**: Streaming 1MB files efficiently
- **Concurrent Streams**: Handling 10+ simultaneous audio streams
- **Memory Usage**: No significant memory leaks
- **Error Handling**: Processing 100 errors < 100ms

## Mock Environment

Tests run with mocked environment variables:
- `NODE_ENV=test`
- `PORT=3001`
- `AZURE_STORAGE_ACCOUNT_NAME=teststorageaccount`

## Debugging Tests

### Verbose Output
To see detailed console output during tests:
```bash
npm test -- --verbose
```

### Debug Specific Test
```bash
npm test -- --testNamePattern="should handle audio streaming"
```

### Coverage Report
After running `npm run test:coverage`, open `coverage/index.html` in a browser to see detailed coverage information.

## Best Practices

1. **Isolation**: Each test is independent and doesn't affect others
2. **Mocking**: External dependencies are properly mocked
3. **Assertions**: Tests include both positive and negative cases
4. **Performance**: Performance tests ensure the service scales appropriately
5. **Error Handling**: All error conditions are tested
6. **Documentation**: Tests serve as documentation for expected behavior

## Continuous Integration

These tests are designed to run in CI/CD environments and include:
- No external dependencies
- Deterministic timing with fake timers
- Proper cleanup after each test
- Clear error messages for debugging failures

## Contributing

When adding new features:
1. Add corresponding unit tests
2. Update integration tests if needed
3. Add performance tests for new functionality
4. Maintain test coverage above 90%
5. Update this documentation as needed