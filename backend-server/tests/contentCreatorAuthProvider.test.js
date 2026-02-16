process.env.AUTH_TYPE = 'native';
process.env.SECRET_KEY = 'test_secret_key';
process.env.JWT_EXPIRES_IN = '1h';
process.env.PASSWORD_SALT_ROUNDS = '4';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

jest.mock('../src/auth/dbAdapters/nativeDb', () => ({
  getTenantById: jest.fn(),
  getContentCreatorByEmail: jest.fn(),
  insertContentCreator: jest.fn(),
  getContentCreatorById: jest.fn(),
  getContentCreatorsByTenantId: jest.fn(),
}));

const nativeDb = require('../src/auth/dbAdapters/nativeDb');
const provider = require('../src/auth/contentCreator/contentCreatorAuthProviderMiddleware');

function mockRes() {
  const res = {};
  res.statusCode = 200;
  res.body = null;
  res.status = function status(code) {
    this.statusCode = code;
    return this;
  };
  res.json = function json(payload) {
    this.body = payload;
    return this;
  };
  return res;
}

describe('contentCreatorAuthProviderMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('register hashes password and stores content creator', async () => {
    nativeDb.getTenantById.mockResolvedValue({ _id: 'tenant-1', tenantName: 'Tenant One' });
    nativeDb.getContentCreatorByEmail.mockResolvedValue(null);
    nativeDb.insertContentCreator.mockImplementation(async (payload) => ({ ...payload, _id: 'creator-1' }));

    const req = {
      body: {
        email: 'creator@example.com',
        password: 'StrongPass1!',
        tenantId: 'tenant-1',
        name: 'Creator Name',
      },
    };
    const res = mockRes();

    await provider.register(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe('creator-1');
    expect(nativeDb.insertContentCreator).toHaveBeenCalledTimes(1);

    const inserted = nativeDb.insertContentCreator.mock.calls[0][0];
    expect(inserted.email).toBe('creator@example.com');
    expect(inserted.tenantId).toBe('tenant-1');
    expect(inserted.name).toBe('Creator Name');
    expect(inserted.password).not.toBe('StrongPass1!');
    await expect(bcrypt.compare('StrongPass1!', inserted.password)).resolves.toBe(true);
  });

  test('login returns token containing role and tenantId', async () => {
    const hashedPassword = await bcrypt.hash('StrongPass1!', 4);
    nativeDb.getContentCreatorByEmail.mockResolvedValue({
      _id: 'creator-1',
      email: 'creator@example.com',
      tenantId: 'tenant-1',
      name: 'Creator Name',
      password: hashedPassword,
    });
    nativeDb.getTenantById.mockResolvedValue({ _id: 'tenant-1', tenantName: 'Tenant One' });

    const req = {
      body: {
        email: 'creator@example.com',
        password: 'StrongPass1!',
      },
    };
    const res = mockRes();

    await provider.login(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.role).toBe('content_creator');
    expect(res.body.tenantId).toBe('tenant-1');

    const decoded = jwt.verify(res.body.token, process.env.SECRET_KEY);
    expect(decoded.role).toBe('content_creator');
    expect(decoded.tenantId).toBe('tenant-1');
    expect(decoded.id).toBe('creator-1');
  });

  test('login fails with invalid credentials', async () => {
    nativeDb.getContentCreatorByEmail.mockResolvedValue(null);

    const req = {
      body: {
        email: 'creator@example.com',
        password: 'WrongPass1!',
      },
    };
    const res = mockRes();

    await provider.login(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });
});
