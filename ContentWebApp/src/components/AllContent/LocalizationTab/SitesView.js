import React, { useState } from "react";
import Modal from "../shared/Modal";
import Select from "../shared/Select";
import { extractDomain } from "../../../utils/url";
import { useCrudView } from "../../../hooks/useCrudView";
import { onboardingService } from "../../../services/onboardingService";
import { ManageTable } from "./ManageTable";
import { SnippetBlock } from "./SnippetBlock";
import SectionHeader from "../shared/SectionHeader";
import ConfirmModal from "../shared/ConfirmModal";
import ModalActions from "../shared/ModalActions";
import StatusPill from "../shared/StatusPill";

export function SitesView({ loc, toast }) {
  const { sites, handleCreateSite, handleUpdateSite, handleDeleteSite } = loc;

  const [snippetSite, setSnippetSite] = useState(null);

  const viewSnippet = async (site) => {
    try {
      setSnippetSite(await onboardingService.getSite(site.id));
    } catch (e) {
      toast({ message: e.message, tone: "crit" });
    }
  };

  const { q, setQ, rows, dlg, setDlg, open, set, save, del, setDel, remove } = useCrudView({
    items: sites,
    matchFn: (site, query) => {
      const haystack = `${site.name} ${site.domain}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    },
    getId: (site) => site.id,
    emptyValues: { name: "", url: "", status: "Active" },
    onCreate: (values) =>
      handleCreateSite({
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
    { key: "status", header: "Status", render: (site) => <StatusPill status={site.status} /> },
  ];

  return (
    <div className="card">
      <SectionHeader
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
        extraActions={[{ key: "snippet", label: "View Snippet", variant: "view", onClick: viewSnippet }]}
        emptyTitle="No sites found"
        emptyMessage="Register a website above to get started."
      />
      {snippetSite && (
        <Modal title={`SDK snippet — ${snippetSite.domain}`} onClose={() => setSnippetSite(null)} maxWidth={640}>
          <SnippetBlock snippet={snippetSite.snippet} />
        </Modal>
      )}
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
