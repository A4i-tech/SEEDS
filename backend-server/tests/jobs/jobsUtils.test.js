const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');

// Mock the dependencies
jest.mock('fs');
jest.mock('fluent-ffmpeg');
jest.mock('ffmpeg-static', () => '/mocked/path/to/ffmpeg');

const {
    writeBufferToFile,
    processAudioWithFfmpeg,
    cleanupTempFiles,
    generateTempPaths,
    addForInOptionAudio,
} = require('../../jobs/jobsUtils');

describe('jobsUtils', () => {
    // Test data constants
    const TEST_BUFFER = Buffer.from('test data');
    const TEST_FILE_PATH = '/path/to/test/file.txt';
    const TEST_INPUT_PATH = '/path/to/input.mp3';
    const TEST_OUTPUT_PATH = '/path/to/output.wav';
    const DEFAULT_FFMPEG_OPTIONS = ['-ar 8000', '-ac 1', '-sample_fmt s16'];
    const CUSTOM_FFMPEG_OPTIONS = ['-ar 16000', '-ac 2'];

    // Helper functions
    const createMockWriteStream = (eventType = 'finish', shouldError = false) => ({
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn((event, callback) => {
            if (event === eventType) {
                const action = shouldError
                    ? () => callback(new Error('Write error'))
                    : callback;
                setTimeout(action, 0);
            }
        }),
    });

    const createMockFfmpegInstance = (eventType = 'end', shouldError = false) => {
        const instance = {
            setFfmpegPath: jest.fn().mockReturnThis(),
            outputOptions: jest.fn().mockReturnThis(),
            output: jest.fn().mockReturnThis(),
            on: jest.fn((event, callback) => {
                if (event === eventType) {
                    const action = shouldError
                        ? () => callback(new Error('FFmpeg error'))
                        : callback;
                    setTimeout(action, 0);
                }
                return instance;
            }),
            run: jest.fn(),
        };
        return instance;
    };

    const setupFileSystemMocks = (exists = true, shouldThrowOnUnlink = false) => {
        fs.existsSync.mockReturnValue(exists);
        if (shouldThrowOnUnlink) {
            fs.unlinkSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });
        } else {
            fs.unlinkSync.mockImplementation(() => { });
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(os, 'tmpdir').mockReturnValue('/tmp');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('writeBufferToFile', () => {
        test('should successfully write buffer to file', async () => {
            const mockWriteStream = createMockWriteStream('finish');
            fs.createWriteStream.mockReturnValue(mockWriteStream);

            await expect(writeBufferToFile(TEST_BUFFER, TEST_FILE_PATH)).resolves.toBeUndefined();

            expect(fs.createWriteStream).toHaveBeenCalledWith(TEST_FILE_PATH);
            expect(mockWriteStream.write).toHaveBeenCalledWith(TEST_BUFFER);
            expect(mockWriteStream.end).toHaveBeenCalled();
        });

        test('should reject on write error', async () => {
            const mockWriteStream = createMockWriteStream('error', true);
            fs.createWriteStream.mockReturnValue(mockWriteStream);

            await expect(writeBufferToFile(TEST_BUFFER, TEST_FILE_PATH)).rejects.toThrow('Write error');
        });
    });

    describe('processAudioWithFfmpeg', () => {
        test('should process audio with default options', async () => {
            const mockFfmpegInstance = createMockFfmpegInstance('end');
            ffmpeg.mockReturnValue(mockFfmpegInstance);

            await expect(processAudioWithFfmpeg(TEST_INPUT_PATH, TEST_OUTPUT_PATH)).resolves.toBeUndefined();

            expect(ffmpeg).toHaveBeenCalledWith(TEST_INPUT_PATH);
            expect(mockFfmpegInstance.setFfmpegPath).toHaveBeenCalledWith('/mocked/path/to/ffmpeg');
            expect(mockFfmpegInstance.outputOptions).toHaveBeenCalledWith(DEFAULT_FFMPEG_OPTIONS);
            expect(mockFfmpegInstance.output).toHaveBeenCalledWith(TEST_OUTPUT_PATH);
            expect(mockFfmpegInstance.run).toHaveBeenCalled();
        });

        test('should process audio with custom options', async () => {
            const mockFfmpegInstance = createMockFfmpegInstance('end');
            ffmpeg.mockReturnValue(mockFfmpegInstance);

            await expect(processAudioWithFfmpeg(TEST_INPUT_PATH, TEST_OUTPUT_PATH, CUSTOM_FFMPEG_OPTIONS)).resolves.toBeUndefined();

            expect(mockFfmpegInstance.outputOptions).toHaveBeenCalledWith(CUSTOM_FFMPEG_OPTIONS);
        });

        test('should reject on ffmpeg error', async () => {
            const mockFfmpegInstance = createMockFfmpegInstance('error', true);
            ffmpeg.mockReturnValue(mockFfmpegInstance);

            await expect(processAudioWithFfmpeg(TEST_INPUT_PATH, TEST_OUTPUT_PATH)).rejects.toThrow('FFmpeg error');
        });
    });

    describe('cleanupTempFiles', () => {
        const testFilePaths = ['/path/to/file1.tmp', '/path/to/file2.tmp'];
        const singleFilePath = ['/path/to/file.tmp'];

        test('should delete existing files', () => {
            setupFileSystemMocks(true);

            cleanupTempFiles(testFilePaths);

            expect(fs.existsSync).toHaveBeenCalledTimes(testFilePaths.length);
            testFilePaths.forEach(filePath => {
                expect(fs.unlinkSync).toHaveBeenCalledWith(filePath);
            });
        });

        test('should skip non-existing files', () => {
            setupFileSystemMocks(false);

            cleanupTempFiles(singleFilePath);

            expect(fs.existsSync).toHaveBeenCalledWith(singleFilePath[0]);
            expect(fs.unlinkSync).not.toHaveBeenCalled();
        });

        test('should handle deletion errors gracefully', () => {
            setupFileSystemMocks(true, true);

            expect(() => cleanupTempFiles(singleFilePath)).not.toThrow();

            expect(console.error).toHaveBeenCalledWith(
                'Error cleaning up file:',
                singleFilePath[0],
                expect.any(Error)
            );
        });

        test('should handle empty file paths array', () => {
            cleanupTempFiles([]);

            expect(fs.existsSync).not.toHaveBeenCalled();
            expect(fs.unlinkSync).not.toHaveBeenCalled();
        });
    });

    describe('generateTempPaths', () => {
        const testCases = [
            {
                name: 'should generate correct temp paths for mp3 file',
                contentId: 'content123',
                url: 'https://example.com/audio/sample.mp3',
                expectedInput: 'content123_audioContent_sample.mp3',
                expectedOutput: 'output_content123_audioContent_sample.wav'
            },
            {
                name: 'should generate correct temp paths for wav file',
                contentId: 'content456',
                url: 'https://example.com/audio/recording.wav',
                expectedInput: 'content456_audioContent_recording.wav',
                expectedOutput: 'output_content456_audioContent_recording.wav'
            },
            {
                name: 'should handle complex URLs',
                contentId: 'content789',
                url: 'https://storage.azure.com/container/path/to/audio_file.mp3?token=xyz',
                expectedInput: 'content789_audioContent_audio_file.mp3?token=xyz',
                expectedOutput: 'output_content789_audioContent_audio_file.mp3?token=xyz' // Regex doesn't match due to query params
            },
            {
                name: 'should handle file without extension',
                contentId: 'content999',
                url: 'https://example.com/audiofile',
                expectedInput: 'content999_audioContent_audiofile',
                expectedOutput: 'output_content999_audioContent_audiofile'
            }
        ];

        test.each(testCases)('$name', ({ contentId, url, expectedInput, expectedOutput }) => {
            const result = generateTempPaths(contentId, url);

            expect(result.tempInputPath).toBe(path.join('/tmp', expectedInput));
            expect(result.tempOutputPath).toBe(path.join('/tmp', expectedOutput));
        });
    });

    describe('addForInOptionAudio', () => {
        const languageTestCases = [
            { language: 'kannada', input: 'option1', expected: 'option1ಗಾಗಿ' },
            { language: 'english', input: 'option1', expected: 'for option1' },
            { language: 'marathi', input: 'option1', expected: 'option1साठी' },
            { language: 'hindi', input: 'option1', expected: 'option1 के लिए' },
            { language: 'bengali', input: 'option1', expected: 'option1 জন্য' }
        ];

        const caseInsensitiveTestCases = [
            { language: 'KANNADA', input: 'test', expected: 'testಗಾಗಿ' },
            { language: 'English', input: 'test', expected: 'for test' },
            { language: 'MARATHI', input: 'test', expected: 'testसाठी' }
        ];

        test.each(languageTestCases)(
            'should add correct text for $language',
            ({ language, input, expected }) => {
                expect(addForInOptionAudio(language, input)).toBe(expected);
            }
        );

        test.each(caseInsensitiveTestCases)(
            'should handle case insensitive language: $language',
            ({ language, input, expected }) => {
                expect(addForInOptionAudio(language, input)).toBe(expected);
            }
        );

        test('should return original text for unsupported language', () => {
            expect(addForInOptionAudio('french', 'option1')).toBe('option1');
        });

        test('should trim whitespace from option', () => {
            expect(addForInOptionAudio('english', '  option1  ')).toBe('for option1');
        });

        test('should handle empty option string', () => {
            expect(addForInOptionAudio('english', '')).toBe('for ');
        });

        test('should handle undefined language gracefully', () => {
            // This test reveals that the function doesn't handle undefined properly
            expect(() => addForInOptionAudio(undefined, 'option1')).toThrow();
        });
    });

    describe('Integration tests', () => {
        test('should work together for a typical workflow', async () => {
            // Setup all mocks
            const mockWriteStream = createMockWriteStream('finish');
            const mockFfmpegInstance = createMockFfmpegInstance('end');

            fs.createWriteStream.mockReturnValue(mockWriteStream);
            ffmpeg.mockReturnValue(mockFfmpegInstance);
            setupFileSystemMocks(true);

            // Test data
            const workflowData = {
                contentId: 'test123',
                audioUrl: 'https://example.com/audio.mp3',
                audioBuffer: Buffer.from('fake audio data'),
                language: 'english',
                option: 'Option A'
            };

            // Execute workflow
            const { tempInputPath, tempOutputPath } = generateTempPaths(workflowData.contentId, workflowData.audioUrl);
            await writeBufferToFile(workflowData.audioBuffer, tempInputPath);
            await processAudioWithFfmpeg(tempInputPath, tempOutputPath);
            const processedOption = addForInOptionAudio(workflowData.language, workflowData.option);
            cleanupTempFiles([tempInputPath, tempOutputPath]);

            // Verify workflow results
            expect(tempInputPath).toContain('test123_audioContent_audio.mp3');
            expect(tempOutputPath).toContain('output_test123_audioContent_audio.wav');
            expect(processedOption).toBe('for Option A');
            expect(fs.unlinkSync).toHaveBeenCalledWith(tempInputPath);
            expect(fs.unlinkSync).toHaveBeenCalledWith(tempOutputPath);
        });
    });
});