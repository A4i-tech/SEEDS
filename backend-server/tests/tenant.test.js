const request = require('supertest');
const app = require('../index');
const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');

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
        // Connect to a test database
        await mongoose.connect(DB_CONNECTION, {useNewUrlParser: true, useUnifiedTopology: true});
    }, 20000); // Increased timeout to 20 seconds

    afterAll(async () => {
        // Clean up database and close connection
        await Tenant.deleteMany({});
        await mongoose.connection.close();
    }, 20000); // Increased timeout to 20 seconds

    test('Register a new tenant', async () => {
        const res = await request(app)
            .post('/tenant/register')
            .send({
                email: TEST_EMAIL,
                password: TEST_PASSWORD,
                name: TEST_NAME
            });
        expect(res.statusCode).toBe(STATUS_CREATED);
        expect(res.body.message).toBe('Tenant registered successfully');
    });

    test('Login with correct credentials', async () => {
        const res = await request(app)
            .post('/tenant/login')
            .send({
                email: TEST_EMAIL,
                password: TEST_PASSWORD
            });
        expect(res.statusCode).toBe(STATUS_OK);
        expect(res.body.token).toBeDefined();
    });

    test('Login with wrong password fails', async () => {
        const res = await request(app)
            .post('/tenant/login')
            .send({
                email: TEST_EMAIL,
                password: 'WrongPassword'
            });
        expect(res.statusCode).toBe(STATUS_UNAUTHORIZED);
        expect(res.body.message).toBe('Invalid credentials');
    });

    test('Register with existing email fails', async () => {
        const res = await request(app)
            .post('/tenant/register')
            .send({
                email: TEST_EMAIL,
                password: 'AnotherPassword1!',
                name: 'Another Tenant'
            });
        expect(res.statusCode).toBe(STATUS_CONFLICT);
        expect(res.body.message).toBe('Email already exists');
    });

    test('Register fails with missing email', async () => {
        const res = await request(app)
            .post('/tenant/register')
            .send({
                password: TEST_PASSWORD,
                name: TEST_NAME
            });
        expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
        expect(res.body.message).toBe('All three fields required');
    });

    test('Register fails with missing password', async () => {
        const res = await request(app)
            .post('/tenant/register')
            .send({
                email: TEST_EMAIL,
                name: TEST_NAME
            });
        expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
        expect(res.body.message).toBe('All three fields required');
    });

    test('Register fails with missing name', async () => {
        const res = await request(app)
            .post('/tenant/register')
            .send({
                email: TEST_EMAIL,
                password: TEST_PASSWORD
            });
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

    test('Login fails when tenant not found', async () => {
        const res = await request(app)
            .post('/tenant/login')
            .send({
                email: 'notfound@example.com',
                password: 'AnyPassword123'
            });
        expect(res.statusCode).toBe(STATUS_UNAUTHORIZED);
        expect(res.body.message).toBe('Invalid credentials');
    });
});
