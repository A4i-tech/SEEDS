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

    describe('Complete User Flow', () => {
        test('handles full selection to conference creation flow', async () => {
            mockedCreateConference.mockResolvedValue({ id: 'conf-integration-test' });
            renderApp();

            expect(screen.getByText('Welcome')).toBeInTheDocument();
            expect(screen.getByText('Teacher')).toBeInTheDocument();
            expect(screen.getByText('Students')).toBeInTheDocument();

            const submitButton = getSubmitButton();
            expect(submitButton).toBeDisabled();

            fireEvent.click(getElement(teacherText));
            expect(submitButton).toBeDisabled();

            fireEvent.click(getElement(student1Text));
            fireEvent.click(getElement(student2Text));
            expect(submitButton).toBeEnabled();

            fireEvent.click(submitButton);
            expect(screen.getByText('Submitting...')).toBeInTheDocument();

            await waitFor(() => {
                expect(mockedCreateConference).toHaveBeenCalledWith(
                    '917999435373',
                    ['918904954836', '917999710236']
                );
            });
        });

        test('handles error during conference creation', async () => {
            const consoleError = jest.spyOn(console, 'error').mockImplementation();
            mockedCreateConference.mockRejectedValue(new Error('Server Error'));
            renderApp();

            fireEvent.click(getElement(teacherText));
            fireEvent.click(getElement(student1Text));
            fireEvent.click(getSubmitButton());

            await waitFor(() => {
                expect(consoleError).toHaveBeenCalledWith('Error in API call:', expect.any(Error));
            });

            await waitFor(() => {
                expect(screen.getByText('Submit')).toBeInTheDocument();
                expect(getSubmitButton()).toBeEnabled();
            });

            consoleError.mockRestore();
        });
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
            expect(teacher.closest('li')).not.toHaveClass('selected');
            expect(teacher2.closest('li')).toHaveClass('selected');
        });

        test('handles student selection and deselection correctly', () => {
            renderApp();
            const teacher = getElement(teacherText);
            const student1 = getElement(student1Text);
            const student2 = getElement(student2Text);
            const submitButton = getSubmitButton();

            fireEvent.click(teacher);

            fireEvent.click(student1);
            expect(submitButton).toBeEnabled();

            fireEvent.click(student2);
            expect(submitButton).toBeEnabled();

            fireEvent.click(student1);
            expect(submitButton).toBeEnabled();

            fireEvent.click(student2);
            expect(submitButton).toBeDisabled();
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

            expect(teacher.closest('li')).toHaveClass('selected');
            expect(student1.closest('li')).toHaveClass('selected');
            expect(student2.closest('li')).toHaveClass('selected');

            // Deselect one student
            fireEvent.click(student1);
            expect(student1.closest('li')).not.toHaveClass('selected');
            expect(student2.closest('li')).toHaveClass('selected');
        });
    });
});