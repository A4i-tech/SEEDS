import React, { useState } from "react";
import PasswordInput from "../../PasswordInput";
import TableSkeleton from "../shared/TableSkeleton";
import "./css/RegistrationTab.css";
import "./css/TeacherRegistrationForm.css";
import "../shared/buttons.css";
import "../shared/cards.css";
import "../shared/tables.css";
import "../shared/utilities.css";

const VolunteersPanel = ({ volunteers, isLoading, onCreateVolunteer, message, messageType = "success" }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async () => {
    const success = await onCreateVolunteer(name, email, password);
    if (success) {
      setName("");
      setEmail("");
      setPassword("");
    }
  };

  return (
    <div className="card registration-flex-card">
      <div>
        <div className="card-title">Volunteer Management</div>
        <div className="card-description">Create and manage volunteers for your tenant.</div>
      </div>

      <div className="registration-card">
        <h3 className="registration-title">Create Volunteer</h3>
        <label className="label" htmlFor="volunteer-name">
          Name
        </label>
        <input
          id="volunteer-name"
          type="text"
          placeholder="Volunteer name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field"
        />
        <label className="label" htmlFor="volunteer-email">
          Email
        </label>
        <input
          id="volunteer-email"
          type="email"
          placeholder="Volunteer email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input-field"
        />
        <PasswordInput
          id="volunteer-password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="button" className="primary-button full-width-button" onClick={handleSubmit}>
          Create Volunteer
        </button>
        {message && (
          <p className={messageType === "error" ? "error-message" : "success-message"}>{message}</p>
        )}
      </div>

      <div className="teachers-section">
        <h3 className="teachers-section-title">Volunteers</h3>
        {isLoading && volunteers.length === 0 ? (
          <div className="table-wrapper">
            <TableSkeleton columns={["Name", "Email"]} />
          </div>
        ) : volunteers.length === 0 ? (
          <div className="no-teachers">No volunteers yet.</div>
        ) : (
          <div className="table-wrapper">
            <table className="content-table">
              <thead>
                <tr>
                  <th className="table-header">Name</th>
                  <th className="table-header">Email</th>
                </tr>
              </thead>
              <tbody>
                {volunteers.map((volunteer) => (
                  <tr key={volunteer.id} className="table-row-white">
                    <td className="table-cell">{volunteer.name}</td>
                    <td className="table-cell">{volunteer.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default VolunteersPanel;
