const BlobService = require('../../services/BlobService');
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions } = require("@azure/storage-blob");
const { DefaultAzureCredential } = require("@azure/identity");

// Mock Azure SDK dependencies
jest.mock("@azure/storage-blob");
jest.mock("@azure/identity");

describe('BlobService', () => {
    let blobService;
    let mockBlobServiceClient;
    let mockContainerClient;
    let mockBlobClient;
    let mockCredential;

    // Test constants
    const AZURE_CONFIG = {
        accountName: 'seedsblob',
        baseUrl: 'https://seedsblob.blob.core.windows.net',
        containerName: 'container'
    };

    const TEST_PATHS = {
        simple: 'folder/blob.txt',
        withSpaces: 'folder/blob with spaces.txt',
        encoded: 'folder/file%20with%20spaces.txt',
        nested: 'level1/level2/level3/file.json',
        multiDots: 'folder/file.backup.txt',
        noExtension: 'folder/subfolder/file'
    };

    // Helper to build test URLs
    const buildUrl = (path) => `${AZURE_CONFIG.baseUrl}/${AZURE_CONFIG.containerName}/${path}`;

    const TEST_URLS = {
        simple: buildUrl(TEST_PATHS.simple),
        withSpaces: buildUrl(TEST_PATHS.withSpaces),
        encoded: buildUrl('folder/file%20with%20spaces.txt'),
        nested: buildUrl(TEST_PATHS.nested),
        multiDots: buildUrl(TEST_PATHS.multiDots),
        noExtension: buildUrl(TEST_PATHS.noExtension),
        invalid: `${AZURE_CONFIG.baseUrl}/${AZURE_CONFIG.containerName}`,
        malformed: 'not-a-valid-url'
    };

    const TEST_DATA = {
        containerName: 'test-container',
        blobName: 'test-blob.txt',
        buffer: Buffer.from('test content'),
        userDelegationKey: { key: 'mock-key' },
        sasToken: 'mocked-sas-token',
        accountName: AZURE_CONFIG.accountName
    };

    // Helper functions
    const setupMockUserDelegationKey = () => {
        mockBlobServiceClient.getUserDelegationKey.mockResolvedValue(TEST_DATA.userDelegationKey);
    };

    const setupMockDownload = (buffer = TEST_DATA.buffer) => {
        mockBlobClient.downloadToBuffer.mockResolvedValue(buffer);
    };

    const expectBlobClientCall = (expectedPath) => {
        expect(mockContainerClient.getBlobClient).toHaveBeenCalledWith(expectedPath);
    };

    const expectContainerClientCall = (containerName = AZURE_CONFIG.containerName) => {
        expect(mockBlobServiceClient.getContainerClient).toHaveBeenCalledWith(containerName);
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mocks
        mockCredential = {};
        DefaultAzureCredential.mockImplementation(() => mockCredential);

        mockBlobClient = {
            url: `${AZURE_CONFIG.baseUrl}/${AZURE_CONFIG.containerName}/blob/path`,
            downloadToBuffer: jest.fn()
        };

        mockContainerClient = {
            getBlobClient: jest.fn().mockReturnValue(mockBlobClient)
        };

        mockBlobServiceClient = {
            accountName: AZURE_CONFIG.accountName,
            getContainerClient: jest.fn().mockReturnValue(mockContainerClient),
            getUserDelegationKey: jest.fn()
        };
        BlobServiceClient.mockImplementation(() => mockBlobServiceClient);

        generateBlobSASQueryParameters.mockReturnValue({
            toString: () => TEST_DATA.sasToken
        });

        BlobSASPermissions.parse = jest.fn().mockReturnValue({
            toString: () => 'rw'
        });
        const mockBlobSASPermissions = {
            read: false,
            toString: jest.fn().mockReturnValue('r')
        };
        BlobSASPermissions.mockImplementation(() => mockBlobSASPermissions);

        blobService = new BlobService();
    });

    describe('Constructor', () => {
        it('should initialize BlobServiceClient with correct parameters', () => {
            expect(DefaultAzureCredential).toHaveBeenCalled();
            expect(BlobServiceClient).toHaveBeenCalledWith(
                AZURE_CONFIG.baseUrl,
                mockCredential
            );
        });
    });

    describe('getContainerClient', () => {
        it('should return container client for given container name', () => {
            const result = blobService.getContainerClient(TEST_DATA.containerName);

            expect(mockBlobServiceClient.getContainerClient).toHaveBeenCalledWith(TEST_DATA.containerName);
            expect(result).toBe(mockContainerClient);
        });
    });

    describe('getBlobServiceClient', () => {
        it('should return the blob service client', () => {
            const result = blobService.getBlobServiceClient();
            expect(result).toBe(mockBlobServiceClient);
        });
    });

    describe('getUploadSASToken', () => {
        it('should generate SAS token for upload with correct parameters', async () => {
            setupMockUserDelegationKey();

            const result = await blobService.getUploadSASToken(TEST_DATA.blobName, TEST_DATA.containerName);

            expect(mockBlobServiceClient.getUserDelegationKey).toHaveBeenCalledWith(
                expect.any(Date),
                expect.any(Date)
            );
            expect(BlobSASPermissions.parse).toHaveBeenCalledWith('rw');
            expect(generateBlobSASQueryParameters).toHaveBeenCalledWith(
                expect.objectContaining({
                    containerName: TEST_DATA.containerName,
                    blobName: TEST_DATA.blobName,
                    permissions: expect.any(Object)
                }),
                TEST_DATA.userDelegationKey,
                AZURE_CONFIG.accountName
            );
            expect(result).toBe(TEST_DATA.sasToken);
        });

        it('should handle errors when generating SAS token', async () => {
            const error = new Error('Failed to get user delegation key');
            mockBlobServiceClient.getUserDelegationKey.mockRejectedValue(error);

            await expect(blobService.getUploadSASToken(TEST_DATA.blobName, TEST_DATA.containerName))
                .rejects.toThrow('Failed to get user delegation key');
        });
    });

    describe('getURLWithSAS', () => {
        it('should generate SAS URL for given blob URL', async () => {
            setupMockUserDelegationKey();

            const result = await blobService.getURLWithSAS(TEST_URLS.simple);

            expectContainerClientCall();
            expectBlobClientCall('folder/blob.txt');
            expect(result).toBe(`${mockBlobClient.url}?${TEST_DATA.sasToken}`);
        });

        it('should handle encoded URLs correctly', async () => {
            setupMockUserDelegationKey();
            const encodedUrl = encodeURIComponent(TEST_URLS.withSpaces);

            await blobService.getURLWithSAS(encodedUrl);

            expectBlobClientCall('folder/blob%20with%20spaces.txt');
        });

        it('should handle errors when generating SAS URL', async () => {
            const error = new Error('Failed to get user delegation key');
            mockBlobServiceClient.getUserDelegationKey.mockRejectedValue(error);

            await expect(blobService.getURLWithSAS(TEST_URLS.simple))
                .rejects.toThrow('Failed to get user delegation key');
        });
    });

    describe('downloadBlobToBuffer', () => {
        it('should download blob to buffer successfully', async () => {
            setupMockDownload();

            const result = await blobService.downloadBlobToBuffer(TEST_URLS.simple);

            expectContainerClientCall();
            expectBlobClientCall('folder/blob.txt');
            expect(mockBlobClient.downloadToBuffer).toHaveBeenCalled();
            expect(result).toBe(TEST_DATA.buffer);
        });

        it('should handle encoded URLs in download', async () => {
            setupMockDownload();
            const encodedUrl = encodeURIComponent(TEST_URLS.withSpaces);

            await blobService.downloadBlobToBuffer(encodedUrl);

            expectBlobClientCall('folder/blob%20with%20spaces.txt');
        });

        it('should handle download errors', async () => {
            const error = new Error('Blob not found');
            mockBlobClient.downloadToBuffer.mockRejectedValue(error);

            await expect(blobService.downloadBlobToBuffer(TEST_URLS.simple))
                .rejects.toThrow('Blob not found');
        });
    });

    describe('extractBlobPathWithoutExtension', () => {
        const testCases = [
            { url: TEST_URLS.simple, expected: 'folder/blob', description: 'extract blob path without extension' },
            { url: TEST_URLS.noExtension, expected: 'folder/subfolder/file', description: 'handle URLs without extensions' },
            { url: TEST_URLS.nested, expected: 'level1/level2/level3/file', description: 'handle nested folder structures' },
            { url: TEST_URLS.multiDots, expected: 'folder/file.backup', description: 'handle files with multiple dots in name' }
        ];

        testCases.forEach(({ url, expected, description }) => {
            it(`should ${description}`, () => {
                const result = blobService.extractBlobPathWithoutExtension(url);
                expect(result).toBe(expected);
            });
        });

        const errorTestCases = [
            { url: TEST_URLS.invalid, expectedError: 'Invalid blob URL format', description: 'invalid URL format' },
            { url: TEST_URLS.malformed, expectedError: 'Error extracting blob path:', description: 'malformed URLs' }
        ];

        errorTestCases.forEach(({ url, expectedError, description }) => {
            it(`should throw error for ${description}`, () => {
                expect(() => blobService.extractBlobPathWithoutExtension(url))
                    .toThrow(expectedError);
            });
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle empty container name', () => {
            expect(() => blobService.getContainerClient('')).not.toThrow();
        });

        it('should handle special characters in blob names', async () => {
            setupMockDownload();

            await blobService.downloadBlobToBuffer(TEST_URLS.encoded);

            expectBlobClientCall('folder/file%20with%20spaces.txt');
        });
    });
});