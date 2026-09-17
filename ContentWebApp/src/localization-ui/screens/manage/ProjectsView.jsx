import React from "react";
import Modal from "../../../components/AllContent/shared/Modal";
import Select from "../../../components/AllContent/shared/Select";
import { useCrudView } from "../../lib/useCrudView";
import { ManageTable } from "../ManageTable";
import { Header, ConfirmModal, ModalActions, StatusPill } from "./shared";

export function ProjectsView({ loc, toast }) {
  const { projects, handleCreateProject, handleUpdateProject, handleDeleteProject } = loc;
  const { q, setQ, rows, dlg, setDlg, open, set, save, del, setDel, remove } = useCrudView({
    items: projects,
    matchFn: (project, query) => project.name.toLowerCase().includes(query.toLowerCase()),
    getId: (project) => project.id,
    emptyValues: { name: "", description: "", sourceLanguage: "English", status: "Active" },
    onCreate: handleCreateProject,
    onUpdate: handleUpdateProject,
    onDelete: handleDeleteProject,
    toast,
    entityLabel: "Project",
  });

  const columns = [
    { key: "name", header: "Name", className: "teacher-name", render: (project) => project.name },
    { key: "description", header: "Description", render: (project) => project.description || "-" },
    { key: "sourceLanguage", header: "Source", render: (project) => project.sourceLanguage },
    {
      key: "status",
      header: "Status",
      render: (project) => <StatusPill status={project.status} />,
    },
  ];

  return (
    <div className="card">
      <Header
        title="Projects"
        subtitle="Group your localized websites and content."
        search={q}
        onSearch={setQ}
        addLabel="New project"
        onAdd={() => open(null)}
      />
      <ManageTable
        columns={columns}
        rows={rows}
        getId={(project) => project.id}
        onEdit={open}
        onDelete={setDel}
        emptyTitle="No projects"
        emptyMessage="Create a project to start localizing its websites."
      />
      {dlg && (
        <Modal
          title={dlg.mode === "edit" ? "Edit project" : "New project"}
          onClose={() => setDlg(null)}
        >
          <label className="label" htmlFor="project-name">Name</label>
          <input
            id="project-name"
            className="input-field"
            value={dlg.values.name}
            onChange={(e) => set("name", e.target.value)}
            autoFocus
          />
          <label className="label" htmlFor="project-source">Source language</label>
          <input
            id="project-source"
            className="input-field"
            value={dlg.values.sourceLanguage}
            onChange={(e) => set("sourceLanguage", e.target.value)}
          />
          <label className="label" htmlFor="project-description">Description</label>
          <textarea
            id="project-description"
            className="input-field"
            rows={2}
            value={dlg.values.description}
            onChange={(e) => set("description", e.target.value)}
          />
          <label className="label">Status</label>
          <Select
            value={dlg.values.status}
            onChange={(v) => set("status", v)}
            options={[
              { value: "Active", label: "Active" },
              { value: "Inactive", label: "Inactive" },
            ]}
          />
          <ModalActions onCancel={() => setDlg(null)} onSave={save} disabled={!dlg.values.name.trim()} />
        </Modal>
      )}
      {del && (
        <ConfirmModal
          title="Delete project?"
          description={`"${del.name}" will be removed. This cannot be undone.`}
          confirmLabel="Delete project"
          onCancel={() => setDel(null)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}

export default ProjectsView;
