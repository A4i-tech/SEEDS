'use strict';

const MESSAGE = Symbol.for('message');

function loadLogger() {
  const logger = require('../src/logger');
  const spy = jest.spyOn(logger.transports[0], 'log').mockImplementation((info, callback) => callback());
  const lastEntry = () => JSON.parse(spy.mock.calls[spy.mock.calls.length - 1][0][MESSAGE]);
  return { logger, spy, lastEntry };
}

describe('logger', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('info() writes structured JSON with service and timestamp', () => {
    const { logger, lastEntry } = loadLogger();
    logger.info('hello');
    expect(lastEntry()).toMatchObject({ level: 'info', service: 'websocket-service', message: 'hello' });
    expect(lastEntry().timestamp).toEqual(expect.any(String));
  });

  it('info() includes properties in the entry', () => {
    const { logger, lastEntry } = loadLogger();
    logger.info('hello', { sessionId: 'abc' });
    expect(lastEntry()).toMatchObject({ message: 'hello', sessionId: 'abc' });
  });

  it('error() with an Error includes its message, stack and extra properties', () => {
    const { logger, lastEntry } = loadLogger();
    logger.error('failed', Object.assign(new Error('boom'), { eventType: 'some_error' }));
    const entry = lastEntry();
    expect(entry).toMatchObject({ level: 'error', message: 'failed boom', eventType: 'some_error' });
    expect(entry.stack).toContain('Error: boom');
  });

  it('error() without an Error logs the properties', () => {
    const { logger, lastEntry } = loadLogger();
    logger.error('failed', { eventType: 'some_error' });
    expect(lastEntry()).toMatchObject({ level: 'error', message: 'failed', eventType: 'some_error' });
  });

  it('debug() is suppressed by the default level (info)', () => {
    const { logger, spy } = loadLogger();
    logger.debug('hidden');
    expect(spy).not.toHaveBeenCalled();
  });

  it.each(['debug', 'DEBUG'])('debug() logs when LOG_LEVEL=%s', (level) => {
    process.env.LOG_LEVEL = level;
    const { logger, lastEntry } = loadLogger();
    logger.debug('visible');
    expect(lastEntry()).toMatchObject({ level: 'debug', message: 'visible' });
  });

  it('child() merges context and per-call properties', () => {
    const { logger, lastEntry } = loadLogger();
    logger.child({ sessionId: 's1', correlationId: 'c1' }).info('hi', { eventType: 'e' });
    expect(lastEntry()).toMatchObject({ message: 'hi', sessionId: 's1', correlationId: 'c1', eventType: 'e' });
  });

  it('child().error() includes context and the Error stack', () => {
    const { logger, lastEntry } = loadLogger();
    logger.child({ sessionId: 's1' }).error('bad', Object.assign(new Error('boom'), { eventType: 'e' }));
    const entry = lastEntry();
    expect(entry).toMatchObject({ level: 'error', message: 'bad boom', sessionId: 's1', eventType: 'e' });
    expect(entry.stack).toContain('Error: boom');
  });

  it('keeps logging after a BigInt or circular property', () => {
    const { logger, lastEntry } = loadLogger();
    const circular = {};
    circular.self = circular;
    expect(() => logger.info('big', { value: BigInt(1) })).not.toThrow();
    expect(() => logger.info('circular', { circular })).not.toThrow();
    logger.info('after');
    expect(lastEntry()).toMatchObject({ message: 'after' });
  });

  it('masks sensitive keys', () => {
    const { logger, lastEntry } = loadLogger();
    logger.info('login', { authToken: 'abc', password: 'p', apiKey: 'k', sessionId: 's1' });
    expect(lastEntry()).toMatchObject({ authToken: '***', password: '***', apiKey: '***', sessionId: 's1' });
  });

  it('masks sensitive keys in child context', () => {
    const { logger, lastEntry } = loadLogger();
    logger.child({ secret: 'x', sessionId: 's1' }).info('hi');
    expect(lastEntry()).toMatchObject({ secret: '***', sessionId: 's1' });
  });

  it('error() with an Error adds exception fields for App Insights', () => {
    const { logger, lastEntry } = loadLogger();
    logger.error('failed', new Error('boom'));
    const entry = lastEntry();
    expect(entry).toMatchObject({ 'exception.type': 'Error', 'exception.message': 'failed boom' });
    expect(entry['exception.stacktrace']).toContain('Error: boom');
  });

  it('logs without an Error carry no exception fields', () => {
    const { logger, lastEntry } = loadLogger();
    logger.error('failed', { eventType: 'e' });
    logger.warn('careful');
    expect(lastEntry()).not.toHaveProperty('exception.stacktrace');
  });
});
