const { MessageType, PlaybackStatus } = require('../src/constants');

describe('Constants', () => {
    describe('MessageType and PlaybackStatus', () => {
        it('should have all required values with correct types and uniqueness', () => {
            // MessageType values
            expect(MessageType.HEARTBEAT).toBe('ping');
            expect(MessageType.PLAY_AUDIO).toBe('play');
            expect(MessageType.PLAY_SYSTEM_MESSAGE).toBe('play-system-message');
            expect(MessageType.PAUSE_AUDIO).toBe('pause');
            expect(MessageType.RESUME_AUDIO).toBe('resume');
            expect(MessageType.STOP_AUDIO).toBe('stop');
            expect(MessageType.DISCONNECT).toBe('disconnect');
            expect(MessageType.RECONNECT).toBe('reconnect');
            expect(MessageType.PLAYBACK_STATE_UPDATES).toBe('playback-state-update');

            // PlaybackStatus values
            expect(PlaybackStatus.PLAYING).toBe('Playing');
            expect(PlaybackStatus.PAUSED).toBe('Paused');
            expect(PlaybackStatus.STOPPED).toBe('Stopped');

            // Uniqueness and types
            const messageValues = Object.values(MessageType);
            const playbackValues = Object.values(PlaybackStatus);
            expect(new Set(messageValues).size).toBe(messageValues.length);
            expect(new Set(playbackValues).size).toBe(playbackValues.length);
            [...messageValues, ...playbackValues].forEach(value => expect(typeof value).toBe('string'));
        });

        it('should export only expected properties and maintain consistency', () => {
            const constants = require('../src/constants');
            expect(Object.keys(constants).sort()).toEqual(['MessageType', 'PlaybackStatus']);

            // Test consistency across imports
            const { MessageType: MT2, PlaybackStatus: PS2 } = require('../src/constants');
            expect(MessageType).toBe(MT2);
            expect(PlaybackStatus).toBe(PS2);
        });

        it('should work in common usage scenarios', () => {
            // Switch statement
            const testMessageType = MessageType.PLAY_AUDIO;
            let result;
            switch (testMessageType) {
                case MessageType.PLAY_AUDIO: result = 'play audio'; break;
                case MessageType.PAUSE_AUDIO: result = 'pause audio'; break;
                default: result = 'unknown';
            }
            expect(result).toBe('play audio');

            // Array includes
            const validAudioCommands = [MessageType.PLAY_AUDIO, MessageType.PAUSE_AUDIO, MessageType.RESUME_AUDIO, MessageType.STOP_AUDIO];
            expect(validAudioCommands.includes(MessageType.PLAY_AUDIO)).toBe(true);
            expect(validAudioCommands.includes(MessageType.HEARTBEAT)).toBe(false);

            // Object comparison
            expect(PlaybackStatus.PLAYING === PlaybackStatus.PLAYING).toBe(true);
            expect(PlaybackStatus.PLAYING === PlaybackStatus.PAUSED).toBe(false);
        });
    });
});