// Mock all dependencies
const mockSDK = {
    SpeechConfig: { fromAuthorizationToken: jest.fn() },
    AudioConfig: { fromAudioFileOutput: jest.fn() },
    SpeechSynthesizer: jest.fn(),
    SpeechSynthesisOutputFormat: { Audio16Khz32KBitRateMonoMp3: "Audio16Khz32KBitRateMonoMp3" },
    ResultReason: { SynthesizingAudioCompleted: "SynthesizingAudioCompleted" }
};

jest.mock("microsoft-cognitiveservices-speech-sdk", () => mockSDK);
jest.mock("@azure/identity", () => ({ DefaultAzureCredential: jest.fn() }));
jest.mock("fs", () => ({ createReadStream: jest.fn(), existsSync: jest.fn().mockReturnValue(false) }));
jest.mock("dotenv", () => ({ config: jest.fn() }));

const ttsService = require('../../src/services/ttsService');
const sdk = require("microsoft-cognitiveservices-speech-sdk");
const { DefaultAzureCredential } = require("@azure/identity");
const fs = require("fs");
const { PassThrough } = require("stream");

describe('TTS Service', () => {
    let mocks;

    // Test constants
    const CONFIG = {
        azure: { resource: "https://cognitiveservices.azure.com/.default", region: "test-region", resourceId: "test-resource-id" },
        test: { text: "Hello, test message", language: "en", rate: "medium", filename: "test.mp3" },
        languages: {
            en: { languageCode: 'en-IN', voice: 'en-IN-NeerjaNeural' },
            kn: { languageCode: 'kn-IN', voice: 'kn-IN-SapnaNeural' },
            hi: { languageCode: 'hi-IN', voice: 'hi-IN-SwaraNeural' },
            mr: { languageCode: 'mr-IN', voice: 'mr-IN-AarohiNeural' },
            ta: { languageCode: 'ta-IN', voice: 'ta-IN-PallaviNeural' },
            bn: { languageCode: 'bn-IN', voice: 'bn-IN-TanishaaNeural' }
        }
    };

    // Test utilities
    const setupMocks = () => {
        const accessToken = { token: "mock-token" };
        const credential = { getToken: jest.fn().mockResolvedValue(accessToken) };
        const speechConfig = { speechSynthesisOutputFormat: null };
        const audioConfig = {};
        const synthesizer = { speakSsmlAsync: jest.fn(), close: jest.fn() };

        DefaultAzureCredential.mockImplementation(() => credential);
        sdk.SpeechConfig.fromAuthorizationToken.mockReturnValue(speechConfig);
        sdk.AudioConfig.fromAudioFileOutput.mockReturnValue(audioConfig);
        sdk.SpeechSynthesizer.mockImplementation(() => synthesizer);
        fs.createReadStream.mockReturnValue(new PassThrough());

        return { accessToken, credential, speechConfig, audioConfig, synthesizer };
    };

    const mockResult = (success = true) => ({
        reason: success ? sdk.ResultReason.SynthesizingAudioCompleted : "Failed",
        audioData: success ? new ArrayBuffer(1024) : null,
        errorDetails: success ? null : "Mock TTS error"
    });

    const setupEnv = () => {
        process.env.TTS_REGION = CONFIG.azure.region;
        process.env.TTS_RESOURCE_ID = CONFIG.azure.resourceId;
    };

    const expectSSMLContent = (ssml, language = CONFIG.test.language) => {
        const { languageCode, voice } = CONFIG.languages[language] || {};
        expect(ssml).toContain(languageCode || "undefined");
        expect(ssml).toContain(voice || "undefined");
        expect(ssml).toContain(CONFIG.test.text);
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mocks = setupMocks();
        setupEnv();
    });

    afterEach(() => {
        delete process.env.TTS_REGION;
        delete process.env.TTS_RESOURCE_ID;
    });

    describe('textToSpeech', () => {
        const testSynthesis = async (filename = null, expectFileStream = false) => {
            mocks.synthesizer.speakSsmlAsync.mockImplementation((ssml, cb) => cb(mockResult(true)));

            const result = await ttsService.textToSpeech(CONFIG.test.text, CONFIG.test.language, CONFIG.test.rate, filename);

            // Verify core functionality
            expect(mocks.credential.getToken).toHaveBeenCalledWith(CONFIG.azure.resource);
            expect(sdk.SpeechConfig.fromAuthorizationToken).toHaveBeenCalledWith(
                `aad#${CONFIG.azure.resourceId}#${mocks.accessToken.token}`, CONFIG.azure.region
            );
            expect(mocks.synthesizer.speakSsmlAsync).toHaveBeenCalled();
            expect(result).toBeInstanceOf(PassThrough);
            expect(mocks.synthesizer.close).toHaveBeenCalled();

            // Verify SSML content
            const [ssml] = mocks.synthesizer.speakSsmlAsync.mock.calls[0];
            expectSSMLContent(ssml);

            // Verify file handling
            if (filename) {
                expect(sdk.AudioConfig.fromAudioFileOutput).toHaveBeenCalledWith(filename);
                if (expectFileStream) expect(fs.createReadStream).toHaveBeenCalledWith(filename);
            }

            return result;
        };

        it('should synthesize speech without filename (buffer stream)', () => testSynthesis());
        it('should synthesize speech with filename (file stream)', () => testSynthesis(CONFIG.test.filename, true));

        const languageTests = Object.entries(CONFIG.languages).map(([lang, { languageCode, voice }]) => [lang, languageCode, voice]);

        test.each(languageTests)('should handle %s language correctly', async (language, expectedLangCode, expectedVoice) => {
            mocks.synthesizer.speakSsmlAsync.mockImplementation((ssml, cb) => cb(mockResult(true)));

            await ttsService.textToSpeech(CONFIG.test.text, language, CONFIG.test.rate);

            const [ssml] = mocks.synthesizer.speakSsmlAsync.mock.calls[0];
            expect(ssml).toContain(`xml:lang="${expectedLangCode}"`);
            expect(ssml).toContain(`name="${expectedVoice}"`);
        });

        it('should handle unsupported language gracefully', async () => {
            mocks.synthesizer.speakSsmlAsync.mockImplementation((ssml, cb) => cb(mockResult(true)));

            const result = await ttsService.textToSpeech(CONFIG.test.text, "unsupported-language", CONFIG.test.rate);

            expect(result).toBeInstanceOf(PassThrough);
            const [ssml] = mocks.synthesizer.speakSsmlAsync.mock.calls[0];
            expectSSMLContent(ssml, "unsupported-language");
        });

        const errorTests = [
            ['credential errors', () => mocks.credential.getToken.mockRejectedValue(new Error('Failed to get access token')), 'Failed to get access token'],
            ['synthesis errors from result', () => mocks.synthesizer.speakSsmlAsync.mockImplementation((ssml, cb) => cb(mockResult(false))), 'Mock TTS error'],
            ['synthesis callback errors', () => mocks.synthesizer.speakSsmlAsync.mockImplementation((ssml, cb, errCb) => errCb(new Error('Synthesis callback error'))), 'Synthesis callback error']
        ];

        test.each(errorTests)('should handle %s', async (_, setupError, expectedError) => {
            setupError();
            await expect(ttsService.textToSpeech(CONFIG.test.text, CONFIG.test.language, CONFIG.test.rate))
                .rejects.toThrow(expectedError);
            if (expectedError !== 'Failed to get access token') {
                expect(mocks.synthesizer.close).toHaveBeenCalled();
            }
        });

        it('should handle missing environment variables', async () => {
            const [originalRegion, originalResourceId] = [process.env.TTS_REGION, process.env.TTS_RESOURCE_ID];
            delete process.env.TTS_REGION;
            delete process.env.TTS_RESOURCE_ID;

            try {
                mocks.synthesizer.speakSsmlAsync.mockImplementation((ssml, cb) => cb(mockResult(false)));
                await expect(ttsService.textToSpeech(CONFIG.test.text, CONFIG.test.language, CONFIG.test.rate))
                .rejects.toThrow(/TTS requires either TTS_SUBSCRIPTION_KEY \+ TTS_REGION, or TTS_RESOURCE_ID \+ TTS_REGION/);
            } finally {
                if (originalRegion) process.env.TTS_REGION = originalRegion;
                if (originalResourceId) process.env.TTS_RESOURCE_ID = originalResourceId;
            }
        });

        const ssmlTests = [
            ['SSML structure', CONFIG.test.text, ['<speak version="1.0"', 'xmlns="http://www.w3.org/2001/10/synthesis"', '<voice name=', `<prosody rate="${CONFIG.test.rate}"`, 'volume="+100.00%"']],
            ['special characters', "Hello & goodbye <test> \"quote\" 'apostrophe'", ["Hello & goodbye <test> \"quote\" 'apostrophe'"]]
        ];

        test.each(ssmlTests)('should handle %s in SSML', async (_, text, expectedContent) => {
            mocks.synthesizer.speakSsmlAsync.mockImplementation((ssml, cb) => cb(mockResult(true)));

            await ttsService.textToSpeech(text, CONFIG.test.language, CONFIG.test.rate);

            const [ssml] = mocks.synthesizer.speakSsmlAsync.mock.calls[0];
            expectedContent.forEach(content => expect(ssml).toContain(content));
        });

        it('should set correct audio output format', async () => {
            await testSynthesis();
            expect(mocks.speechConfig.speechSynthesisOutputFormat)
                .toBe(sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3);
        });
    });
});