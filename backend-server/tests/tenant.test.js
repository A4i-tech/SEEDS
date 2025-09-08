const request = require('supertest');
const app = require('../index');
const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const authProvider = require('../auth/authProviderMiddleware');

const STATUS_OK = 200;
const STATUS_CREATED = 201;
const STATUS_BAD_REQUEST = 400;
const STATUS_UNAUTHORIZED = 401;
const STATUS_CONFLICT = 409;

const TEST_EMAIL = 'testtenant@example.com';
const TEST_PASSWORD = 'TestPassword123!';
const TEST_NAME = 'Test Tenant';

const DB_CONNECTION = process.env.DB_CONNECTION;

describe('Tenant Auth API', () => {
    beforeAll(async () => {
        await mongoose.connect(DB_CONNECTION, {useNewUrlParser: true, useUnifiedTopology: true});
    });

    afterAll(async () => {
        await Tenant.deleteMany({});
        await mongoose.connection.close();
    });

    test('Register a new tenant', async () => {
        const res = await request(app)
            .post('/tenant/register')
            .send({ email: TEST_EMAIL, password: TEST_PASSWORD, name: TEST_NAME });
        expect(res.statusCode).toBe(STATUS_CREATED);
        expect(res.body.message).toBe('Tenant registered successfully');
    });

    test('Register fails with missing email', async () => {
        const res = await request(app)
            .post('/tenant/register')
            .send({ password: TEST_PASSWORD, name: TEST_NAME });
        expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
        expect(res.body.message).toBe('All three fields required');
    });

    test('Register fails with missing password', async () => {
        const res = await request(app)
            .post('/tenant/register')
            .send({ email: TEST_EMAIL, name: TEST_NAME });
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
            .send({ email: 'invalid-email', password: TEST_PASSWORD, name: TEST_NAME });
        expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
        expect(res.body.message).toBe('Invalid email format');
    });

    test('Register fails with weak password', async () => {
        const res = await request(app)
            .post('/tenant/register')
            .send({ email: TEST_EMAIL, password: 'weak', name: TEST_NAME });
        expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
        expect(res.body.message).toBe('Password must be at least 8 characters, and include uppercase, lowercase, number, and special character');
    });

    test('Register with existing email fails', async () => {
        const res = await request(app)
            .post('/tenant/register')
            .send({ email: TEST_EMAIL, password: 'AnotherPassword1!', name: 'Another Tenant' });
        expect(res.statusCode).toBe(STATUS_CONFLICT);
        expect(res.body.message).toBe('Email already exists');
    });

    test('Register fails when registration is managed externally', async () => {
        // Simulate registration managed externally
        const originalSupportsRegistration = authProvider.supportsRegistration;
        authProvider.supportsRegistration = () => false;
        const res = await request(app)
            .post('/tenant/register')
            .send({ email: TEST_EMAIL, password: TEST_PASSWORD, name: TEST_NAME });
        expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
        expect(res.body.message).toBe('Registration is managed externally.');
        authProvider.supportsRegistration = originalSupportsRegistration;
    });

    test('Login with correct credentials', async () => {
        const res = await request(app)
            .post('/tenant/login')
            .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
        expect(res.statusCode).toBe(STATUS_OK);
        expect(res.body.token).toBeDefined();
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

    test('Get login type - native', async () => {
        const originalGetLoginType = authProvider.getLoginType;
        authProvider.getLoginType = () => 'native';

        const res = await request(app)
            .get('/tenant/loginType');

        expect(res.statusCode).toBe(STATUS_OK);
        expect(res.body).toEqual({ loginType: 'native' });

        authProvider.getLoginType = originalGetLoginType;
    });

    test('Get login type - firebase', async () => {
        const originalGetLoginType = authProvider.getLoginType;
        authProvider.getLoginType = () => 'firebase';

        const res = await request(app)
            .get('/tenant/loginType');

        expect(res.statusCode).toBe(STATUS_OK);
        expect(res.body).toEqual({ loginType: 'firebase' });

        authProvider.getLoginType = originalGetLoginType;
    });
});
