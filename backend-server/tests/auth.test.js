const { authenticateToken } = require('../src/auth/authenticateToken');
const jwt = require('jsonwebtoken');

const STATUS_UNAUTHORIZED = 401;
const STATUS_FORBIDDEN = 403;

const SECRET_KEY = process.env.SECRET_KEY;
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
});