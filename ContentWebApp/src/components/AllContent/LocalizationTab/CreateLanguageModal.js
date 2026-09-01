import React, { useState, useEffect } from "react";

const CreateLanguageModal = ({
  isOpen,
  onClose,
  onSave,
  editingLanguage,
}) => {
  const initialLanguage = {
    id: null,
    name: "",
    code: "",
    direction: "LTR",
    enabled: true,
  };

  const [language, setLanguage] = useState(initialLanguage);

  useEffect(() => {
    if (!isOpen) return;

    if (editingLanguage) {
      setLanguage(editingLanguage);
    } else {
      setLanguage(initialLanguage);
    }
  }, [editingLanguage, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setLanguage((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSave = () => {
    if (!language.name.trim()) {
      alert("Language Name is required.");
      return;
    }

    if (!language.code.trim()) {
      alert("Language Code is required.");
      return;
    }

    onSave({
      ...language,
      id: editingLanguage ? editingLanguage.id : Date.now(),
    });

    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 999999999,
      }}
    >
      <div
        style={{
          width: "520px",
          background: "#fff",
          borderRadius: "12px",
          padding: "25px",
          boxShadow: "0 20px 50px rgba(0,0,0,.30)",
        }}
      >
        <h2 style={{ marginBottom: "20px" }}>
          {editingLanguage ? "Edit Language" : "Add Language"}
        </h2>

        <input
          type="text"
          name="name"
          placeholder="Language Name"
          value={language.name}
          onChange={handleChange}
          style={{
            width: "100%",
            padding: "12px",
            marginBottom: "15px",
            border: "1px solid #ddd",
            borderRadius: "8px",
            boxSizing: "border-box",
          }}
        />

        <input
          type="text"
          name="code"
          placeholder="Language Code (en, hi, ta...)"
          value={language.code}
          onChange={handleChange}
          style={{
            width: "100%",
            padding: "12px",
            marginBottom: "15px",
            border: "1px solid #ddd",
            borderRadius: "8px",
            boxSizing: "border-box",
          }}
        />

        <select
          name="direction"
          value={language.direction}
          onChange={handleChange}
          style={{
            width: "100%",
            padding: "12px",
            marginBottom: "15px",
            border: "1px solid #ddd",
            borderRadius: "8px",
            boxSizing: "border-box",
          }}
        >
          <option value="LTR">Left to Right (LTR)</option>
          <option value="RTL">Right to Left (RTL)</option>
        </select>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "20px",
          }}
        >
          <input
            type="checkbox"
            name="enabled"
            checked={language.enabled}
            onChange={handleChange}
          />
          Enabled
        </label>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "10px 18px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            style={{
              padding: "10px 18px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            {editingLanguage ? "Update Language" : "Save Language"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateLanguageModal;