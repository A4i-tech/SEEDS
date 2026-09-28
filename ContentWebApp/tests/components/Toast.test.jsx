import { act, render, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "../../src/components/AllContent/LocalizationTab/Toast";

function Fire({ toasts }) {
  const { toast } = useToast();
  return <button onClick={() => toasts.forEach((t) => toast(t))}>fire</button>;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("a crit toast is never dropped by a toast fired right after it — both are shown in order", () => {
  render(
    <ToastProvider>
      <Fire toasts={[{ message: "boom", tone: "crit" }, { message: "copied", tone: "info" }]} />
    </ToastProvider>
  );
  act(() => screen.getByText("fire").click());
  expect(screen.getByRole("status")).toHaveTextContent("boom");
  expect(screen.queryByText("copied")).not.toBeInTheDocument();

  act(() => jest.advanceTimersByTime(5000));
  expect(screen.getByRole("status")).toHaveTextContent("copied");

  act(() => jest.advanceTimersByTime(5000));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("undo callback runs and dismisses the toast", () => {
  const onUndo = jest.fn();
  render(
    <ToastProvider>
      <Fire toasts={[{ message: "Approved", tone: "good", onUndo }]} />
    </ToastProvider>
  );
  act(() => screen.getByText("fire").click());
  act(() => screen.getByRole("button", { name: "Undo" }).click());
  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("useToast throws outside a ToastProvider", () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<Fire toasts={[]} />)).toThrow("useToast must be used within <ToastProvider>");
  console.error.mockRestore();
});
