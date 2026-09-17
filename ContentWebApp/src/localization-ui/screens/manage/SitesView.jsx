import React from "react";
import Modal from "../../../components/AllContent/shared/Modal";
import Select from "../../../components/AllContent/shared/Select";
import { extractDomain } from "../../lib/url";
import { useCrudView } from "../../lib/useCrudView";
import { ManageTable } from "../ManageTable";
import { Header, ConfirmModal, ModalActions, StatusPill } from "./shared";

export function SitesView({ loc, toast }) {
  const { sites, projects, handleCreateSite, handleUpdateSite, handleDeleteSite } = loc;

  const projectName = (projectId) => {
    const project = projects.find((p) => String(p.id) === String(projectId));
    return project ? project.name : "-";
  };

  const { q, setQ, rows, dlg, setDlg, open, set, save, del, setDel, remove } = useCrudView({
    items: sites,
    matchFn: (site, query) => {
      const haystack = `${site.name} ${site.domain}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    },
    getId: (site) => site.id,
    emptyValues: { name: "", url: "", projectId: projects[0]?.id || "", status: "Active" },
    onCreate: (values) =>
      handleCreateSite({
        projectId: values.projectId,
        domain: extractDomain(values.url),
        name: values.name,
        status: values.status,
      }),
    onUpdate: (id, values) =>
      handleUpdateSite(id, {
        name: values.name,
        domain: extractDomain(values.url),
        status: values.status,
      }),
    onDelete: handleDeleteSite,
    toast,
    entityLabel: "Site",
  });

  const columns = [
    {
      key: "name",
      header: "Website / Domain",
      className: "teacher-name",
      render: (site) => <code>{site.domain}</code>,
    },
    { key: "project", header: "Project", render: (site) => projectName(site.projectId) },
    { key: "status", header: "Status", render: (site) => <StatusPill status={site.status} /> },
  ];

  return (
    <div className="card">
      <Header
        title="Sites"
        subtitle="Websites connected to the localization SDK."
        search={q}
        onSearch={setQ}
        addLabel="Add site"
        onAdd={() => open(null)}
      />
      <ManageTable
        columns={columns}
        rows={rows}
        getId={(site) => site.id}
        onEdit={open}
        onDelete={setDel}
        emptyTitle="No sites found"
        emptyMessage="Register a website above to get started."
      />
      {dlg && (
        <Modal
          title={dlg.mode === "edit" ? "Edit site" : "Register site"}
          onClose={() => setDlg(null)}
        >
          <label className="label" htmlFor="site-name">Name</label>
          <input
            id="site-name"
            className="input-field"
            value={dlg.values.name}
            onChange={(e) => set("name", e.target.value)}
            autoFocus
          />
          <label className="label" htmlFor="site-url">Domain or URL</label>
          <input
            id="site-url"
            className="input-field"
            value={dlg.values.url}
            onChange={(e) => set("url", e.target.value)}
            placeholder="example.com"
          />
          <label className="label">Project</label>
          <Select
            value={dlg.values.projectId}
            onChange={(v) => set("projectId", v)}
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
            disabled={dlg.mode === "edit"}
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
          <ModalActions onCancel={() => setDlg(null)} onSave={save} disabled={!dlg.values.url.trim()} />
        </Modal>
      )}
      {del && (
        <ConfirmModal
          title="Delete site?"
          description={`"${del.name || del.domain}" will be removed. This cannot be undone.`}
          confirmLabel="Delete site"
          onCancel={() => setDel(null)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}

export default SitesView;
