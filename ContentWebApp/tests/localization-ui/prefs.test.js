import { renderHook, act } from "@testing-library/react";
import { usePersistentState } from "../../src/localization-ui/lib/prefs";

test("reads initial value when nothing stored", () => {
  const { result } = renderHook(() => usePersistentState("k1", { a: 1 }));
  expect(result.current[0]).toEqual({ a: 1 });
});

test("persists updates to localStorage under the locaui. namespace", () => {
  const { result } = renderHook(() => usePersistentState("k2", "x"));
  act(() => result.current[1]("y"));
  expect(JSON.parse(localStorage.getItem("locaui.k2"))).toBe("y");
});

test("propagates a localStorage write failure instead of swallowing it", () => {
  const { result } = renderHook(() => usePersistentState("k3", "x"));
  const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("QuotaExceededError");
  });
  expect(() => act(() => result.current[1]("y"))).toThrow("QuotaExceededError");
  spy.mockRestore();
});
