import React, { useState } from "react";
import Modal from "../../components/AllContent/shared/Modal";
import Select from "../../components/AllContent/shared/Select";
import "../manage.css";
import { Badge, Field, Input, Textarea, SearchInput, useToast } from "../primitives";
import { extractDomain } from "../lib/url";
import { useCrudView } from "../lib/useCrudView";
import { CrudTable } from "../primitives/CrudTable";

const StatusPill = ({ status }) => {
  const isActive = status.toLowerCase() === "active";
  return <Badge tone={isActive ? "good" : "neutral"}>{status}</Badge>;
};

function Header({ title, subtitle, search, onSearch, addLabel, onAdd, children }) {
  return (
    <>
      <div className="mng-head">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="mng-tools">
          <SearchInput
            placeholder={`Search ${title.toLowerCase()}`}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            style={{ width: 200 }}
          />
          {addLabel ? (
            <button className="primary-button" onClick={onAdd}>
              {addLabel}
            </button>
          ) : null}
        </div>
      </div>
      {children}
    </>
  );
}

function ConfirmModal({ title, description, confirmLabel, onCancel, onConfirm }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p>{description}</p>
      <div className="modal-actions">
        <button className="action-ghost-button" onClick={onCancel}>
          Cancel
        </button>
        <button className="row-action row-action-delete" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

function ProjectsView({ loc, toast }) {
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
    { key: "name", header: "Name", className: "t-name", render: (project) => project.name },
    { key: "description", header: "Description", render: (project) => project.description || "-" },
    { key: "sourceLanguage", header: "Source", render: (project) => project.sourceLanguage },
    {
      key: "status",
      header: "Status",
      render: (project) => <StatusPill status={project.status} />,
    },
  ];

  return (
    <div className="mng">
      <Header
        title="Projects"
        subtitle="Group your localized websites and content."
        search={q}
        onSearch={setQ}
        addLabel="New project"
        onAdd={() => open(null)}
      />
      <CrudTable
        columns={columns}
        rows={rows}
        getId={(project) => project.id}
        onEdit={open}
        onDelete={setDel}
        emptyTitle="No projects"
        emptyMessage="Create a project to start localizing its websites."
      />
      {dlg ? (
        <Modal
          title={dlg.mode === "edit" ? "Edit project" : "New project"}
          onClose={() => setDlg(null)}
        >
          <Field label="Name">
            <Input value={dlg.values.name} onChange={(e) => set("name", e.target.value)} autoFocus />
          </Field>
          <Field label="Source language">
            <Input
              value={dlg.values.sourceLanguage}
              onChange={(e) => set("sourceLanguage", e.target.value)}
            />
          </Field>
          <Field label="Description">
            <Textarea
              rows={2}
              value={dlg.values.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <Field label="Status">
            <Select
              value={dlg.values.status}
              onChange={(v) => set("status", v)}
              options={[
                { value: "Active", label: "Active" },
                { value: "Inactive", label: "Inactive" },
              ]}
            />
          </Field>
          <div className="modal-actions">
            <button className="action-ghost-button" onClick={() => setDlg(null)}>
              Cancel
            </button>
            <button className="primary-button" onClick={save} disabled={!dlg.values.name.trim()}>
              Save
            </button>
          </div>
        </Modal>
      ) : null}
      {del ? (
        <ConfirmModal
          title="Delete project?"
          description={`"${del.name}" will be removed. This cannot be undone.`}
          confirmLabel="Delete project"
          onCancel={() => setDel(null)}
          onConfirm={remove}
        />
      ) : null}
    </div>
  );
}

function SitesView({ loc, toast }) {
  const { sites, projects, handleCreateSite, handleUpdateSite, handleDeleteSite } = loc;
  const [visible, setVisible] = useState(false);

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
      className: "t-name mono",
      render: (site) => site.domain,
    },
    { key: "project", header: "Project", render: (site) => projectName(site.projectId) },
    { key: "status", header: "Status", render: (site) => <StatusPill status={site.status} /> },
  ];

  return (
    <div className="mng">
      <Header
        title="Sites"
        subtitle="Websites connected to the localization SDK."
        search={q}
        onSearch={setQ}
        addLabel={visible ? "Hide" : "Show"}
        onAdd={() => setVisible((v) => !v)}
      />
      {visible ? (
        <CrudTable
          columns={columns}
          rows={rows}
          getId={(site) => site.id}
          onEdit={open}
          onDelete={setDel}
          emptyTitle="No sites found"
          emptyMessage="Register a website above to get started."
        />
      ) : null}
      {dlg ? (
        <Modal
          title={dlg.mode === "edit" ? "Edit site" : "Register site"}
          onClose={() => setDlg(null)}
        >
          <Field label="Name">
            <Input value={dlg.values.name} onChange={(e) => set("name", e.target.value)} autoFocus />
          </Field>
          <Field label="Domain or URL">
            <Input
              value={dlg.values.url}
              onChange={(e) => set("url", e.target.value)}
              placeholder="example.com"
            />
          </Field>
          <Field label="Project">
            <Select
              value={dlg.values.projectId}
              onChange={(v) => set("projectId", v)}
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
              disabled={dlg.mode === "edit"}
            />
          </Field>
          <Field label="Status">
            <Select
              value={dlg.values.status}
              onChange={(v) => set("status", v)}
              options={[
                { value: "Active", label: "Active" },
                { value: "Inactive", label: "Inactive" },
              ]}
            />
          </Field>
          <div className="modal-actions">
            <button className="action-ghost-button" onClick={() => setDlg(null)}>
              Cancel
            </button>
            <button className="primary-button" onClick={save} disabled={!dlg.values.url.trim()}>
              Save
            </button>
          </div>
        </Modal>
      ) : null}
      {del ? (
        <ConfirmModal
          title="Delete site?"
          description={`"${del.name || del.domain}" will be removed. This cannot be undone.`}
          confirmLabel="Delete site"
          onCancel={() => setDel(null)}
          onConfirm={remove}
        />
      ) : null}
    </div>
  );
}

