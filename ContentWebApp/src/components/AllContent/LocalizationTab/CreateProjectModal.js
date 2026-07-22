import React, { useState, useEffect } from "react";

const CreateProjectModal = ({
  isOpen,
  onClose,
  onSave,
  editingProject,
}) => {
  const initialProject = {
    id: null,
    name: "",
    description: "",
    sourceLanguage: "English",
    status: "Active",
  };

  const [project, setProject] = useState(initialProject);

  // Load project when editing
  useEffect(() => {
    if (isOpen) {
      if (editingProject) {
        setProject(editingProject);
      } else {
        setProject(initialProject);
      }
    }
  }, [editingProject, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;

    setProject((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = () => {
    if (!project.name.trim()) {
      alert("Project Name is required");
      return;
    }

    onSave(project);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 999999,
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
          {editingProject
            ? "Edit Localization Project"
            : "Create Localization Project"}
        </h2>

        <input
          type="text"
          name="name"
          placeholder="Project Name"
          value={project.name}
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

        <textarea
          name="description"
          placeholder="Description"
          rows={4}
          value={project.description}
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
          name="sourceLanguage"
          value={project.sourceLanguage}
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
          <option value="English">English</option>
          <option value="Hindi">Hindi</option>
          <option value="Kannada">Kannada</option>
          <option value="Tamil">Tamil</option>
        </select>

        <select
          name="status"
          value={project.status}
          onChange={handleChange}
          style={{
            width: "100%",
            padding: "12px",
            marginBottom: "20px",
            border: "1px solid #ddd",
            borderRadius: "8px",
            boxSizing: "border-box",
          }}
        >
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>

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
            {editingProject ? "Update Project" : "Save Project"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateProjectModal;