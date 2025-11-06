process.env.AUTH_TYPE = 'native';
process.env.SECRET_KEY = 'test-secret-key-for-testing-purposes-123';

process.env.AZURE_STORAGE_ACCOUNT_NAME = 'mockaccountname';
process.env.AZURE_STORAGE_ACCOUNT_KEY = 'mockkeymockkeymockkeymockkeymockkeymockkeymockkeymockkey';

const request = require('supertest');
const app = require('../src/index');
const mongoose = require('mongoose');
const Tenant = require('../src/models/Tenant');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { beforeEach, afterEach, describe } = require("node:test");

const STATUS_OK = 200;
const STATUS_CREATED = 201;
const STATUS_BAD_REQUEST = 400;
const STATUS_UNAUTHORIZED = 401;
const STATUS_CONFLICT = 409;
const STATUS_INTERNAL_SERVER_ERROR = 500;

const TEST_EMAIL = 'testtenant@example.com';
const TEST_PHONE = '1234567890';
const TEST_PASSWORD = 'TestPassword123!';
const TEST_NAME = 'Test Tenant';

const originalAuthType = process.env.AUTH_TYPE;
let authProvider = '';
let monod;

describe('Tenant Auth API', () => {
    beforeAll(async () => {
        monod = await MongoMemoryServer.create();
        await mongoose.connect(monod.getUri(), { useNewUrlParser: true, useUnifiedTopology: true });
    });

    afterAll(async () => {
        await Tenant.deleteMany({});
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
        await monod.stop();
    });

    beforeEach(async () => {
        jest.resetModules(); // Clear module cache
        process.env.AUTH_TYPE = 'native'; // Ensure native for every test

        // Re-import the authProviderMiddleware
        jest.isolateModules(() => {
            authProvider = require('../auth/authProviderMiddleware');
        });
    });

    afterEach(async () => {
        const collections = await mongoose.connection.db.collections();
        for (let collection of collections) {
            await collection.deleteMany({});
        }
        process.env.AUTH_TYPE = originalAuthType; // Restore the original AUTH_TYPE
    });

    test('Register fails with missing email', async () => {
        const res = await request(app)
            .post('/tenant/register')
            .send({ password: TEST_PASSWORD, tenantName: TEST_NAME });
        expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
        expect(res.body.message).toBe('All three fields required');
    });

    test('Register fails with missing password', async () => {
        const res = await request(app)
            .post('/tenant/register')
            .send({ email: TEST_EMAIL, tenantName: TEST_NAME });
        expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
        expect(res.body.message).toBe('All three fields required');
    });

    test('Register fails with missing name', async () => {
        const res = await request(app)
            .post('/tenant/register')
            .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
        expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
        expect(res.body.message).toBe('All three fields required');
    });

    test('Register fails with all fields missing', async () => {
        const res = await request(app)
            .post('/tenant/register')
            .send({});
        expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
        expect(res.body.message).toBe('All three fields required');
    });

    test('Register fails with invalid email format', async () => {
        const res = await request(app)
            .post('/tenant/register')
            .send({ email: 'invalid-email', password: TEST_PASSWORD, tenantName: TEST_NAME });
        expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
        expect(res.body.message).toBe('Invalid email format');
    });

    test('Register fails with weak password', async () => {
        const res = await request(app)
            .post('/tenant/register')
            .send({ email: TEST_EMAIL, password: 'weak', tenantName: TEST_NAME });
        expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
        expect(res.body.message).toBe('Password must be at least 8 characters, and include uppercase, lowercase, number, and special character');
    });

    test('Login fails with missing email', async () => {
        const res = await request(app)
            .post('/tenant/login')
            .send({ password: TEST_PASSWORD });
        expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
        expect(res.body.message).toBe('Email and password are required');
    });

    test('Login fails with missing password', async () => {
        const res = await request(app)
            .post('/tenant/login')
            .send({ email: TEST_EMAIL });
        expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
        expect(res.body.message).toBe('Email and password are required');
    });

    test('Login fails with wrong password', async () => {
        const res = await request(app)
            .post('/tenant/login')
            .send({ email: TEST_EMAIL, password: 'WrongPassword' });
        expect(res.statusCode).toBe(STATUS_UNAUTHORIZED);
        expect(res.body.message).toBe('Invalid credentials');
    });

    test('Login fails when tenant not found', async () => {
        const res = await request(app)
            .post('/tenant/login')
            .send({ email: 'notfound@example.com', password: 'AnyPassword123' });
        expect(res.statusCode).toBe(STATUS_UNAUTHORIZED);
        expect(res.body.message).toBe('Invalid credentials');
    });

    test('Firebase login fails with invalid token', async () => {
        // Simulate Firebase provider
        const originalAuthType = process.env.AUTH_TYPE;
        process.env.AUTH_TYPE = 'firebase';
        const res = await request(app)
            .post('/tenant/login')
            .set('authtoken', 'invalid-token');
        expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
        process.env.AUTH_TYPE = originalAuthType;
    });
});