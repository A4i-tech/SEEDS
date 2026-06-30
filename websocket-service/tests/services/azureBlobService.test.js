const azureBlobService = require('../../src/services/azureBlobService');

jest.mock('../../src/config/azureConfig', () => ({
    blobServiceClient: { getContainerClient: jest.fn() }
}));

const { blobServiceClient } = require('../../src/config/azureConfig');

describe('AzureBlobService', () => {
    let mockContainerClient, mockBlobClient, mockDownloadResponse;

    beforeEach(() => {
        jest.clearAllMocks();
        mockDownloadResponse = {
            readableStreamBody: {
                async *[Symbol.asyncIterator]() {
                    yield Buffer.from('chunk1');
                    yield Buffer.from('chunk2');
                    yield Buffer.from('chunk3');
                }
            }
        };
        mockBlobClient = { download: jest.fn().mockResolvedValue(mockDownloadResponse) };
        mockContainerClient = { getBlobClient: jest.fn().mockReturnValue(mockBlobClient) };
        blobServiceClient.getContainerClient.mockReturnValue(mockContainerClient);
    });

    describe('getBlobData', () => {
        it('should retrieve blob data successfully', async () => {
            const result = await azureBlobService.getBlobData('test-container', 'test-blob.txt');
            expect(blobServiceClient.getContainerClient).toHaveBeenCalledWith('test-container');
            expect(mockContainerClient.getBlobClient).toHaveBeenCalledWith('test-blob.txt');
            expect(mockBlobClient.download).toHaveBeenCalled();
            expect(result).toBeInstanceOf(Buffer);
            expect(result.toString()).toBe('chunk1chunk2chunk3');
        });

        it('should handle edge cases', async () => {
            // Empty blob
            mockDownloadResponse.readableStreamBody = { async *[Symbol.asyncIterator]() { } };
            let result = await azureBlobService.getBlobData('container', 'empty.txt');
            expect(result.length).toBe(0);

            // Single chunk
            mockDownloadResponse.readableStreamBody = { async *[Symbol.asyncIterator]() { yield Buffer.from('single'); } };
            result = await azureBlobService.getBlobData('container', 'single.txt');
            expect(result.toString()).toBe('single');

            // Binary data
            const binaryData = Buffer.from([0x00, 0xFF]);
            mockDownloadResponse.readableStreamBody = { async *[Symbol.asyncIterator]() { yield binaryData; } };
            result = await azureBlobService.getBlobData('container', 'binary.bin');
            expect(result).toEqual(binaryData);
        });
        it('should handle errors', async () => {
            // Download error
            mockBlobClient.download.mockRejectedValue(new Error('Blob not found'));
            await expect(azureBlobService.getBlobData('container', 'error.txt')).rejects.toThrow('Blob not found');

            // Stream error
            mockBlobClient.download.mockResolvedValue(mockDownloadResponse);
            mockDownloadResponse.readableStreamBody = {
                async *[Symbol.asyncIterator]() {
                    yield Buffer.from('chunk1');
                    throw new Error('Stream error');
                }
            };
            await expect(azureBlobService.getBlobData('container', 'stream.txt')).rejects.toThrow('Stream error');

            // Azure SDK error
            blobServiceClient.getContainerClient.mockImplementation(() => { throw new Error('Azure SDK error'); });
            await expect(azureBlobService.getBlobData('container', 'test.txt')).rejects.toThrow('Azure SDK error');
        });
    });
});