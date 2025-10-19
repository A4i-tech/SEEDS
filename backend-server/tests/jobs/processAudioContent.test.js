jest.mock('../../src/services/BlobService');
jest.mock('../../src/models/ContentV3');
jest.mock('../../src/services/ttsService');
jest.mock('../../src/jobs/jobsUtils');
jest.mock('fs');

const processNewContent = require('../../src/jobs/processAudioContent');

describe('processAudioContent', () => {
    let mockJob;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Input Validation', () => {
        test('should handle missing content data', async () => {
            mockJob = {
                attrs: { data: { content: null } },
                save: jest.fn().mockResolvedValue(),
                fail: jest.fn()
            };

            await processNewContent(mockJob);

            expect(mockJob.fail).toHaveBeenCalledWith('Invalid content data received.');
            expect(mockJob.attrs.failedAt).toBeInstanceOf(Date);
            expect(mockJob.attrs.errorMessage).toBe('Invalid content data received.');
        });

        test('should handle missing content ID', async () => {
            mockJob = {
                attrs: { data: { content: { title: 'Test' } } }, // No _id field
                save: jest.fn().mockResolvedValue(),
                fail: jest.fn()
            };

            await processNewContent(mockJob);

            expect(mockJob.fail).toHaveBeenCalledWith('Invalid content data received.');
        });

        test('should handle invalid content structure', async () => {
            mockJob = {
                attrs: {
                    data: {
                        content: {
                            _id: 'test-id'
                            // Missing audioContent array
                        }
                    }
                },
                save: jest.fn().mockResolvedValue(),
                fail: jest.fn()
            };

            await processNewContent(mockJob);

            expect(mockJob.fail).toHaveBeenCalled();
            expect(mockJob.attrs.failedAt).toBeInstanceOf(Date);
        });
    });
});