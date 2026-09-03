import React from "react";
import { Plus, Clock, FolderKanban, Globe, Languages as LangIcon } from "lucide-react";
import "../manage.css";
import {
  Button, Badge, Dialog, ConfirmDialog, Field, Input, Textarea, SearchInput, useToast,
} from "../primitives";
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
            <Button variant="primary" onClick={onAdd}>
              <Plus size={15} /> {addLabel}
            </Button>
          ) : null}
        </div>
      </div>
      {children}
    </>
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
    { key: "status", header: "Status", render: (project) => <StatusPill status={project.status} /> },
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
        emptyIcon={FolderKanban}
        emptyTitle="No projects"
        emptyMessage="Create a project to start localizing its websites."
      />
      {dlg ? (
        <Dialog
          open
          onOpenChange={() => setDlg(null)}
          title={dlg.mode === "edit" ? "Edit project" : "New project"}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDlg(null)}>Cancel</Button>
              <Button variant="primary" onClick={save} disabled={!dlg.values.name.trim()}>Save</Button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Name">
              <Input value={dlg.values.name} onChange={(e) => set("name", e.target.value)} autoFocus />
            </Field>
            <Field label="Source language">
              <Input value={dlg.values.sourceLanguage} onChange={(e) => set("sourceLanguage", e.target.value)} />
            </Field>
            <div className="full">
              <Field label="Description">
                <Textarea rows={2} value={dlg.values.description} onChange={(e) => set("description", e.target.value)} />
              </Field>
            </div>
            <Field label="Status">
              <select className="input" value={dlg.values.status} onChange={(e) => set("status", e.target.value)}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </Field>
          </div>
        </Dialog>
      ) : null}
      <ConfirmDialog
        open={Boolean(del)}
        onOpenChange={() => setDel(null)}
        title="Delete project?"
        description={`"${del?.name}" will be removed. This cannot be undone.`}
        confirmLabel="Delete project"
        onConfirm={remove}
      />
    </div>
  );
}

function SitesView({ loc, toast }) {
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
    onCreate: (values) => handleCreateSite({
      projectId: values.projectId,
      domain: extractDomain(values.url),
      name: values.name,
      status: values.status,
    }),
    onUpdate: (id, values) => handleUpdateSite(id, {
      name: values.name,
      domain: extractDomain(values.url),
      status: values.status,
    }),
    onDelete: handleDeleteSite,
    toast,
    entityLabel: "Site",
  });

  const columns = [
    { key: "name", header: "Website / Domain", className: "t-name mono", render: (site) => site.domain },
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
        addLabel="Register site"
        onAdd={() => open(null)}
      />
      <CrudTable
        columns={columns}
        rows={rows}
        getId={(site) => site.id}
        onEdit={open}
        onDelete={setDel}
        emptyIcon={Globe}
        emptyTitle="No sites found"
        emptyMessage="Register a website above to get started."
      />
      {dlg ? (
        <Dialog
          open
          onOpenChange={() => setDlg(null)}
          title={dlg.mode === "edit" ? "Edit site" : "Register site"}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDlg(null)}>Cancel</Button>
              <Button variant="primary" onClick={save} disabled={!dlg.values.url.trim()}>Save</Button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Name">
              <Input value={dlg.values.name} onChange={(e) => set("name", e.target.value)} autoFocus />
            </Field>
            <Field label="Domain or URL">
              <Input value={dlg.values.url} onChange={(e) => set("url", e.target.value)} placeholder="example.com" />
            </Field>
            <Field label="Project">
              <select
                className="input"
                value={dlg.values.projectId}
                onChange={(e) => set("projectId", e.target.value)}
                disabled={dlg.mode === "edit"}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={dlg.values.status} onChange={(e) => set("status", e.target.value)}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </Field>
          </div>
        </Dialog>
      ) : null}
      <ConfirmDialog
        open={Boolean(del)}
        onOpenChange={() => setDel(null)}
        title="Delete site?"
        description={`"${del?.name || del?.domain}" will be removed. This cannot be undone.`}
        confirmLabel="Delete site"
        onConfirm={remove}
      />
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
      toast({ message: `Language ${language.enabled === false ? "added" : "updated"}`, tone: "good" });
    } catch (e) {
      toast({ message: e.message, tone: "crit" });
    }
  };

  const columns = [
    { key: "name", header: "Language", className: "t-name", render: (language) => language.name },
    { key: "code", header: "Code", className: "mono", render: (language) => language.code },
    { key: "direction", header: "Direction", render: (language) => language.direction.toUpperCase() },
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
        emptyIcon={LangIcon}
        emptyTitle="No languages"
        emptyMessage="Add a target language to translate into."
      />
      {dlg ? (
        <Dialog
          open
          onOpenChange={() => setDlg(null)}
          title={dlg.mode === "edit" ? "Edit language" : "Add language"}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDlg(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={save}
                disabled={!dlg.values.name.trim() || !dlg.values.code.trim()}
              >
                Save
              </Button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Name">
              <Input value={dlg.values.name} onChange={(e) => set("name", e.target.value)} placeholder="Hindi" autoFocus />
            </Field>
            <Field label="Code">
              <Input value={dlg.values.code} onChange={(e) => set("code", e.target.value)} placeholder="hi" />
            </Field>
            <Field label="Direction">
              <select className="input" value={dlg.values.direction} onChange={(e) => set("direction", e.target.value)}>
                <option value="ltr">Left to right</option>
                <option value="rtl">Right to left</option>
              </select>
            </Field>
          </div>
        </Dialog>
      ) : null}
      <ConfirmDialog
        open={Boolean(del)}
        onOpenChange={() => setDel(null)}
        title="Remove language?"
        description={`"${del?.name}" will be removed.`}
        confirmLabel="Remove language"
        onConfirm={remove}
      />
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
