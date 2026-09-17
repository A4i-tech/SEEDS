import React from "react";
import Modal from "../../../components/AllContent/shared/Modal";
import Select from "../../../components/AllContent/shared/Select";
import { useCrudView } from "../../lib/useCrudView";
import { ManageTable } from "../ManageTable";
import { Header, ConfirmModal, ModalActions } from "./shared";

export function LanguagesView({ loc, toast }) {
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
    { key: "name", header: "Language", className: "teacher-name", render: (language) => language.name },
    { key: "code", header: "Code", render: (language) => <code>{language.code}</code> },
    {
      key: "direction",
      header: "Direction",
      render: (language) => language.direction.toUpperCase(),
    },
    {
      key: "enabled",
      header: "Enabled",
      render: (language) => (
        <button type="button" className="action-ghost-button" onClick={() => toggle(language)}>
          {language.enabled !== false ? "Disable" : "Enable"}
        </button>
      ),
    },
  ];

  return (
    <div className="card">
      <Header
        title="Languages"
        subtitle="Target languages available to the SDK and reviewers."
        search={q}
        onSearch={setQ}
        addLabel="Add language"
        onAdd={() => open(null)}
      />
      <ManageTable
        columns={columns}
        rows={rows}
        getId={(language) => language.id}
        onEdit={open}
        onDelete={setDel}
        emptyTitle="No languages"
        emptyMessage="Add a target language to translate into."
      />
      {dlg && (
        <Modal
          title={dlg.mode === "edit" ? "Edit language" : "Add language"}
          onClose={() => setDlg(null)}
        >
          <label className="label" htmlFor="language-name">Name</label>
          <input
            id="language-name"
            className="input-field"
            value={dlg.values.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Hindi"
            autoFocus
          />
          <label className="label" htmlFor="language-code">Code</label>
          <input
            id="language-code"
            className="input-field"
            value={dlg.values.code}
            onChange={(e) => set("code", e.target.value)}
            placeholder="hi"
          />
          <label className="label">Direction</label>
          <Select
            value={dlg.values.direction}
            onChange={(v) => set("direction", v)}
            options={[
              { value: "ltr", label: "Left to right" },
              { value: "rtl", label: "Right to left" },
            ]}
          />
          <ModalActions
            onCancel={() => setDlg(null)}
            onSave={save}
            disabled={!dlg.values.name.trim() || !dlg.values.code.trim()}
          />
        </Modal>
      )}
      {del && (
        <ConfirmModal
          title="Remove language?"
          description={`"${del.name}" will be removed.`}
          confirmLabel="Remove language"
          onCancel={() => setDel(null)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}

export default LanguagesView;
