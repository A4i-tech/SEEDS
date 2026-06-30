'use strict';

describe('logger — dev mode', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'development';
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('info() writes to console.log', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = require('../src/logger');
    logger.info('hello');
    expect(spy).toHaveBeenCalledWith('[INFO] hello', '');
  });

  it('info() passes properties when provided', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = require('../src/logger');
    logger.info('hello', { key: 'val' });
    expect(spy).toHaveBeenCalledWith('[INFO] hello', { key: 'val' });
  });

  it('warn() writes to console.warn', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = require('../src/logger');
    logger.warn('careful');
    expect(spy).toHaveBeenCalledWith('[WARN] careful', '');
  });

  it('warn() passes properties when provided', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = require('../src/logger');
    logger.warn('careful', { key: 'val' });
    expect(spy).toHaveBeenCalledWith('[WARN] careful', { key: 'val' });
  });

  it('error() writes to console.error with Error object', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logger = require('../src/logger');
    const err = new Error('boom');
    logger.error('broke', err);
    expect(spy).toHaveBeenCalledWith('[ERROR] broke', err, '');
  });

  it('error() handles null error gracefully', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logger = require('../src/logger');
    logger.error('broke', null);
    expect(spy).toHaveBeenCalledWith('[ERROR] broke', '', '');
  });
});

describe('logger — production without connection string', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'production';
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.NODE_ENV = 'test';
  });

  it('falls back to console when connection string is absent', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = require('../src/logger');
    logger.info('hello');
    expect(spy).toHaveBeenCalledWith('[INFO] hello', '');
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
});
