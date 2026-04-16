import React, { useState } from "react";
import StudentsTable from "./StudentsTable";
import Modal from "../shared/Modal";
import "./css/TeacherRegistrationForm.css";
import "../shared/buttons.css";
import "../shared/cards.css";
import "../shared/tables.css";
import "../shared/utilities.css";

const StudentsSection = ({ students, onAddStudent, onUpdateStudent, onDeleteStudent }) => {
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  const [editingStudent, setEditingStudent] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const handleSubmit = async () => {
    const success = await onAddStudent(name, phoneNumber);
    if (success) {
      setName("");
      setPhoneNumber("");
    }
  };

  const openEdit = (student) => {
    setEditingStudent(student);
    setEditName(student.name);
    setEditPhone(student.phoneNumber);
  };

  const closeEdit = () => setEditingStudent(null);

  const saveEdit = async () => {
    const success = await onUpdateStudent(editingStudent._id, editName, editPhone);
    if (success) closeEdit();
  };

  return (
    <div className="teachers-section">
      <h3 className="teachers-section-title">Students</h3>

      <div className="registration-card">
        <h3 className="registration-title">Add Student</h3>
        <label className="label" htmlFor="student-name">Name</label>
        <input
          id="student-name"
          type="text"
          placeholder="Student name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field"
        />
        <label className="label" htmlFor="student-phone">Phone Number</label>
        <input
          id="student-phone"
          type="tel"
          placeholder="Phone number"
          value={phoneNumber}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, "");
            if (val.length <= 10) setPhoneNumber(val);
          }}
          maxLength={10}
          className="input-field"
        />
        <button type="button" className="primary-button full-width-button" onClick={handleSubmit}>
          Add Student
        </button>
      </div>

      <StudentsTable
        students={students}
        onEditStudent={openEdit}
        onRemoveStudent={(student) => onDeleteStudent(student._id)}
      />

      {editingStudent && (
        <Modal title="Edit Student" onClose={closeEdit}>
          <label className="label" htmlFor="edit-student-name">Name</label>
          <input
            id="edit-student-name"
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="input-field"
          />
          <label className="label" htmlFor="edit-student-phone">Phone Number</label>
          <input
            id="edit-student-phone"
            type="tel"
            value={editPhone}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              if (val.length <= 10) setEditPhone(val);
            }}
            maxLength={10}
            className="input-field"
          />
          <div className="modal-actions">
            <button type="button" className="primary-button" onClick={saveEdit}>Save</button>
            <button type="button" className="action-ghost-button" onClick={closeEdit}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default StudentsSection;
