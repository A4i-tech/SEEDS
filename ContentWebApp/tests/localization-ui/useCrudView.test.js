// tests/localization-ui/useCrudView.test.js
import { renderHook, act } from "@testing-library/react";
import { useCrudView } from "../../src/localization-ui/lib/useCrudView";

const items = [
  { id: "1", name: "Alpha" },
  { id: "2", name: "Beta" },
];

function setup(overrides = {}) {
  const toast = jest.fn();
  const onCreate = jest.fn(async (v) => ({ id: "3", ...v }));
  const onUpdate = jest.fn(async (id, v) => ({ id, ...v }));
  const onDelete = jest.fn(async () => {});
  const hook = renderHook(() =>
    useCrudView({
      items,
      matchFn: (item, q) => item.name.toLowerCase().includes(q.toLowerCase()),
      getId: (item) => item.id,
      emptyValues: { name: "" },
      onCreate,
      onUpdate,
      onDelete,
      toast,
      entityLabel: "Item",
      ...overrides,
    })
  );
  return { hook, toast, onCreate, onUpdate, onDelete };
}

test("filters rows by matchFn against q", () => {
  const { hook } = setup();
  act(() => hook.result.current.setQ("bet"));
  expect(hook.result.current.rows).toEqual([{ id: "2", name: "Beta" }]);
});

test("open(null) starts create mode with emptyValues", () => {
  const { hook } = setup();
  act(() => hook.result.current.open(null));
  expect(hook.result.current.dlg).toEqual({ mode: "create", values: { name: "" } });
});

test("open(item) starts edit mode with item merged into values", () => {
  const { hook } = setup();
  act(() => hook.result.current.open(items[0]));
  expect(hook.result.current.dlg).toEqual({
    mode: "edit",
    id: "1",
    values: { name: "Alpha", id: "1" },
  });
});

test("save() in create mode calls onCreate and closes dialog", async () => {
  const { hook, onCreate, toast } = setup();
  act(() => hook.result.current.open(null));
  act(() => hook.result.current.set("name", "Gamma"));
  await act(async () => hook.result.current.save());
  expect(onCreate).toHaveBeenCalledWith({ name: "Gamma" });
  expect(hook.result.current.dlg).toBeNull();
  expect(toast).toHaveBeenCalledWith({ message: "Item created", tone: "good" });
});

test("save() in edit mode calls onUpdate with id", async () => {
  const { hook, onUpdate } = setup();
  act(() => hook.result.current.open(items[1]));
  act(() => hook.result.current.set("name", "Beta 2"));
  await act(async () => hook.result.current.save());
  expect(onUpdate).toHaveBeenCalledWith("2", { name: "Beta 2", id: "2" });
});

test("save() error toasts crit and keeps dialog open", async () => {
  const onCreate = jest.fn(async () => { throw new Error("boom"); });
  const { hook, toast } = setup({ onCreate });
  act(() => hook.result.current.open(null));
  await act(async () => hook.result.current.save());
  expect(toast).toHaveBeenCalledWith({ message: "boom", tone: "crit" });
  expect(hook.result.current.dlg).not.toBeNull();
});

test("remove() calls onDelete with id, toasts, clears del", async () => {
  const { hook, onDelete, toast } = setup();
  act(() => hook.result.current.setDel(items[0]));
  await act(async () => hook.result.current.remove());
  expect(onDelete).toHaveBeenCalledWith("1");
  expect(toast).toHaveBeenCalledWith({ message: "Item deleted", tone: "info" });
  expect(hook.result.current.del).toBeNull();
});
