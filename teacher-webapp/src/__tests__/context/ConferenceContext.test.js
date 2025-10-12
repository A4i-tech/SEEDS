import React from 'react';
import { renderHook, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConferenceProvider, useConference } from '../../context/ConferenceContext';
import { Participant, AudioContentState } from '../../state';

// Mock the state classes
jest.mock('../../state', () => ({
    AudioContentState: jest.fn().mockImplementation(function (state = {}) {
        this.current_url = state.current_url || "";
        this.status = state.status || "Paused";
        this.paused_at = state.paused_at || "";
    }),
    Participant: jest.fn().mockImplementation(function (participant = {}) {
        this.name = participant.name || "Unknown";
        this.phone_number = participant.phone_number || "0000000000";
        this.role = participant.role || "Student";
        this.raised_at = participant.raised_at || -1;
        this.is_raised = participant.is_raised || false;
        this.is_muted = participant.is_muted || true;
        this.call_status = participant.call_status || "disconnected";
    })
}));

describe('ConferenceContext', () => {
    const wrapper = ({ children }) => <ConferenceProvider>{children}</ConferenceProvider>;
    const renderConferenceHook = () => renderHook(() => useConference(), { wrapper });

    const teacher = { name: 'Test Teacher', phone_number: '1234567890' };
    const student = { name: 'Test Student', phone_number: '0987654321' };
    const student2 = { name: 'Test Student 2', phone_number: '1122334455' };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Initial State', () => {
        test('provides correct initial state values', () => {
            const { result } = renderConferenceHook();

            expect(result.current.selectedTeacher).toBeNull();
            expect(result.current.selectedStudents).toEqual([]);
            expect(result.current.userList).toEqual([]);
            expect(result.current.confId).toBe('');
            expect(result.current.loading).toBe(false);
            expect(result.current.isConfCallRunning).toBe(false);
            expect(result.current.audioContentState).toBeInstanceOf(AudioContentState);
        });
    });

    describe('Teacher Selection', () => {
        test('selects and deselects teacher correctly', () => {
            const { result } = renderConferenceHook();

            act(() => result.current.handleTeacherSelect(teacher));
            expect(result.current.selectedTeacher).toEqual(teacher);

            act(() => result.current.handleTeacherSelect(teacher));
            expect(result.current.selectedTeacher).toBeNull();
        });
    });

    describe('Student Selection', () => {
        test('toggles student selection correctly', () => {
            const { result } = renderConferenceHook();

            act(() => result.current.handleStudentToggle(student));
            expect(result.current.selectedStudents).toContain(student);

            act(() => result.current.handleStudentToggle(student));
            expect(result.current.selectedStudents).not.toContain(student);
        });

        test('updates userList when participants are selected', () => {
            const { result } = renderConferenceHook();

            act(() => {
                result.current.handleTeacherSelect(teacher);
                result.current.handleStudentToggle(student);
                result.current.handleStudentToggle(student2);
            });

            expect(result.current.userList).toHaveLength(3);
            expect(result.current.userList).toEqual(expect.arrayContaining([teacher, student, student2]));
        });
    });

    describe('State Management', () => {
        test('updates conference ID and loading state', () => {
            const { result } = renderConferenceHook();

            act(() => result.current.setConfId('test-conf-123'));
            expect(result.current.confId).toBe('test-conf-123');

            act(() => result.current.setLoading(true));
            expect(result.current.loading).toBe(true);

            act(() => result.current.setLoading(false));
            expect(result.current.loading).toBe(false);
        });
    });

    describe('SSE Event Handling', () => {
        test('updates conference state from SSE events', () => {
            const { result } = renderConferenceHook();

            act(() => {
                result.current.handleTeacherSelect(teacher);
                result.current.handleStudentToggle(student);
            });

            const sseEvent = {
                is_running: true,
                audio_content_state: { current_url: "test.wav", status: "Playing", paused_at: "" },
                participants: {
                    '1234567890': { ...teacher, is_raised: true, is_muted: false, call_status: 'connected', raised_at: 123456789 },
                    '0987654321': { ...student, is_raised: false, is_muted: true, call_status: 'connected', raised_at: -1 }
                }
            };

            act(() => result.current.handleSSEEvent(sseEvent));

            expect(result.current.isConfCallRunning).toBe(true);
            expect(result.current.selectedTeacher).toBeTruthy();
            expect(result.current.selectedStudents).toHaveLength(1);
            expect(result.current.audioContentState).toBeInstanceOf(AudioContentState);
        });

        test('adds new participants from SSE events', () => {
            const { result } = renderConferenceHook();

            const sseEvent = {
                is_running: true,
                audio_content_state: {},
                participants: {
                    '5555555555': {
                        name: 'New Participant', phone_number: '5555555555', is_raised: false,
                        is_muted: true, call_status: 'connected', role: 'Student', raised_at: -1
                    }
                }
            };

            act(() => result.current.handleSSEEvent(sseEvent));

            expect(result.current.selectedStudents).toHaveLength(1);
            expect(result.current.selectedStudents[0]).toBeInstanceOf(Participant);
        });
    });
});