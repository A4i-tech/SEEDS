// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock environment variables for all tests
process.env.REACT_APP_CONF_SERVER_BASE_URI = 'http://localhost:3001';
process.env.REACT_APP_STORAGE_ACCOUNT_NAME = 'testaccount';

// Mock EventSource globally
global.EventSource = jest.fn(() => ({
    onmessage: null,
    onerror: null,
    close: jest.fn(),
}));

// Mock fetch globally if not already mocked in individual tests
if (!global.fetch) {
    global.fetch = jest.fn(() =>
        Promise.resolve({
            json: () => Promise.resolve({}),
        })
    );
}

// Suppress console errors in tests unless explicitly testing them
const originalError = console.error;
beforeAll(() => {
    console.error = (...args) => {
        if (
            typeof args[0] === 'string' &&
            (args[0].includes('Warning:') ||
                args[0].includes('Error:') ||
                args[0].includes('validateDOMNesting'))
        ) {
            return;
        }
        originalError.call(console, ...args);
    };
});

afterAll(() => {
    console.error = originalError;
});

// Clean up after each test
afterEach(() => {
    jest.clearAllMocks();
});
