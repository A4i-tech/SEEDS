process.env.AUTH_TYPE = 'native';
process.env.SECRET_KEY = 'test_secret_key';
process.env.JWT_EXPIRES_IN = '1h';
process.env.PASSWORD_SALT_ROUNDS = '4';

jest.mock('../src/auth/authenticateToken', () => (_req, _res, next) => next());

jest.mock('../src/auth/contentCreator/contentCreatorAuthProviderMiddleware', () => ({
  register: jest.fn((req, res) => res.status(201).json({ id: 'creator-1', ...req.body })),
  registerForTenant: jest.fn((req, res) =>
    res.status(201).json({ id: 'creator-tenant', tenantId: req.tenantId, ...req.body }),
  ),
  login: jest.fn((req, res) => res.status(200).json({ token: 'jwt-token', ...req.body })),
  getContentCreatorById: jest.fn(),
  getContentCreatorsByTenantId: jest.fn(),
}));

const provider = require('../src/auth/contentCreator/contentCreatorAuthProviderMiddleware');
const router = require('../src/routes/contentCreatorRouter');

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

function getRouteHandlers(method, path) {
  const layer = router.stack.find(
    (entry) => entry.route && entry.route.path === path && entry.route.methods[method],
  );
  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }
  return layer.route.stack.map((stackEntry) => stackEntry.handle);
}

describe('contentCreatorRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /register registers a content creator', async () => {
    const [registerHandler] = getRouteHandlers('post', '/register');
    const req = {
      body: {
        email: 'creator@example.com',
        password: 'StrongPass1!',
        tenantId: 'tenant-1',
        name: 'Creator Name',
      },
    };
    const res = mockRes();

    await registerHandler(req, res);

    expect(provider.register).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(201);
    expect(res.body.email).toBe('creator@example.com');
  });

  test('POST /login logs in a content creator', async () => {
    const [loginHandler] = getRouteHandlers('post', '/login');
    const req = {
      body: {
        email: 'creator@example.com',
        password: 'StrongPass1!',
      },
    };
    const res = mockRes();

    await loginHandler(req, res);

    expect(provider.login).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBe('jwt-token');
  });

  test('POST /tenant/register blocks non-tenant users', async () => {
    const [, tenantRegisterHandler] = getRouteHandlers('post', '/tenant/register');
    const req = {
      userRole: 'content_creator',
      tenantId: 'tenant-1',
      body: {
        email: 'creator@example.com',
        name: 'Creator',
        password: 'StrongPass1!',
      },
    };
    const res = mockRes();

    await tenantRegisterHandler(req, res);

    expect(provider.registerForTenant).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  test('POST /tenant/register creates content creator for tenant users', async () => {
    const [, tenantRegisterHandler] = getRouteHandlers('post', '/tenant/register');
    const req = {
      userRole: 'tenant',
      tenantId: 'tenant-1',
      body: {
        email: 'creator@example.com',
        name: 'Creator',
        password: 'StrongPass1!',
      },
    };
    const res = mockRes();

    await tenantRegisterHandler(req, res);

    expect(provider.registerForTenant).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(201);
    expect(res.body.tenantId).toBe('tenant-1');
  });

  test('GET / returns creators scoped by tenantId', async () => {
    const [, listHandler] = getRouteHandlers('get', '/');
    provider.getContentCreatorsByTenantId.mockResolvedValue([
      { _id: 'creator-1', email: 'one@example.com', name: 'One', tenantId: 'tenant-1' },
      { _id: 'creator-2', email: 'two@example.com', name: 'Two', tenantId: 'tenant-1' },
    ]);

    const req = { tenantId: 'tenant-1' };
    const res = mockRes();

    await listHandler(req, res);

    expect(provider.getContentCreatorsByTenantId).toHaveBeenCalledWith('tenant-1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].tenantId).toBe('tenant-1');
  });

  test('GET /me blocks non-content-creator roles', async () => {
    const [, meHandler] = getRouteHandlers('get', '/me');
    const req = { userRole: 'tenant' };
    const res = mockRes();

    await meHandler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe('Forbidden');
  });

  test('GET /me returns content creator profile', async () => {
    const [, meHandler] = getRouteHandlers('get', '/me');
    provider.getContentCreatorById.mockResolvedValue({
      _id: 'creator-1',
      email: 'creator@example.com',
      name: 'Creator Name',
      tenantId: 'tenant-1',
    });

    const req = {
      userRole: 'content_creator',
      userId: 'creator-1',
    };
    const res = mockRes();

    await meHandler(req, res);

    expect(provider.getContentCreatorById).toHaveBeenCalledWith('creator-1');
    expect(res.statusCode).toBe(200);
    expect(res.body.role).toBe('content_creator');
  });
});
