import React, { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Clock, FolderKanban, Globe, Languages as LangIcon } from "lucide-react";
import "../manage.css";
import {
  Button, Badge, Dialog, ConfirmDialog, Field, Input, Textarea, SearchInput,
  EmptyState, useToast,
} from "../primitives";

const extractDomain = (url) => {
  const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try { return new URL(withProtocol).hostname; } catch { return url; }
};
const isActive = (s) => String(s || "").toLowerCase() === "active";
const StatusPill = ({ status }) =>
  isActive(status) ? <Badge tone="good">Active</Badge> : <Badge tone="neutral">{status || "Inactive"}</Badge>;

function Header({ title, subtitle, search, onSearch, onAdd, addLabel, children }) {
  return (
    <div className="mng-head">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      <div className="mng-tools">
        <SearchInput placeholder={`Search ${title.toLowerCase()}`} value={search} onChange={(e) => onSearch(e.target.value)} style={{ width: 200 }} />
        {addLabel ? <Button variant="primary" onClick={onAdd}><Plus size={15} /> {addLabel}</Button> : null}
        {children}
      </div>
    </div>
  );
}

const RowActions = ({ onEdit, onDelete }) => (
  <div className="t-actions">
    <Button size="sm" variant="ghost" onClick={onEdit}><Pencil size={13} /> Edit</Button>
    <Button size="sm" variant="danger" onClick={onDelete}><Trash2 size={13} /> Delete</Button>
  </div>
);

