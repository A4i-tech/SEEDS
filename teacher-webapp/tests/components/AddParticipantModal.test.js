import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AddParticipantModal } from '../../src/components/AddParticipantModal';

// Optimized mock data with factory function
const createMockStudent = (index) => ({
    name: `Available Student ${index}`,
    phone_number: String(index).repeat(10),
    role: 'Student'
});

const mockAvailableStudents = Array.from({ length: 3 }, (_, i) => createMockStudent(i + 1));

// Common props for consistent testing
const defaultProps = {
    open: true,
    onClose: jest.fn(),
    availableStudents: mockAvailableStudents,
    onSubmit: jest.fn()
};

describe('AddParticipantModal Component', () => {
    // Helper function to reduce code duplication
    const renderModal = (props = {}) => {
        const mergedProps = { ...defaultProps, ...props };
        // Reset mocks for each render
        mergedProps.onClose.mockClear();
        mergedProps.onSubmit.mockClear();
        return render(<AddParticipantModal {...mergedProps} />);
    };

    // Helper to get student checkbox by index (more reliable than text)
    const getStudentCheckbox = (studentIndex) =>
        screen.getByLabelText(new RegExp(`Available Student ${studentIndex}`));

    // Helper to get buttons
    const getButtons = () => ({
        submit: screen.getByRole('button', { name: /submit/i }),
        cancel: screen.getByRole('button', { name: /cancel/i })
    });

    describe('Rendering', () => {
        test('does not render when closed', () => {
            renderModal({ open: false });
            expect(screen.queryByText('Select Participants to Add')).not.toBeInTheDocument();
        });

        test('renders modal elements when open', () => {
            renderModal();

            expect(screen.getByText('Select Participants to Add')).toBeInTheDocument();
            expect(screen.getByRole('list')).toBeInTheDocument();

            const { submit, cancel } = getButtons();
            expect(submit).toBeInTheDocument();
            expect(cancel).toBeInTheDocument();
        });

        test('displays all available students', () => {
            renderModal();

            mockAvailableStudents.forEach(student => {
                expect(screen.getByText(`${student.name} - ${student.phone_number}`)).toBeInTheDocument();
            });

            expect(screen.getAllByRole('checkbox')).toHaveLength(mockAvailableStudents.length);
        });

        test('renders empty state correctly', () => {
            renderModal({ availableStudents: [] });

            expect(screen.getByText('Select Participants to Add')).toBeInTheDocument();
            expect(screen.getByRole('list')).toBeEmptyDOMElement();
            expect(getButtons().submit).toBeDisabled();
        });
    });

    describe('Button States', () => {
        test('submit button is disabled when no students selected', () => {
            renderModal();
            expect(getButtons().submit).toBeDisabled();
        });

        test('submit button is enabled when students are selected', () => {
            renderModal();

            fireEvent.click(getStudentCheckbox(1));
            expect(getButtons().submit).toBeEnabled();
        });
    });

    describe('Student Selection', () => {
        test('can select and deselect students', () => {
            renderModal();
            const checkbox = getStudentCheckbox(1);

            // Select student
            fireEvent.click(checkbox);
            expect(checkbox).toBeChecked();

            // Deselect student
            fireEvent.click(checkbox);
            expect(checkbox).not.toBeChecked();
        });

        test('can select multiple students', () => {
            renderModal();
            const checkboxes = [getStudentCheckbox(1), getStudentCheckbox(2)];

            checkboxes.forEach(checkbox => fireEvent.click(checkbox));
            checkboxes.forEach(checkbox => expect(checkbox).toBeChecked());
        });

        test('maintains selection state correctly', () => {
            renderModal();
            const [first, second] = [getStudentCheckbox(1), getStudentCheckbox(2)];

            // Select both
            fireEvent.click(first);
            fireEvent.click(second);
            expect(first).toBeChecked();
            expect(second).toBeChecked();

            // Deselect first
            fireEvent.click(first);
            expect(first).not.toBeChecked();
            expect(second).toBeChecked();
        });
    });

    describe('Form Actions', () => {
        test('handles submit with selected students', () => {
            renderModal();

            // Select students 1 and 3
            fireEvent.click(getStudentCheckbox(1));
            fireEvent.click(getStudentCheckbox(3));

            fireEvent.click(getButtons().submit);

            expect(defaultProps.onSubmit).toHaveBeenCalledWith(['1111111111', '3333333333']);
            expect(defaultProps.onClose).toHaveBeenCalled();
        });

        test('handles cancel button click', () => {
            renderModal();

            fireEvent.click(getButtons().cancel);

            expect(defaultProps.onClose).toHaveBeenCalled();
            expect(defaultProps.onSubmit).not.toHaveBeenCalled();
        });

        test('clears selection after submit', () => {
            const { rerender } = renderModal();

            fireEvent.click(getStudentCheckbox(1));
            fireEvent.click(getButtons().submit);

            // Re-render to verify state reset
            rerender(<AddParticipantModal {...defaultProps} />);
            expect(getStudentCheckbox(1)).not.toBeChecked();
        });
    });

    describe('Edge Cases', () => {
        test('handles empty student list gracefully', () => {
            renderModal({ availableStudents: [] });

            expect(screen.getByText('Select Participants to Add')).toBeInTheDocument();
            expect(screen.getByRole('list')).toBeEmptyDOMElement();
            expect(getButtons().submit).toBeDisabled();
        });

        test('renders with proper modal structure', () => {
            renderModal();

            expect(screen.getByRole('list')).toBeInTheDocument();
            expect(screen.getAllByRole('listitem')).toHaveLength(mockAvailableStudents.length);
            expect(screen.getAllByRole('checkbox')).toHaveLength(mockAvailableStudents.length);
        });
    });
});