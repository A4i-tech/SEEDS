import { render, screen, fireEvent } from "@testing-library/react";
import { ToastProvider } from "../../src/components/AllContent/LocalizationTab/Toast";
import { SnippetBlock } from "../../src/components/AllContent/LocalizationTab/SnippetBlock";
import { DevToolsSection } from "../../src/components/AllContent/LocalizationTab/DevToolsSection";
import { SEEDS_URL } from "../../src/Constants";

const renderWithToast = (ui) => render(<ToastProvider>{ui}</ToastProvider>);
const setClipboard = (writeText) => Object.assign(navigator, { clipboard: { writeText } });

describe("SnippetBlock", () => {
  test("shows the snippet and copies it with a success toast", async () => {
    const writeText = jest.fn().mockResolvedValue();
    setClipboard(writeText);
    renderWithToast(<SnippetBlock snippet={'<script src="x"></script>'} />);
    expect(screen.getByText('<script src="x"></script>')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy Snippet" }));
    expect(await screen.findByText("Snippet copied")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('<script src="x"></script>');
  });

  test("a clipboard failure shows a Copy failed toast", async () => {
    setClipboard(jest.fn().mockRejectedValue(new Error("denied")));
    renderWithToast(<SnippetBlock snippet="abc" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy Snippet" }));
    expect(await screen.findByText("Copy failed")).toBeInTheDocument();
  });

  test("copies an empty string when there is no snippet", async () => {
    const writeText = jest.fn().mockResolvedValue();
    setClipboard(writeText);
    renderWithToast(<SnippetBlock />);
    fireEvent.click(screen.getByRole("button", { name: "Copy Snippet" }));
    await screen.findByText("Snippet copied");
    expect(writeText).toHaveBeenCalledWith("");
  });
});

describe("DevToolsSection", () => {
  test("builds an injection script for the given site and API base", () => {
    renderWithToast(<DevToolsSection siteId="abc-123" />);
    expect(screen.getByText("Developer Testing (Chrome DevTools)")).toBeInTheDocument();
    const code = document.querySelector("pre code").textContent;
    expect(code).toContain(`s.src = "${SEEDS_URL}/sdk.js";`);
    expect(code).toContain('s.dataset.siteId = "abc-123";');
    expect(code).toContain(`s.dataset.apiBase = "${SEEDS_URL}";`);
    expect(code).toContain("document.body.appendChild(s);");
  });

  test("its script can be copied through the shared snippet block", async () => {
    const writeText = jest.fn().mockResolvedValue();
    setClipboard(writeText);
    renderWithToast(<DevToolsSection siteId="site-9" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy Snippet" }));
    await screen.findByText("Snippet copied");
    expect(writeText.mock.calls[0][0]).toContain('s.dataset.siteId = "site-9";');
  });
});
