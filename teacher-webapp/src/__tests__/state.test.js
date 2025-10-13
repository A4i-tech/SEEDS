 import { Participant, AudioContentState, teachers, students } from '../state';

describe('State Classes', () => {
    const defaultParticipant = {
        name: 'Unknown',
        phone_number: '0000000000',
        role: 'Student',
        raised_at: -1,
        is_raised: false,
        is_muted: true,
        call_status: 'disconnected'
    };

    const defaultAudio = {
        current_url: '',
        status: 'Paused',
        paused_at: ''
    };

    const expectParticipantProps = (participant, expected) => {
        Object.keys(expected).forEach(key => {
            expect(participant[key]).toBe(expected[key]);
        });
    };

    describe('Participant class', () => {
        test('creates participant with default, custom, and partial values', () => {
            // Default values
            expectParticipantProps(new Participant(), defaultParticipant);
            expectParticipantProps(new Participant({}), defaultParticipant);

            // Custom values
            const customData = {
                name: 'John Doe', phone_number: '1234567890', role: 'Teacher',
                raised_at: 1234567890, is_raised: true, is_muted: false, call_status: 'connected'
            };
            expectParticipantProps(new Participant(customData), customData);

            // Partial values
            const partial = new Participant({ name: 'Jane Smith', phone_number: '0987654321' });
            expect(partial.name).toBe('Jane Smith');
            expect(partial.phone_number).toBe('0987654321');
            expect(partial.role).toBe('Student');
            expect(partial.is_muted).toBe(true);
        });
    });

    describe('AudioContentState class', () => {
        test('creates audio state with default, custom, and partial values', () => {
            // Default values
            expectParticipantProps(new AudioContentState(), defaultAudio);
            expectParticipantProps(new AudioContentState({}), defaultAudio);

            // Custom values
            const customData = {
                current_url: 'http://example.com/audio.mp3',
                status: 'Playing',
                paused_at: '00:02:30'
            };
            expectParticipantProps(new AudioContentState(customData), customData);

            // Partial values
            const partial = new AudioContentState({ current_url: 'http://example.com/audio.mp3' });
            expect(partial.current_url).toBe('http://example.com/audio.mp3');
            expect(partial.status).toBe('Paused');
            expect(partial.paused_at).toBe('');
        });
    });
});

describe('Sample Data Validation', () => {
    const validateParticipants = (participants, expectedRole) => {
        expect(Array.isArray(participants)).toBe(true);
        expect(participants.length).toBeGreaterThan(0);

        participants.forEach(participant => {
            expect(participant).toBeInstanceOf(Participant);
            expect(participant.role).toBe(expectedRole);
            expect(participant.name).toBeTruthy();
            expect(participant.phone_number).toBeTruthy();
            expect(participant.phone_number).toMatch(/^\d+$/);
        });
    };

    test('validates specific sample data format', () => {
        const kavyansh = teachers.find(t => t.name === 'John Doe');
        expect(kavyansh).toBeDefined();
        expect(kavyansh.phone_number).toBe('911234567890');

        const motorola = students.find(s => s.name === 'Smart Phone Motorola');
        expect(motorola).toBeDefined();
        expect(motorola.phone_number).toBe('911234567890');
    });
});