function LanguagesView({ loc, toast }) {
  const { languages, handleCreateLanguage, handleUpdateLanguage, handleDeleteLanguage } = loc;

  const { q, setQ, rows, dlg, setDlg, open, set, save, del, setDel, remove } = useCrudView({
    items: languages,
    matchFn: (language, query) => {
      const haystack = `${language.name} ${language.code}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    },
    getId: (language) => language.id,
    emptyValues: { name: "", code: "", direction: "ltr", enabled: true },
    onCreate: handleCreateLanguage,
    onUpdate: handleUpdateLanguage,
    onDelete: handleDeleteLanguage,
    toast,
    entityLabel: "Language",
  });

  const toggle = async (language) => {
    try {
      await handleUpdateLanguage(language.id, { enabled: language.enabled === false });
      toast({
        message: `Language ${language.enabled === false ? "added" : "updated"}`,
        tone: "good",
      });
    } catch (e) {
      toast({ message: e.message, tone: "crit" });
    }
  };

  const columns = [
    { key: "name", header: "Language", className: "t-name", render: (language) => language.name },
    { key: "code", header: "Code", className: "mono", render: (language) => language.code },
    {
      key: "direction",
      header: "Direction",
      render: (language) => language.direction.toUpperCase(),
    },
    {
      key: "enabled",
      header: "Enabled",
      render: (language) => (
        <button
          className="switch"
          onClick={() => toggle(language)}
          aria-label={language.enabled !== false ? "Disable" : "Enable"}
          aria-pressed={language.enabled !== false}
        >
          <span className={`track ${language.enabled !== false ? "on" : ""}`}>
            <span className="knob" />
          </span>
        </button>
      ),
    },
  ];

  return (
    <div className="mng">
      <Header
        title="Languages"
        subtitle="Target languages available to the SDK and reviewers."
        search={q}
        onSearch={setQ}
        addLabel="Add language"
        onAdd={() => open(null)}
      />
      <CrudTable
        columns={columns}
        rows={rows}
        getId={(language) => language.id}
        onEdit={open}
        onDelete={setDel}
        emptyTitle="No languages"
        emptyMessage="Add a target language to translate into."
      />
      {dlg ? (
        <Modal
          title={dlg.mode === "edit" ? "Edit language" : "Add language"}
          onClose={() => setDlg(null)}
        >
          <Field label="Name">
            <Input
              value={dlg.values.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Hindi"
              autoFocus
            />
          </Field>
          <Field label="Code">
            <Input
              value={dlg.values.code}
              onChange={(e) => set("code", e.target.value)}
              placeholder="hi"
            />
          </Field>
          <Field label="Direction">
            <Select
              value={dlg.values.direction}
              onChange={(v) => set("direction", v)}
              options={[
                { value: "ltr", label: "Left to right" },
                { value: "rtl", label: "Right to left" },
              ]}
            />
          </Field>
          <div className="modal-actions">
            <button className="action-ghost-button" onClick={() => setDlg(null)}>
              Cancel
            </button>
            <button
              className="primary-button"
              onClick={save}
              disabled={!dlg.values.name.trim() || !dlg.values.code.trim()}
            >
              Save
            </button>
          </div>
        </Modal>
      ) : null}
      {del ? (
        <ConfirmModal
          title="Remove language?"
          description={`"${del.name}" will be removed.`}
          confirmLabel="Remove language"
          onCancel={() => setDel(null)}
          onConfirm={remove}
        />
      ) : null}
    </div>
  );
}

export function ManageScreen({ nav, loc }) {
  const { toast } = useToast();
  if (nav === "projects") return <ProjectsView loc={loc} toast={toast} />;
  if (nav === "sites") return <SitesView loc={loc} toast={toast} />;
  if (nav === "languages") return <LanguagesView loc={loc} toast={toast} />;
  return null;
}

export default ManageScreen;
