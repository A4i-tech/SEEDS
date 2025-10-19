import * as apiService from '../../src/services/apiService';
// Mock fetch globally
global.fetch = jest.fn();

// Mock environment variables
process.env.REACT_APP_CONF_SERVER_BASE_URI = 'http://localhost:3001';
process.env.REACT_APP_STORAGE_ACCOUNT_NAME = 'testaccount';

describe('apiService', () => {
    const mockSuccessResponse = () => ({ json: jest.fn().mockResolvedValueOnce({ id: 'conf-123' }) });
    const mockEmptyResponse = () => ({});
    const confId = 'conf-123';
    const phoneNumber = '1234567890';
    const baseUrl = process.env.REACT_APP_CONF_SERVER_BASE_URI;

    const expectFetchCall = (url, method = 'POST', body = null) => {
        const config = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) config.body = JSON.stringify(body);
        expect(fetch).toHaveBeenCalledWith(url, config);
    };

    beforeEach(() => {
        fetch.mockClear();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Conference Management', () => {
        test('creates conference with correct payload', async () => {
            fetch.mockResolvedValueOnce(mockSuccessResponse());
            const studentPhones = ['0987654321', '1122334455'];

            const result = await apiService.createConference(phoneNumber, studentPhones);

            expectFetchCall(`${baseUrl}/conference/create`, 'POST', {
                teacher_phone: phoneNumber,
                student_phones: studentPhones
            });
            expect(result).toEqual({ id: 'conf-123' });
        });

        test('starts conference call', async () => {
            fetch.mockResolvedValueOnce(mockEmptyResponse());
            await apiService.startConferenceCall(confId);
            expectFetchCall(`${baseUrl}/conference/start/${confId}`);
        });

        test('ends conference call', async () => {
            fetch.mockResolvedValueOnce(mockEmptyResponse());
            await apiService.endConferenceCall(confId);
            expectFetchCall(`${baseUrl}/conference/end/${confId}`, 'PUT');
        });

        test('sinks conference call', async () => {
            fetch.mockResolvedValueOnce(mockEmptyResponse());
            await apiService.sinkConferenceCall(confId);
            expectFetchCall(`${baseUrl}/conference/sink/${confId}`, 'PUT');
        });
    });

    describe('Participant Management', () => {
        test('mutes and unmutes participants', async () => {
            fetch.mockResolvedValueOnce(mockEmptyResponse());
            await apiService.muteParticipant(confId, phoneNumber);
            expectFetchCall(`${baseUrl}/conference/muteparticipant/${confId}?phone_number=${phoneNumber}`, 'PUT');

            fetch.mockResolvedValueOnce(mockEmptyResponse());
            await apiService.unmuteParticipant(confId, phoneNumber);
            expectFetchCall(`${baseUrl}/conference/unmuteparticipant/${confId}?phone_number=${phoneNumber}`, 'PUT');
        });

        test('adds participant to conference', async () => {
            fetch.mockResolvedValueOnce(mockEmptyResponse());
            await apiService.addParticipant(confId, phoneNumber);
            expectFetchCall(`${baseUrl}/conference/addparticipant/${confId}?phone_number=${phoneNumber}`, 'PUT');
        });
    });

    describe('Audio Control', () => {
        test('plays, pauses, and resumes audio', async () => {
            const expectedUrl = 'https://testaccount.blob.core.windows.net/output-container/25/1.0.wav';

            fetch.mockResolvedValueOnce(mockEmptyResponse());
            await apiService.playAudio(confId);
            expectFetchCall(`${baseUrl}/conference/playaudio/${confId}?url=${expectedUrl}`, 'PUT');

            fetch.mockResolvedValueOnce(mockEmptyResponse());
            await apiService.pauseAudio(confId);
            expectFetchCall(`${baseUrl}/conference/pauseaudio/${confId}`, 'PUT');

            fetch.mockResolvedValueOnce(mockEmptyResponse());
            await apiService.resumeAudio(confId);
            expectFetchCall(`${baseUrl}/conference/resumeaudio/${confId}`, 'PUT');
        });
    });

    describe('Error Handling', () => {
        test('handles network and JSON parsing errors', async () => {
            fetch.mockRejectedValueOnce(new Error('Network error'));
            await expect(apiService.createConference('123', ['456'])).rejects.toThrow('Network error');

            fetch.mockResolvedValueOnce({
                json: jest.fn().mockRejectedValueOnce(new Error('Invalid JSON'))
            });
            await expect(apiService.createConference('123', ['456'])).rejects.toThrow('Invalid JSON');
        });
    });
});