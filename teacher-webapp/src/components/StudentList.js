import React from 'react';

export const StudentList = ({ students, selectedStudents, onStudentToggle }) => (
  <div className="list-box">
    <h2 className="list-title">Students</h2>
    <ul className="list">
      {students.map((student) => (
        <li
          key={student.phoneNumber}
          className={`list-item ${selectedStudents.some((s) => s.phoneNumber === student.phoneNumber) ? 'selected' : ''}`}
          onClick={() => onStudentToggle(student)}
        >
          <div className="list-item-content">
            <span>{student.name} - {student.phoneNumber}</span>
          </div>
        </li>
      ))}
    </ul>
  </div>
);
