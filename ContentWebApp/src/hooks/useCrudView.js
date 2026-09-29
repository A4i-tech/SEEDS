import { useMemo, useState } from "react";

export function useCrudView({
  items,
  matchFn,
  getId,
  emptyValues,
  onCreate,
  onUpdate,
  onDelete,
  toast,
  entityLabel,
}) {
  const [q, setQ] = useState("");
  const [dlg, setDlg] = useState(null);
  const [del, setDel] = useState(null);

  const rows = useMemo(() => items.filter((item) => matchFn(item, q)), [items, q, matchFn]);

  const open = (item) =>
    setDlg(
      item
        ? { mode: "edit", id: getId(item), values: { ...emptyValues, ...item } }
        : { mode: "create", values: { ...emptyValues } }
    );

  const set = (key, value) => setDlg((d) => ({ ...d, values: { ...d.values, [key]: value } }));

  const save = async () => {
    const values = dlg.values;
    try {
      if (dlg.mode === "edit") await onUpdate(dlg.id, values);
      else await onCreate(values);
      toast({
        message: `${entityLabel} ${dlg.mode === "edit" ? "updated" : "created"}`,
        tone: "good",
      });
      setDlg(null);
    } catch (e) {
      toast({ message: e.message, tone: "crit" });
    }
  };

  const remove = async () => {
    try {
      await onDelete(getId(del));
      toast({ message: `${entityLabel} deleted`, tone: "info" });
    } catch (e) {
      toast({ message: e.message, tone: "crit" });
    }
    setDel(null);
  };

  return { q, setQ, rows, dlg, setDlg, open, set, save, del, setDel, remove };
}

export default useCrudView;
