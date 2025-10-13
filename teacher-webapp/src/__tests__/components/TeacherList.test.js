import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TeacherList } from '../../components/TeacherList';
import { teachers } from '../../state';

describe('TeacherList Component', () => {
    const defaultProps = {
        teachers,
        selectedTeacher: null,
        handleTeacherSelect: jest.fn()
    };

    const renderTeacherList = (props = {}) => {
        const finalProps = { ...defaultProps, handleTeacherSelect: jest.fn(), ...props };
        return render(<TeacherList {...finalProps} />);
    };

    const getTeacherElement = (teacher) =>
        screen.getAllByRole('listitem').find(el => el.textContent.includes(teacher.name));

    const getTeacherByText = (teacher) =>
        screen.getByText(`${teacher.name} - ${teacher.phone_number}`);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Rendering', () => {
        test('renders title and all teachers', () => {
            renderTeacherList();

            expect(screen.getByText('Teacher')).toBeInTheDocument();
            teachers.forEach(teacher => {
                expect(getTeacherByText(teacher)).toBeInTheDocument();
            });
        });

        test('renders empty list when no teachers provided', () => {
            renderTeacherList({ teachers: [] });
            expect(screen.getByRole('list')).toBeEmptyDOMElement();
        });
    });

    describe('Teacher Interaction', () => {
        test('handles teacher selection', () => {
            const mockSelect = jest.fn();
            renderTeacherList({ handleTeacherSelect: mockSelect });

            fireEvent.click(getTeacherByText(teachers[0]));
            expect(mockSelect).toHaveBeenCalledWith(teachers[0]);
        });
    });

    describe('Selection States', () => {
        test('highlights selected teacher and ignores unselected', () => {
            const selectedTeacher = teachers[0];
            renderTeacherList({ selectedTeacher });

            expect(getTeacherElement(selectedTeacher)).toHaveClass('selected');
        });

        test('handles null selectedTeacher prop', () => {
            renderTeacherList({ selectedTeacher: null });

            screen.getAllByRole('listitem').forEach(element => {
                expect(element).not.toHaveClass('selected');
            });
        });
    });
});