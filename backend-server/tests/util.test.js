jest.mock('../models/LogEntry');

const util = require('../util');
const LogEntry = require('../models/LogEntry');

describe('Util Functions', () => {
    let mocks;

    // Consolidated test data and mock factory
    const CONFIG = {
        req: { originalUrl: '/api/test', method: 'POST', body: { test: 'data' } },
        res: { success: true, data: 'test response' },
        error: { message: 'Test error message' }
    };

    const createMocks = (reqOverrides = {}) => {
        const res = { statusCode: 200, status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
        res.json.bind = jest.fn(() => res.json);
        return {
            req: { ...CONFIG.req, ...reqOverrides },
            res,
            next: jest.fn(),
            logEntry: { save: jest.fn().mockResolvedValue(true) },
            consoleSpy: jest.spyOn(console, 'log').mockImplementation(),
            errorSpy: jest.spyOn(console, 'error').mockImplementation()
        };
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mocks = createMocks();
        LogEntry.mockImplementation(() => mocks.logEntry);
    });

    afterEach(() => { mocks.consoleSpy.mockRestore(); mocks.errorSpy.mockRestore(); });

    describe('tryCatchWrapper', () => {
        const syncResult = { sync: true };
        const successTests = [
            ['async result', CONFIG.res, jest.fn().mockResolvedValue(CONFIG.res)],
            ['sync result', syncResult, jest.fn().mockReturnValue(syncResult)]
        ];

        test.each(successTests)('should handle %s', async (_, expected, mockFn) => {
            const result = await util.tryCatchWrapper(mockFn)(mocks.req, mocks.res);
            expect(mockFn).toHaveBeenCalledWith(mocks.req, mocks.res);
            expect(result).toBe(expected);
            expect(mocks.res.status).not.toHaveBeenCalled();
        });

        const errorTests = [
            ['async errors', () => Promise.reject(new Error(CONFIG.error.message))],
            ['sync errors', () => { throw new Error(CONFIG.error.message); }]
        ];

        test.each(errorTests)('should handle %s', async (_, errorFn) => {
            const result = await util.tryCatchWrapper(jest.fn().mockImplementation(errorFn))(mocks.req, mocks.res);
            expect(mocks.consoleSpy).toHaveBeenCalledWith(expect.stringContaining(CONFIG.error.message));
            expect(mocks.res.status).toHaveBeenCalledWith(400);
            expect(mocks.res.json).toHaveBeenCalledWith({ message: CONFIG.error.message, stack: expect.any(String) });
            expect(result).toBe(mocks.res);
        });

        it('should preserve function context and arguments', async () => {
            const mockFn = jest.fn().mockResolvedValue('success');
            await util.tryCatchWrapper(mockFn).call({}, mocks.req, mocks.res, 'extra');
            expect(mockFn).toHaveBeenCalledWith(mocks.req, mocks.res, 'extra');
        });
    });

    describe('tryCatchWrapperLog', () => {
        const expectLogEntry = (responseBody, statusCode = 200) => expect(LogEntry).toHaveBeenCalledWith({
            path: mocks.req.originalUrl, method: mocks.req.method, requestBody: mocks.req.body,
            responseBody, statusCode, timestamp: expect.any(Date)
        });

        it('should execute function and setup response logging', async () => {
            const mockFn = jest.fn();
            await util.tryCatchWrapperLog(mockFn)(mocks.req, mocks.res, mocks.next);
            expect(mockFn).toHaveBeenCalledWith(mocks.req, mocks.res, mocks.next);
            expect(LogEntry).not.toHaveBeenCalled();
        });

        it('should log response when res.json is called', async () => {
            const mockFn = jest.fn().mockImplementation((req, res) => res.json(CONFIG.res));
            await util.tryCatchWrapperLog(mockFn)(mocks.req, mocks.res, mocks.next);
            expectLogEntry(CONFIG.res);
            expect(mocks.logEntry.save).toHaveBeenCalled();
        });

        it('should handle log save errors gracefully', async () => {
            mocks.logEntry.save.mockRejectedValue(new Error('DB failed'));
            const mockFn = jest.fn().mockImplementation((req, res) => res.json(CONFIG.res));
            await util.tryCatchWrapperLog(mockFn)(mocks.req, mocks.res, mocks.next);
            expect(mocks.errorSpy).toHaveBeenCalledWith('Log could not be saved', expect.any(Error));
        });

        const errorTests = [
            ['async errors', () => Promise.reject(new Error(CONFIG.error.message))],
            ['sync errors', () => { throw new Error(CONFIG.error.message); }]
        ];

        test.each(errorTests)('should handle %s', async (_, errorFn) => {
            await util.tryCatchWrapperLog(jest.fn().mockImplementation(errorFn))(mocks.req, mocks.res, mocks.next);
            expect(mocks.errorSpy).toHaveBeenCalledWith('Error:', expect.any(Error));
            expectLogEntry({ message: CONFIG.error.message, stack: expect.any(String) }, 400);
            expect(mocks.res.status).toHaveBeenCalledWith(400);
        });

        it('should handle error log save failures', async () => {
            mocks.logEntry.save.mockRejectedValue(new Error('Log save failed'));
            await util.tryCatchWrapperLog(jest.fn().mockRejectedValue(new Error(CONFIG.error.message)))(mocks.req, mocks.res, mocks.next);
            expect(mocks.errorSpy).toHaveBeenCalledWith('Log could not be saved', expect.any(Error));
        });

        it('should restore original res.json after response', async () => {
            const originalJson = mocks.res.json;
            const mockFn = jest.fn().mockImplementation((req, res) => {
                const modifiedJson = res.json;
                res.json(CONFIG.res);
                expect(res.json).toBe(originalJson);
                expect(modifiedJson).not.toBe(originalJson);
            });
            await util.tryCatchWrapperLog(mockFn)(mocks.req, mocks.res, mocks.next);
        });

        const reqVariationTests = [
            ['different URL', { originalUrl: '/api/different' }],
            ['GET method', { method: 'GET' }],
            ['empty body', { body: {} }],
            ['no body', { body: undefined }]
        ];

        test.each(reqVariationTests)('should handle %s', async (_, overrides) => {
            mocks = createMocks(overrides);
            LogEntry.mockImplementation(() => mocks.logEntry);
            const mockFn = jest.fn().mockImplementation((req, res) => res.json(CONFIG.res));
            await util.tryCatchWrapperLog(mockFn)(mocks.req, mocks.res, mocks.next);
            expect(LogEntry).toHaveBeenCalledWith(expect.objectContaining({
                path: mocks.req.originalUrl, method: mocks.req.method, requestBody: mocks.req.body
            }));
        });
    });
});