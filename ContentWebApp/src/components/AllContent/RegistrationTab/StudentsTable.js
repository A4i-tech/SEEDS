import React from "react";
import "../shared/buttons.css";
import "../shared/tables.css";
import "../shared/modals.css";
import "../shared/buttons.css";
import { PhoneNumberInput } from "../shared/PhoneNumberInput";
import { PHONE_DIGITS_LENGTH } from "../../../utils/phoneUtils";

/** Show 10-digit form for edit (strip 91 prefix if present). */
const toDisplayPhone = (phone) => {
  if (!phone || typeof phone !== "string") return "";
  const d = phone.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  return d.slice(0, 10);
};

const StudentsTable = ({ students, teacher, onRemoveStudent, onUpdateStudent }) => {
  const [editing, setEditing] = useState(null); // { name, phoneNumber } of row being edited
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editError, setEditError] = useState("");

  const openEdit = useCallback((student) => {
    setEditing({ name: student.name, phoneNumber: student.phoneNumber });
    setEditName(student.name);
    setEditPhone(toDisplayPhone(student.phoneNumber));
    setEditError("");
  }, []);

  const closeEdit = useCallback(() => {
    setEditing(null);
    setEditName("");
    setEditPhone("");
    setEditError("");
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editing || !teacher || !onUpdateStudent) return;
    const name = (editName || "").trim();
    const phone = (editPhone || "").trim();
    if (!name || !phone) return;
    setEditError("");
    const result = await onUpdateStudent(teacher, editing.phoneNumber, name, phone);
    if (result === true) {
      closeEdit();
    } else {
      setEditError(typeof result === "string" ? result : "Failed to update student.");
    }
  }, [editing, teacher, editName, editPhone, onUpdateStudent, closeEdit]);

  useEffect(() => {
    if (!editing) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") closeEdit();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editing, closeEdit]);

const StudentsTable = ({ students = [], onEditStudent, onRemoveStudent }) => {
  return (
    <div className="table-scroll">
      <table className="students-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {students.length === 0 ? (
            <tr>
              <td colSpan={3} className="no-content">No students</td>
            </tr>
          ) : (
            students.map((student) => (
              <tr key={student._id}>
                <td>{student.name}</td>
                <td>{student.phoneNumber}</td>
                <td>
                  <button type="button" className="action-ghost-button" onClick={() => onEditStudent(student)}>Edit</button>
                  <button type="button" className="action-ghost-button" onClick={() => onRemoveStudent(student._id)}>Remove</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default StudentsTable;
