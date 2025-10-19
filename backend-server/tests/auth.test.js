process.env.SECRET_KEY = 'test_secret';

const authenticateToken = require('../src/auth/authenticateToken');
const jwt = require('jsonwebtoken');

const STATUS_UNAUTHORIZED = 401;
const STATUS_FORBIDDEN = 403;
const STATUS_BAD_REQUEST = 400;
const STATUS_INTERNAL_SERVER_ERROR = 500;

const SECRET_KEY = process.env.SECRET_KEY || 'test_secret';
const TEST_EMAIL = 'authtest@example.com';
const TEST_ID = '1234567890abcdef';

function getMockReq(token) {
    return {
        headers: token ? {authorization: `Bearer ${token}`} : {},
    };
}

function getMockRes() {
    const res = {};
    res.statusCode = null;
    res.status = function (code) {
        this.statusCode = code;
        return this;
    };
    res.sendStatus = function (code) {
        this.statusCode = code;
        return this;
    };
    res.json = function (obj) {
        this.body = obj;
        return this;
    };
    return res;
}

describe('authenticateToken middleware', () => {
    test('should call next and set req.user for valid token with email', (done) => {
        const token = jwt.sign({ email: TEST_EMAIL, id: TEST_ID }, SECRET_KEY, { expiresIn: '1h' });
        const req = getMockReq(token);
        const res = getMockRes();
        authenticateToken(req, res, () => {
            try {
                expect(req.user.email).toBe(TEST_EMAIL);
                done();
            } catch (error) {
                done(error);
            }
        });
    });

    test('should return 401 if token is missing', () => {
        const req = getMockReq();
        const res = getMockRes();
        let nextCalled = false;
        authenticateToken(req, res, () => {
            nextCalled = true;
        });
        expect(res.statusCode).toBe(STATUS_UNAUTHORIZED);
        expect(nextCalled).toBe(false);
    });

    test('should return 403 if token is invalid', () => {
        const req = getMockReq('invalidtoken');
        const res = getMockRes();
        let nextCalled = false;
        authenticateToken(req, res, () => {
            nextCalled = true;
        });
        expect(res.statusCode).toBe(STATUS_FORBIDDEN);
        expect(nextCalled).toBe(false);
    });

    test('should return 403 if token is expired', () => {
        const token = jwt.sign({ email: TEST_EMAIL, id: TEST_ID }, SECRET_KEY, {expiresIn: '-1s'});
        const req = getMockReq(token);
        const res = getMockRes();
        let nextCalled = false;
        authenticateToken(req, res, () => {
            nextCalled = true;
        });
        expect(res.statusCode).toBe(STATUS_FORBIDDEN);
        expect(nextCalled).toBe(false);
    });

    test('should return 401 if authorization header is present but token is missing', () => {
        const req = { headers: { authorization: 'Bearer ' } };
        const res = getMockRes();
        let nextCalled = false;
        authenticateToken(req, res, () => {
            nextCalled = true;
        });
        expect(res.statusCode).toBe(STATUS_UNAUTHORIZED);
        expect(nextCalled).toBe(false);
    });

    test('should throw error if SECRET_KEY is not defined', () => {
        const originalSecret = process.env.SECRET_KEY;
        delete process.env.SECRET_KEY;
        jest.resetModules();
        expect(() => {
            require('../src/auth/authenticateToken');
        }).toThrow('SECRET_KEY environment variable must be defined and non-empty');
        process.env.SECRET_KEY = originalSecret;
        jest.resetModules();
    });
});

describe('nativeAuthProvider edge cases', () => {
    let originalSecretKey;
    let nativeAuthProvider;
    let Tenant;

    beforeAll(() => {
        nativeAuthProvider = require('../src/auth/nativeAuthProvider');
        Tenant = require('../src/models/Tenant');

        originalSecretKey = process.env.SECRET_KEY;
        process.env.SECRET_KEY = 'test_secret_key';
    });

    afterAll(() => {
        jest.resetAllMocks();
        process.env.SECRET_KEY = originalSecretKey;
    });

    beforeEach(() => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('register returns 400 if fields are missing', async () => {
        const req = { body: { email: '', password: '', name: '' } };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };

        await nativeAuthProvider.register(req, res);

        expect(res.status).toHaveBeenCalledWith(STATUS_BAD_REQUEST);
        expect(res.json).toHaveBeenCalledWith({ message: 'All three fields required' });
    });

    test('throws error if SECRET_KEY is missing', () => {
        delete process.env.SECRET_KEY;
        jest.resetModules();
        expect(() => {
            require('../src/auth/nativeAuthProvider')
        }).toThrow('SECRET_KEY environment variable must be defined and non-empty');
    });

    test('login returns 500 on internal error', async () => {
        jest.spyOn(Tenant, 'findOne').mockImplementation(() => { throw new Error('DB error'); });
        const req = { body: { email: 'a@b.com', password: 'TestPassword123!' } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        await nativeAuthProvider.login(req, res);
        expect(res.status).toHaveBeenCalledWith(STATUS_INTERNAL_SERVER_ERROR);
        expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error' });
        jest.restoreAllMocks();
    });

    test('register returns 500 on internal error', async () => {
        jest.spyOn(Tenant, 'findOne').mockImplementation(() => { throw new Error('DB error'); });
        const req = { body: { email: 'a@b.com', password: 'TestPassword123!', name: 'Test' } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        await nativeAuthProvider.register(req, res);
        expect(res.status).toHaveBeenCalledWith(STATUS_INTERNAL_SERVER_ERROR);
        expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error' });
        jest.restoreAllMocks();
    });
});
