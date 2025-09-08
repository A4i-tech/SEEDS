process.env.AUTH_TYPE = 'native';

const loginService = require('../models/loginService');
const STATUS_OK = 200;

function getMockReq() {
    return {};
}

function getMockRes() {
    const res = {};
    res.statusCode = null;
    res.status = function (code) {
        this.statusCode = code;
        return this;
    };
    res.json = function (obj) {
        this.body = obj;
        return this;
    };
    return res;
}

describe('loginService', () => {
    test('should return native service when AUTH_TYPE is not set', () => {
        delete process.env.AUTH_TYPE;
        const req = getMockReq();
        const res = getMockRes();
        loginService.loginService(req, res);
        expect(res.statusCode).toBe(STATUS_OK);
        expect(res.body).toEqual({ service: 'native' });
    });

    test('should return native service when AUTH_TYPE is set to native', () => {
        process.env.AUTH_TYPE = 'native';
        const req = getMockReq();
        const res = getMockRes();
        loginService.loginService(req, res);
        expect(res.statusCode).toBe(STATUS_OK);
        expect(res.body).toEqual({ service: 'native' });
    });

    test('should return firebase service when AUTH_TYPE is set to firebase', () => {
        process.env.AUTH_TYPE = 'firebase';
        const req = getMockReq();
        const res = getMockRes();
        loginService.loginService(req, res);
        expect(res.statusCode).toBe(STATUS_OK);
        expect(res.body).toEqual({ service: 'firebase' });
    });
});
