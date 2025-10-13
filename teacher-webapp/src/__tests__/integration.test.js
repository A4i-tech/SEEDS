import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';
import { ConferenceProvider } from '../context/ConferenceContext';
import * as apiService from '../services/apiService';

// Mock the API service
jest.mock('../services/apiService');
const mockedCreateConference = apiService.createConference;

// Mock EventSource
global.EventSource = jest.fn(() => ({
    onmessage: null,
    onerror: null,
    close: jest.fn(),
}));

// Mock environment variables
process.env.REACT_APP_CONF_SERVER_BASE_URI = 'http://localhost:3001';

describe('Integration Tests - Full App Flow', () => {
    const renderApp = () => render(<ConferenceProvider><App /></ConferenceProvider>);

    const teacherText = 'John Doe - 911234567890';
    const teacher2Text = 'Jane Smith - 911234567890';
    const student1Text = 'Smart Phone Motorola - 911234567890';
    const student2Text = 'Jack Brown - 911234567890';

    const getElement = (text) => screen.getByText(new RegExp(text));
    const getSubmitButton = () => screen.getByRole('button', { name: /submit/i });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Selection Behavior', () => {
        test('handles teacher selection and deselection correctly', () => {
            renderApp();
            const teacher = getElement(teacherText);
            const teacher2 = getElement(teacher2Text);
            const student = getElement(student1Text);
            const submitButton = getSubmitButton();

            // Single teacher selection
            fireEvent.click(teacher);
            fireEvent.click(student);
            expect(submitButton).toBeEnabled();

            // Teacher deselection
            fireEvent.click(teacher);
            expect(submitButton).toBeDisabled();

            // Teacher reselection
            fireEvent.click(teacher);
            expect(submitButton).toBeEnabled();

            // Multiple teacher selection (only one allowed)
            fireEvent.click(teacher2);
            expect(teacher2.closest('li')).toHaveClass('list-item');
        });
    });

    describe('Visual Feedback', () => {
        test('provides correct visual selection feedback', () => {
            renderApp();
            const teacher = getElement(teacherText);
            const student1 = getElement(student1Text);
            const student2 = getElement(student2Text);

            // Initially nothing selected
            expect(teacher.closest('li')).not.toHaveClass('selected');
            expect(student1.closest('li')).not.toHaveClass('selected');
            expect(student2.closest('li')).not.toHaveClass('selected');

            // Select items
            fireEvent.click(teacher);
            fireEvent.click(student1);
            fireEvent.click(student2);

            expect(teacher.closest('li')).toHaveClass('list-item');
            expect(student1.closest('li')).toHaveClass('list-item');
            expect(student2.closest('li')).toHaveClass('list-item');

            // Deselect one student
            fireEvent.click(student1);
            expect(student2.closest('li')).toHaveClass('list-item selected');
        });
    });
});