/* -------------------- Projects -------------------- */
function ProjectsView({ loc, toast }) {
  const { projects, handleCreateProject, handleUpdateProject, handleDeleteProject } = loc;
  const [q, setQ] = useState("");
  const [dlg, setDlg] = useState(null); // {mode, values}
  const [del, setDel] = useState(null);
  const rows = useMemo(() => projects.filter((p) => (p.name || "").toLowerCase().includes(q.toLowerCase())), [projects, q]);

  const open = (p) => setDlg(p
    ? { mode: "edit", id: p.id, values: { name: p.name || "", description: p.description || "", sourceLanguage: p.sourceLanguage || "English", status: p.status || "Active" } }
    : { mode: "create", values: { name: "", description: "", sourceLanguage: "English", status: "Active" } });
  const set = (k, v) => setDlg((d) => ({ ...d, values: { ...d.values, [k]: v } }));
  const save = async () => {
    const v = dlg.values;
    try {
      if (dlg.mode === "edit") await handleUpdateProject(dlg.id, v);
      else await handleCreateProject(v);
      toast({ message: `Project ${dlg.mode === "edit" ? "updated" : "created"}`, tone: "good" });
      setDlg(null);
    } catch (e) { toast({ message: e.message, tone: "crit" }); }
  };
  const remove = async () => {
    try { await handleDeleteProject(del.id); toast({ message: "Project deleted", tone: "info" }); }
    catch (e) { toast({ message: e.message, tone: "crit" }); }
  };

  return (
    <div className="mng">
      <Header title="Projects" subtitle="Group your localized websites and content." search={q} onSearch={setQ} onAdd={() => open(null)} addLabel="New project" />
      {rows.length ? (
        <table className="data-table">
          <thead><tr><th>Name</th><th>Description</th><th>Source</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="t-name">{p.name}</td>
                <td>{p.description || "—"}</td>
                <td>{p.sourceLanguage || "—"}</td>
                <td><StatusPill status={p.status} /></td>
                <td><RowActions onEdit={() => open(p)} onDelete={() => setDel(p)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <EmptyState icon={FolderKanban} title="No projects" message="Create a project to start localizing its websites." action={<Button variant="primary" onClick={() => open(null)}><Plus size={15} /> New project</Button>} />}

      {dlg ? (
        <Dialog open onOpenChange={() => setDlg(null)} title={dlg.mode === "edit" ? "Edit project" : "New project"}
          footer={<><Button variant="ghost" onClick={() => setDlg(null)}>Cancel</Button><Button variant="primary" onClick={save} disabled={!dlg.values.name.trim()}>Save</Button></>}>
          <div className="form-grid">
            <Field label="Name" ><Input value={dlg.values.name} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
            <Field label="Source language"><Input value={dlg.values.sourceLanguage} onChange={(e) => set("sourceLanguage", e.target.value)} /></Field>
            <div className="full"><Field label="Description"><Textarea rows={2} value={dlg.values.description} onChange={(e) => set("description", e.target.value)} /></Field></div>
            <Field label="Status"><select className="input" value={dlg.values.status} onChange={(e) => set("status", e.target.value)}><option>Active</option><option>Inactive</option></select></Field>
          </div>
        </Dialog>
      ) : null}
      <ConfirmDialog open={Boolean(del)} onOpenChange={() => setDel(null)} title="Delete project?" description={`"${del?.name}" will be removed. This cannot be undone.`} confirmLabel="Delete project" onConfirm={remove} />
    </div>
  );
}

/* -------------------- Sites -------------------- */
function SitesView({ loc, toast }) {
  const { sites, projects, handleCreateSite, handleUpdateSite, handleDeleteSite } = loc;
  const [q, setQ] = useState("");
  const [dlg, setDlg] = useState(null);
  const [del, setDel] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const projName = (id) => (projects.find((p) => String(p.id) === String(id)) || {}).name || "—";
  const rows = useMemo(() => sites.filter((s) => `${s.name || ""} ${s.domain || ""}`.toLowerCase().includes(q.toLowerCase())), [sites, q]);

  const open = (s) => setDlg(s
    ? { mode: "edit", id: s.id, values: { name: s.name || "", url: s.domain || "", projectId: s.projectId || "", status: s.status || "Active" } }
    : { mode: "create", values: { name: "", url: "", projectId: projects[0]?.id || "", status: "Active" } });
  const set = (k, v) => setDlg((d) => ({ ...d, values: { ...d.values, [k]: v } }));
  const save = async () => {
    const v = dlg.values;
    try {
      if (dlg.mode === "edit") await handleUpdateSite(dlg.id, { name: v.name, domain: extractDomain(v.url), status: v.status });
      else await handleCreateSite({ projectId: v.projectId, domain: extractDomain(v.url), name: v.name, status: v.status });
      toast({ message: `Site ${dlg.mode === "edit" ? "updated" : "registered"}`, tone: "good" });
      setDlg(null);
    } catch (e) { toast({ message: e.message, tone: "crit" }); }
  };
  const remove = async () => {
    try { await handleDeleteSite(del.id); toast({ message: "Site deleted", tone: "info" }); }
    catch (e) { toast({ message: e.message, tone: "crit" }); }
  };

  return (
    <div className="mng">
      <Header title="Projects" subtitle="Websites connected to the localization SDK." search={q} onSearch={setQ}>
        <Button variant="ghost" onClick={() => setExpanded((e) => !e)}>{expanded ? "Hide projects" : "Show projects"}</Button>
      </Header>
      {expanded ? (
        rows.length ? (
          <table className="data-table">
            <thead><tr><th>Website / Domain</th><th>Project</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="mono t-name">{s.domain}</td>
                  <td>{projName(s.projectId)}</td>
                  <td><StatusPill status={s.status} /></td>
                  <td><RowActions onEdit={() => open(s)} onDelete={() => setDel(s)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState icon={Globe} title="No projects found" message="Register a website above to get started." />
      ) : null}

      {dlg ? (
        <Dialog open onOpenChange={() => setDlg(null)} title={dlg.mode === "edit" ? "Edit site" : "Register site"}
          footer={<><Button variant="ghost" onClick={() => setDlg(null)}>Cancel</Button><Button variant="primary" onClick={save} disabled={!dlg.values.url.trim()}>Save</Button></>}>
          <div className="form-grid">
            <Field label="Name"><Input value={dlg.values.name} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
            <Field label="Domain or URL"><Input value={dlg.values.url} onChange={(e) => set("url", e.target.value)} placeholder="example.com" /></Field>
            <Field label="Project"><select className="input" value={dlg.values.projectId} onChange={(e) => set("projectId", e.target.value)} disabled={dlg.mode === "edit"}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Status"><select className="input" value={dlg.values.status} onChange={(e) => set("status", e.target.value)}><option>Active</option><option>Inactive</option></select></Field>
          </div>
        </Dialog>
      ) : null}
      <ConfirmDialog open={Boolean(del)} onOpenChange={() => setDel(null)} title="Delete site?" description={`"${del?.name || del?.domain}" will be removed. This cannot be undone.`} confirmLabel="Delete site" onConfirm={remove} />
    </div>
  );
}

/* -------------------- Languages -------------------- */
function LanguagesView({ loc, toast }) {
  const { languages, handleCreateLanguage, handleUpdateLanguage, handleDeleteLanguage } = loc;
  const [q, setQ] = useState("");
  const [dlg, setDlg] = useState(null);
  const [del, setDel] = useState(null);
  const rows = useMemo(() => languages.filter((l) => `${l.name || ""} ${l.code || ""}`.toLowerCase().includes(q.toLowerCase())), [languages, q]);

  const open = (l) => setDlg(l
    ? { mode: "edit", id: l.id, values: { name: l.name || "", code: l.code || "", direction: l.direction || "ltr", enabled: l.enabled !== false } }
    : { mode: "create", values: { name: "", code: "", direction: "ltr", enabled: true } });
  const set = (k, v) => setDlg((d) => ({ ...d, values: { ...d.values, [k]: v } }));
  const save = async () => {
    const v = dlg.values;
    try {
      if (dlg.mode === "edit") await handleUpdateLanguage(dlg.id, v);
      else await handleCreateLanguage(v);
      toast({ message: `Language ${dlg.mode === "edit" ? "updated" : "added"}`, tone: "good" });
      setDlg(null);
    } catch (e) { toast({ message: e.message, tone: "crit" }); }
  };
  const toggle = async (l) => {
    try { await handleUpdateLanguage(l.id, { name: l.name, code: l.code, direction: l.direction, enabled: !(l.enabled !== false) }); }
    catch (e) { toast({ message: e.message, tone: "crit" }); }
  };
  const remove = async () => {
    try { await handleDeleteLanguage(del.id); toast({ message: "Language removed", tone: "info" }); }
    catch (e) { toast({ message: e.message, tone: "crit" }); }
  };

  return (
    <div className="mng">
      <Header title="Languages" subtitle="Target languages available to the SDK and reviewers." search={q} onSearch={setQ} onAdd={() => open(null)} addLabel="Add language" />
      {rows.length ? (
        <table className="data-table">
          <thead><tr><th>Language</th><th>Code</th><th>Direction</th><th>Enabled</th><th></th></tr></thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="t-name">{l.name}</td>
                <td className="mono">{l.code}</td>
                <td style={{ textTransform: "uppercase" }}>{l.direction || "ltr"}</td>
                <td>
                  <button className="switch" onClick={() => toggle(l)} aria-label={`${l.enabled !== false ? "Disable" : "Enable"} ${l.name}`} aria-pressed={l.enabled !== false}>
                    <span className={`track ${l.enabled !== false ? "on" : ""}`}><span className="knob" /></span>
                  </button>
                </td>
                <td><RowActions onEdit={() => open(l)} onDelete={() => setDel(l)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <EmptyState icon={LangIcon} title="No languages" message="Add a target language to translate into." action={<Button variant="primary" onClick={() => open(null)}><Plus size={15} /> Add language</Button>} />}

      {dlg ? (
        <Dialog open onOpenChange={() => setDlg(null)} title={dlg.mode === "edit" ? "Edit language" : "Add language"}
          footer={<><Button variant="ghost" onClick={() => setDlg(null)}>Cancel</Button><Button variant="primary" onClick={save} disabled={!dlg.values.name.trim() || !dlg.values.code.trim()}>Save</Button></>}>
          <div className="form-grid">
            <Field label="Name"><Input value={dlg.values.name} onChange={(e) => set("name", e.target.value)} placeholder="Hindi" autoFocus /></Field>
            <Field label="Code"><Input value={dlg.values.code} onChange={(e) => set("code", e.target.value)} placeholder="hi" /></Field>
            <Field label="Direction"><select className="input" value={dlg.values.direction} onChange={(e) => set("direction", e.target.value)}><option value="ltr">Left to right</option><option value="rtl">Right to left</option></select></Field>
            <Field label="Enabled">
              <button type="button" className="switch" onClick={() => set("enabled", !dlg.values.enabled)} aria-pressed={dlg.values.enabled} style={{ height: 36 }}>
                <span className={`track ${dlg.values.enabled ? "on" : ""}`}><span className="knob" /></span>
                <span style={{ fontSize: "var(--fs-13)", color: "var(--ink-2)" }}>{dlg.values.enabled ? "Enabled" : "Disabled"}</span>
              </button>
            </Field>
          </div>
        </Dialog>
      ) : null}
      <ConfirmDialog open={Boolean(del)} onOpenChange={() => setDel(null)} title="Remove language?" description={`"${del?.name}" will be removed. This cannot be undone.`} confirmLabel="Remove language" onConfirm={remove} />
    </div>
  );
}

export function ManageScreen({ nav, loc }) {
  const { toast } = useToast();
  if (nav === "projects") return <ProjectsView loc={loc} toast={toast} />;
  if (nav === "sites") return <SitesView loc={loc} toast={toast} />;
  if (nav === "languages") return <LanguagesView loc={loc} toast={toast} />;
  return (
    <div className="mng">
      <EmptyState icon={Clock} title="Activity" message="Per-item activity is on each segment's detail drawer in Translate & Review. A consolidated feed lands in a later pass." />
    </div>
  );
}

export default ManageScreen;
