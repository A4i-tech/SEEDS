'use strict';

function parseLoggedLine(spy) {
  const calls = spy.mock.calls;
  return JSON.parse(calls[calls.length - 1][0]);
}

describe('logger — dev mode', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'development';
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('info() writes structured JSON to console.log', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {}).mockClear();
    const logger = require('../src/logger');
    logger.info('hello');
    const entry = parseLoggedLine(spy);
    expect(entry).toMatchObject({ level: 'info', service: 'websocket-service', message: 'hello' });
    expect(entry.timestamp).toEqual(expect.any(String));
  });

  it('info() includes properties in the entry', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {}).mockClear();
    const logger = require('../src/logger');
    logger.info('hello', { sessionId: 'abc' });
    expect(parseLoggedLine(spy)).toMatchObject({ message: 'hello', sessionId: 'abc' });
  });

  it('warn() writes structured JSON to console.warn', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {}).mockClear();
    const logger = require('../src/logger');
    logger.warn('careful');
    expect(parseLoggedLine(spy)).toMatchObject({ level: 'warn', message: 'careful' });
  });

  it('error() writes structured JSON to console.error with error message', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {}).mockClear();
    const logger = require('../src/logger');
    const err = new Error('boom');
    logger.error('broke', err);
    expect(parseLoggedLine(spy)).toMatchObject({ level: 'error', message: 'broke', error: 'boom' });
  });

  it('error() handles null error gracefully', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {}).mockClear();
    const logger = require('../src/logger');
    logger.error('broke', null);
    expect(parseLoggedLine(spy)).toMatchObject({ level: 'error', message: 'broke', error: null });
  });

  it('masks sensitive property keys', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {}).mockClear();
    const logger = require('../src/logger');
    logger.info('auth ok', { token: 'secret-value', userId: '42' });
    const entry = parseLoggedLine(spy);
    expect(entry.token).toBe('***');
    expect(entry.userId).toBe('42');
  });

  it('debug() is suppressed by default level (info)', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {}).mockClear();
    const logger = require('../src/logger');
    logger.debug('verbose');
    expect(spy).not.toHaveBeenCalled();
  });

  it('debug() logs when LOG_LEVEL=debug', () => {
    jest.resetModules();
    process.env.LOG_LEVEL = 'debug';
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {}).mockClear();
    const logger = require('../src/logger');
    logger.debug('verbose');
    expect(parseLoggedLine(spy)).toMatchObject({ level: 'debug', message: 'verbose' });
  });

  it('generateCorrelationId() returns a UUID v4 string', () => {
    const logger = require('../src/logger');
    const id = logger.generateCorrelationId();
    expect(id).toEqual(expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));
  });

  it('generateCorrelationId() returns a different value on each call', () => {
    const logger = require('../src/logger');
    expect(logger.generateCorrelationId()).not.toBe(logger.generateCorrelationId());
  });

  it('withContext().info() merges context and per-call properties', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {}).mockClear();
    const logger = require('../src/logger');
    const contextLogger = logger.withContext({ sessionId: 'abc', requestId: 'req-1' });
    contextLogger.info('hello', { userId: '42' });
    expect(parseLoggedLine(spy)).toMatchObject({
      message: 'hello',
      sessionId: 'abc',
      requestId: 'req-1',
      userId: '42',
    });
  });

  it('withContext() lets call-site properties win on key collision', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {}).mockClear();
    const logger = require('../src/logger');
    const contextLogger = logger.withContext({ sessionId: 'context-value' });
    contextLogger.info('hello', { sessionId: 'call-value' });
    expect(parseLoggedLine(spy)).toMatchObject({ sessionId: 'call-value' });
  });

  it('withContext().error() masks sensitive properties and includes context', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {}).mockClear();
    const logger = require('../src/logger');
    const contextLogger = logger.withContext({ sessionId: 'abc' });
    const err = new Error('boom');
    contextLogger.error('broke', err, { token: 'secret-value' });
    const entry = parseLoggedLine(spy);
    expect(entry).toMatchObject({ level: 'error', message: 'broke', error: 'boom', sessionId: 'abc' });
    expect(entry.token).toBe('***');
  });
});

describe('logger — production without connection string', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'production';
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.NODE_ENV = 'test';
  });

  it('falls back to console when connection string is absent', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {}).mockClear();
    const logger = require('../src/logger');
    logger.info('hello');
    expect(parseLoggedLine(spy)).toMatchObject({ message: 'hello' });
  });
});

describe('logger — production path routing (mock client)', () => {
  let logger;
  let mockClient;

  beforeEach(() => {
    jest.resetModules();

    mockClient = {
      trackTrace: jest.fn(),
      trackException: jest.fn(),
      context: {
        tags: {},
        keys: { cloudRole: 'ai.cloud.role' },
      },
    };

    jest.mock('applicationinsights', () => ({
      setup: jest.fn().mockReturnThis(),
      setAutoCollectRequests: jest.fn().mockReturnThis(),
      setAutoCollectDependencies: jest.fn().mockReturnThis(),
      setAutoCollectExceptions: jest.fn().mockReturnThis(),
      setAutoCollectConsole: jest.fn().mockReturnThis(),
      setDistributedTracingMode: jest.fn().mockReturnThis(),
      start: jest.fn().mockReturnThis(),
      defaultClient: mockClient,
      DistributedTracingModes: { AI_AND_W3C: 2 },
    }));

    process.env.NODE_ENV = 'production';
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test-key';
    delete process.env.LOG_LEVEL;
    logger = require('../src/logger');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
    process.env.NODE_ENV = 'test';
  });

  it('info() calls trackTrace with severity 1', () => {
    logger.info('hello', { key: 'val' });
    expect(mockClient.trackTrace).toHaveBeenCalledWith({
      message: 'hello',
      severity: 1,
      properties: { key: 'val' },
    });
  });

  it('error() with Error calls trackException only (no trackTrace)', () => {
    const err = new Error('boom');
    logger.error('broke', err, { ctx: 'test' });
    expect(mockClient.trackException).toHaveBeenCalledWith({
      exception: err,
      properties: { ctx: 'test', message: 'broke' },
    });
    expect(mockClient.trackTrace).not.toHaveBeenCalled();
  });

  it('error() with non-Error calls trackTrace only (no trackException)', () => {
    logger.error('broke', null);
    expect(mockClient.trackTrace).toHaveBeenCalledWith({
      message: 'broke',
      severity: 3,
      properties: {},
    });
    expect(mockClient.trackException).not.toHaveBeenCalled();
  });

  it('masks sensitive properties before sending to App Insights', () => {
    logger.info('login', { password: 'hunter2' });
    expect(mockClient.trackTrace).toHaveBeenCalledWith({
      message: 'login',
      severity: 1,
      properties: { password: '***' },
    });
  });
});
