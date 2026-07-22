import React, { useState, useEffect } from "react";

const CreateSiteModal = ({
  isOpen,
  onClose,
  onSave,
  editingSite,
  projects,
}) => {
  const initialSite = {
    id: null,
    name: "",
    url: "",
    projectId: "",
    status: "Active",
  };

  const [site, setSite] = useState(initialSite);

  useEffect(() => {
    if (!isOpen) return;

    if (editingSite) {
      setSite(editingSite);
    } else {
      setSite(initialSite);
    }
  }, [editingSite, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;

    setSite((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = () => {
    if (!site.name.trim()) {
      alert("Site Name is required.");
      return;
    }

    if (!site.url.trim()) {
      alert("Website URL is required.");
      return;
    }

    if (!site.projectId) {
      alert("Please select a project.");
      return;
    }

    const siteData = {
        ...site,
        id: editingSite ? editingSite.id : Date.now(),
      };
      
      onSave(siteData);  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 999999,
      }}
    >
      <div
        style={{
          width: "550px",
          background: "#ffffff",
          borderRadius: "12px",
          padding: "25px",
          boxShadow: "0 20px 50px rgba(0,0,0,.30)",
        }}
      >
        <h2 style={{ marginBottom: "20px" }}>
          {editingSite ? "Edit Site" : "Register Site"}
        </h2>

        <input
          type="text"
          name="name"
          placeholder="Site Name"
          value={site.name}
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
          name="url"
          placeholder="https://example.com"
          value={site.url}
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
          name="projectId"
          value={site.projectId}
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
          <option value="">Select Project</option>

          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>

        <select
          name="status"
          value={site.status}
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
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 18px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>

          <button
            type="button"
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
            {editingSite ? "Update Site" : "Register Site"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateSiteModal;