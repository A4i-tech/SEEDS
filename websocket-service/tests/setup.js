// Global test setup
global.console = {
    ...console,
    // Mock console methods to avoid noise during tests unless explicitly testing them
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.AZURE_STORAGE_ACCOUNT_NAME = 'teststorageaccount';

// Mock timers for more predictable tests
beforeEach(() => {
    jest.clearAllTimers();
});

afterEach(() => {
    jest.restoreAllMocks();
});