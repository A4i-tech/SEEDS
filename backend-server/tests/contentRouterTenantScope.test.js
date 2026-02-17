process.env.AUTH_TYPE = 'native';
process.env.SECRET_KEY = 'test_secret_key';
process.env.JWT_EXPIRES_IN = '1h';
process.env.PASSWORD_SALT_ROUNDS = '4';
process.env.DB_CONNECTION = 'mongodb://example/test';

const mockFind = jest.fn();
const mockFindOne = jest.fn();
const mockFindOneAndUpdate = jest.fn();
const mockUpdateOne = jest.fn();
const mockCollectionFind = jest.fn();
const mockSave = jest.fn();

class MockContentV3 {
  constructor(data) {
    Object.assign(this, data);
  }

  async save() {
    return mockSave(this);
  }
}
MockContentV3.find = mockFind;
MockContentV3.findOne = mockFindOne;
MockContentV3.findOneAndUpdate = mockFindOneAndUpdate;
MockContentV3.updateOne = mockUpdateOne;
MockContentV3.collection = {
  find: mockCollectionFind,
};

jest.mock('../src/models/ContentV3.js', () => ({
  ContentV3: MockContentV3,
  TextContentSchema: {},
}));

jest.mock('agenda', () => {
  return jest.fn().mockImplementation(() => ({
    define: jest.fn(),
    start: jest.fn().mockResolvedValue(undefined),
    now: jest.fn().mockResolvedValue({ attrs: { _id: 'job-1' } }),
    jobs: jest.fn().mockResolvedValue([]),
  }));
});

jest.mock('../src/services/BlobService.js', () => {
  return jest.fn().mockImplementation(() => ({
    getUploadSASToken: jest.fn().mockResolvedValue('sas-token'),
    getContainerClient: jest.fn().mockReturnValue({
      getBlockBlobClient: jest.fn().mockReturnValue({ url: 'https://blob/url' }),
      listBlobsFlat: jest.fn(),
    }),
    getURLWithSAS: jest.fn().mockResolvedValue('https://blob/url?sas'),
  }));
});

jest.mock('../src/jobs/processAudioContent.js', () => jest.fn(async () => undefined));
jest.mock('../src/jobs/processQuizContent.js', () => jest.fn(async () => undefined));

const router = require('../src/routes/contentRouter');

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
  res.send = function send(payload) {
    this.body = payload;
    return this;
  };
  return res;
}

function makeFindChain(result) {
  return {
    sort: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function makeCollectionFindChain(result) {
  return {
    sort: jest.fn().mockReturnValue({
      toArray: jest.fn().mockResolvedValue(result),
    }),
  };
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

describe('contentRouter tenant scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFind.mockReturnValue(makeFindChain([]));
    mockCollectionFind.mockReturnValue(makeCollectionFindChain([]));
    mockFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    mockFindOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    mockUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    mockSave.mockImplementation(async (doc) => ({
      ...doc,
      _id: doc._id || 'content-1',
      toObject: () => ({ ...doc, _id: doc._id || 'content-1' }),
    }));
  });

  test('GET / uses tenantId in query', async () => {
    const [handler] = getRouteHandlers('get', '/');
    const req = {
      tenantId: 'tenant-abc',
      query: { limit: '5' },
    };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-abc', isDeleted: { $ne: true } }),
    );
  });

  test('GET / with ids applies tenant filter', async () => {
    const [handler] = getRouteHandlers('get', '/');
    const req = {
      tenantId: 'tenant-abc',
      query: { ids: 'id-1,id-2' },
    };
    const res = mockRes();

    await handler(req, res);

    expect(mockCollectionFind).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: { $in: ['id-1', 'id-2'] },
        tenantId: 'tenant-abc',
      }),
    );
  });

  test('GET /:contentId queries by tenantId', async () => {
    const [handler] = getRouteHandlers('get', '/:contentId');
    mockFindOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: 'content-1', tenantId: 'tenant-abc' }),
    });

    const req = {
      tenantId: 'tenant-abc',
      params: { contentId: 'content-1' },
    };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'content-1', tenantId: 'tenant-abc' }),
    );
  });

  test('DELETE /:contentId scopes delete by tenantId', async () => {
    const [handler] = getRouteHandlers('delete', '/:contentId');
    const req = {
      tenantId: 'tenant-abc',
      params: { contentId: 'content-1' },
    };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'content-1', tenantId: 'tenant-abc' },
      { $set: { isDeleted: true } },
    );
  });

  test('POST / sets tenantId from auth context', async () => {
    const [handler] = getRouteHandlers('post', '/');
    const req = {
      tenantId: 'tenant-abc',
      body: {
        type: 'story',
        language: 'en',
        title: { english: 'Hello', local: '', audioUrl: '' },
        theme: { english: 'Theme', local: '', audioUrl: '' },
      },
    };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0].tenantId).toBe('tenant-abc');
  });

  test('PATCH / scopes updates by tenantId and content id', async () => {
    const [handler] = getRouteHandlers('patch', '/');
    const updatedDoc = { _id: 'content-1', tenantId: 'tenant-abc', title: { english: 'Updated' } };
    mockFindOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(updatedDoc) });

    const req = {
      tenantId: 'tenant-abc',
      query: { isAudioUploaded: 'true' },
      body: {
        _id: 'content-1',
        title: { english: 'Updated', local: '', audioUrl: '' },
      },
    };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'content-1', tenantId: 'tenant-abc', isDeleted: { $ne: true } },
      { $set: expect.objectContaining({ isProcessed: false }) },
      { new: true },
    );
  });
});
