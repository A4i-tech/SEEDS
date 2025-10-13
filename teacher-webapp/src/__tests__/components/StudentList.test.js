import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StudentList } from '../../components/StudentList';
import { students } from '../../state';

// Common props for consistent testing
const defaultProps = {
    students,
    selectedStudents: [],
    handleStudentToggle: jest.fn()
};

describe('StudentList Component', () => {
    // Helper function to reduce code duplication
    const renderStudentList = (props = {}) => {
        const mergedProps = { ...defaultProps, ...props };
        mergedProps.handleStudentToggle.mockClear();
        return render(<StudentList {...mergedProps} />);
    };

    // Helper to get student elements by content
    const getStudentElement = (student) =>
        screen.getAllByRole('listitem').find(el =>
            el.textContent.includes(student.name)
        );

    // Helper to get student by text content
    const getStudentByText = (student) =>
        screen.getByText(`${student.name} - ${student.phone_number}`);

    describe('Rendering', () => {
        test('renders title and all students', () => {
            renderStudentList();

            expect(screen.getByText('Students')).toBeInTheDocument();
            students.forEach(student => {
                expect(getStudentByText(student)).toBeInTheDocument();
            });
        });

        test('renders empty list when no students provided', () => {
            renderStudentList({ students: [] });
            expect(screen.getByRole('list')).toBeEmptyDOMElement();
        });
    });

    describe('Student Interaction', () => {
        test('handles student selection', () => {
            renderStudentList();

            fireEvent.click(getStudentByText(students[0]));
            expect(defaultProps.handleStudentToggle).toHaveBeenCalledWith(students[0]);
        });
    });

    describe('Selection States', () => {
        test('handles multiple student selections', () => {
            const selectedStudents = [students[0], students[1]];
            renderStudentList({ selectedStudents });

            selectedStudents.forEach(student => {
                expect(getStudentElement(student)).toHaveClass('selected');
            });
        });

        test('handles empty selectedStudents array', () => {
            renderStudentList({ selectedStudents: [] });

            screen.getAllByRole('listitem').forEach(element => {
                expect(element).not.toHaveClass('selected');
            });
        });

        test('correctly identifies selected students by phone number', () => {
            // Create a student with same phone but different name
            const selectedStudent = { ...students[0], name: 'Different Name' };
            renderStudentList({ selectedStudents: [selectedStudent] });

            // Should be selected because phone numbers match
            expect(getStudentElement(students[0])).toHaveClass('selected');
        });
    });
});