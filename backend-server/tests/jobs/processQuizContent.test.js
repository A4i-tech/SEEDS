jest.mock("../../src/services/BlobService");
jest.mock("../../src/models/QuizData");
jest.mock("../../src/services/ttsService");
jest.mock("../../src/jobs/jobsUtils");

const processQuizData = require("../../src/jobs/processQuizContent");

describe("processQuizContent", () => {
    let mockJob, mockQuizData, mocks;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, "log").mockImplementation(() => { });
        jest.spyOn(console, "error").mockImplementation(() => { });

        mocks = setupMocks();
        mockJob = createMockJob();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // Factory Functions
    const setupMocks = () => {
        const { QuizData } = require("../../src/models/QuizData");
        const BlobService = require("../../src/services/BlobService");
        const { textToSpeech } = require("../../src/services/ttsService");
        const { addForInOptionAudio } = require("../../src/jobs/jobsUtils");

        mockQuizData = {
            id: "quiz-123",
            _id: "quiz-123",
            language: "en",
            isPullModel: false,
            questions: [],
            title: { local: "Test Quiz" },
            theme: { english: "education", local: "Education" },
            toObject: jest.fn().mockReturnValue({ id: "quiz-123", _id: "quiz-123" })
        };

        const mockBlobClient = {
            uploadStream: jest.fn().mockResolvedValue(),
            exists: jest.fn().mockResolvedValue(false),
            url: "https://example.com/audio.mp3"
        };

        // Mock QuizData constructor and static findOneAndUpdate method
        QuizData.mockImplementation(() => mockQuizData);
        QuizData.findOneAndUpdate = jest.fn().mockImplementation((query, update, options) => {
            // Return a promise that resolves with the updated document
            return Promise.resolve(mockQuizData);
        });
        
        BlobService.mockImplementation(() => ({
            getContainerClient: jest.fn().mockReturnValue({
                getBlockBlobClient: jest.fn().mockReturnValue(mockBlobClient)
            })
        }));
        textToSpeech.mockResolvedValue("audio-stream");
        addForInOptionAudio.mockImplementation((lang, text) => `${lang}: ${text}`);

        return { QuizData, textToSpeech, addForInOptionAudio };
    };

    const createMockJob = (overrides = {}) => ({
        attrs: {
            data: { content: { _id: "quiz-123", questions: [] } }
        },
        save: jest.fn().mockResolvedValue(),
        fail: jest.fn(),
        ...overrides
    });

    const createInvalidContentJob = (content) => createMockJob({
        attrs: { data: { content } }
    });

    const createQuestionData = (questionText, options = []) => ({
        question: { text: questionText },
        options: options.map(text => ({ text }))
    });

    // Assertion Helpers
    const expectJobFailure = (job, errorMessage) => {
        expect(job.fail).toHaveBeenCalledWith(errorMessage);
        expect(job.attrs.failedAt).toBeInstanceOf(Date);
        expect(job.attrs.errorMessage).toBe(errorMessage);
    };

    const expectJobSuccess = (job) => {
        expect(job.attrs.completedAt).toBeInstanceOf(Date);
        expect(mocks.QuizData.findOneAndUpdate).toHaveBeenCalled();
    };

    const expectJobStarted = (job) => {
        expect(job.attrs.data.startedAt).toBeInstanceOf(Date);
        expect(job.save).toHaveBeenCalled();
    };

    describe("Input Validation", () => {
        const invalidContentCases = [
            ["null content", null],
            ["undefined content", undefined],
            ["content without _id", { title: "No ID Quiz" }]
        ];

        test.each(invalidContentCases)("should reject %s", async (_, content) => {
            mockJob = createInvalidContentJob(content);
            await processQuizData(mockJob);
            expectJobFailure(mockJob, "Invalid content data received.");
        });
    });

    describe("Job Lifecycle", () => {
        test("should set startedAt timestamp", async () => {
            await processQuizData(mockJob);
            expectJobStarted(mockJob);
        });

        test("should complete job successfully with empty questions", async () => {
            mockQuizData.questions = [];
            await processQuizData(mockJob);

            expectJobSuccess(mockJob);
            expect(mockJob.attrs.data.processedContent).toMatchObject({ id: "quiz-123" });
        });

        const errorCases = [
            ["Database connection failed", () => new Error("Database connection failed")],
            ["Unknown error occurred", () => { const err = new Error(); err.message = undefined; return err; }]
        ];

        test.each(errorCases)("should handle %s", async (expectedMessage, errorFactory) => {
            mocks.QuizData.mockImplementation(() => { throw errorFactory(); });
            await processQuizData(mockJob);
            expectJobFailure(mockJob, expectedMessage);
        });
    });

    describe("Question Processing", () => {
        test("should handle basic question structure", async () => {
            mockQuizData.questions = [createQuestionData("What is Node.js?", ["Runtime", "Database"])];
            await processQuizData(mockJob);

            expect(mocks.textToSpeech).toHaveBeenCalled();
            expectJobSuccess(mockJob);
        });

        test("should survive question processing errors", async () => {
            mocks.textToSpeech.mockRejectedValueOnce(new Error("TTS service unavailable"));
            mockQuizData.questions = [createQuestionData("Failing question")];

            await processQuizData(mockJob);
            expectJobSuccess(mockJob);
        });
    });

    describe("Pull Model Logic", () => {
        test("should process when isPullModel is true", async () => {
            mockQuizData.isPullModel = true;
            mockQuizData.questions = [];

            await processQuizData(mockJob);

            expect(mocks.textToSpeech).toHaveBeenCalled();
            expectJobSuccess(mockJob);
        });

        test("should skip when isPullModel is false", async () => {
            mockQuizData.isPullModel = false;
            mockQuizData.questions = [];

            await processQuizData(mockJob);

            expect(mocks.textToSpeech).not.toHaveBeenCalled();
            expectJobSuccess(mockJob);
        });

        test("should handle pull model processing errors gracefully", async () => {
            mocks.textToSpeech.mockRejectedValue(new Error("Title TTS failed"));
            mockQuizData.isPullModel = true;
            mockQuizData.questions = [];

            await processQuizData(mockJob);
            expectJobSuccess(mockJob);
        });
    });

    describe("Error Resilience", () => {
        test("should handle TTS service completely down", async () => {
            mocks.textToSpeech.mockRejectedValue(new Error("Service unavailable"));
            mockQuizData.isPullModel = true;
            mockQuizData.questions = [createQuestionData("Test question", ["Test option"])];

            await processQuizData(mockJob);
            expectJobSuccess(mockJob);
        });

        test("should handle save operations failing", async () => {
            mockJob.save.mockRejectedValueOnce(new Error("Database write failed"));
            await processQuizData(mockJob);
            expect(mockJob.save).toHaveBeenCalled();
        });
    });

    describe("Business Logic", () => {
        test("should create QuizData from job content", async () => {
            const testContent = { _id: "quiz-456", title: "Test Quiz" };
            mockJob = createMockJob({ attrs: { data: { content: testContent } } });

            await processQuizData(mockJob);
            expect(mocks.QuizData).toHaveBeenCalledWith(testContent);
        });

        test("should store processed content in job data", async () => {
            const expectedContent = { id: "quiz-123", processed: true };
            mockQuizData.toObject.mockReturnValue(expectedContent);

            await processQuizData(mockJob);
            expect(mockJob.attrs.data.processedContent).toEqual(expectedContent);
        });

        test("should handle different language codes", async () => {
            mockQuizData.language = "es";
            mockQuizData.questions = [];
            mockQuizData.isPullModel = false;

            await processQuizData(mockJob);
            expectJobSuccess(mockJob);
        });
    });
});