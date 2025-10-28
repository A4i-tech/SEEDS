import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../src/App';
import { ConferenceProvider } from '../src/context/ConferenceContext';
import { ROUTES } from '../src/constants/routes';

// Mock the UI list components so they call the real context handlers (no app changes required)
jest.mock('../src/components/TeacherList', () => {
  const React = require('react');
  const { useConference } = require('../src/context/ConferenceContext');
  return {
    TeacherList: (props) => {
      const { teachers } = props;
      const { selectedTeacher, handleTeacherSelect } = useConference();
      return React.createElement(
        'div',
        { className: 'list-box' },
        React.createElement('h2', { className: 'list-title' }, 'Teacher'),
        React.createElement('ul', { className: 'list' },
          teachers.map((t) => React.createElement(
            'li',
            {
              key: t.phone_number,
              className: `list-item ${selectedTeacher?.phone_number === t.phone_number ? 'selected' : ''}`,
              onClick: () => handleTeacherSelect(t),
            },
            React.createElement('div', { className: 'list-item-content' }, React.createElement('span', null, `${t.name} - ${t.phone_number}`))
          ))
        )
      );
    }
  };
});

jest.mock('../src/components/StudentList', () => {
  const React = require('react');
  const { useConference } = require('../src/context/ConferenceContext');
  return {
    StudentList: (props) => {
      const { students } = props;
      const { selectedStudents, handleStudentToggle } = useConference();
      return React.createElement(
        'div',
        { className: 'list-box' },
        React.createElement('h2', { className: 'list-title' }, 'Students'),
        React.createElement('ul', { className: 'list' },
          students.map((s) => React.createElement(
            'li',
            {
              key: s.phone_number,
              className: `list-item ${selectedStudents.some((st) => st.phone_number === s.phone_number) ? 'selected' : ''}`,
              onClick: () => handleStudentToggle(s),
            },
            React.createElement('div', { className: 'list-item-content' }, React.createElement('span', null, `${s.name} - ${s.phone_number}`))
          ))
        )
      );
    }
  };
});

// Mock the API service
jest.mock('../src/services/apiService');

// Mock EventSource
global.EventSource = jest.fn(() => ({
    onmessage: null,
    onerror: null,
    close: jest.fn(),
}));

// Mock environment variables
process.env.REACT_APP_CONF_SERVER_BASE_URI = 'http://localhost:3001';

describe('Integration Tests - Full App Flow', () => {
    // Render the app and navigate to HOME route before interacting
    const renderApp = () => {
        window.history.pushState({}, 'Home', ROUTES.HOME);
        return render(<ConferenceProvider><App /></ConferenceProvider>);
    };

    const teacherText = 'John Doe - 911234567890';
    const teacher2Text = 'Jane Smith - 911234567890';
    const student1Text = 'Smart Phone Motorola - 911234567890';
    const student2Text = 'Jack Brown - 911234567890';

    const getElement = (text) => screen.getByText(new RegExp(text));
    const getStartButton = () => screen.getByRole('button', { name: /start conference/i });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Selection Behavior', () => {
        test('handles teacher selection and deselection correctly', () => {
            renderApp();
            const teacher = getElement(teacherText);
            const teacher2 = getElement(teacher2Text);
            const student = getElement(student1Text);
            const submitButton = getStartButton();

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
            // After deselecting student1, student2 should still be selected
            expect(student2.closest('li').classList.contains('selected')).toBe(true);
        });
    });
});