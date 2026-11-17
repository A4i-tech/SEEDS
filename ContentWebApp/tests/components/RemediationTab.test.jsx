import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import RemediationTab from "../../src/components/AllContent/RemediationTab/RemediationTab";

let mockHook;
jest.mock("../../src/components/AllContent/shared/MiddleEllipsis", () => ({ text }) => <span>{text}</span>);
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }));
jest.mock("../../src/hooks/useRemediationJobs", () => ({
  useRemediationJobs: () => mockHook,
}));
jest.mock("../../src/services/textbookRemediationService", () => ({
  textbookRemediationService: {
    getLanguages: jest.fn().mockResolvedValue({ languages: [] }),
    downloadBookArtifact: jest.fn().mockResolvedValue(undefined),
  },
}));

const MB = 1024 * 1024;

const makeFile = (name, bytes) => {
  const file = new File(["x"], name, { type: "application/pdf" });
  Object.defineProperty(file, "size", { value: bytes });
  return file;
};

// eslint-disable-next-line testing-library/no-node-access
const pickFiles = (container, files) => fireEvent.change(container.querySelector("input[type=file]"), { target: { files } });

const pickFile = (container, name, bytes) => pickFiles(container, [makeFile(name, bytes)]);

const job = (id, overrides = {}) => ({
  job_id: id,
  source_name: `${id}.pdf`,
  language: "ta",
  detected_language: null,
  status: "verified",
  stage: "docx",
  stage_index: 3,
  stage_count: 3,
  artifacts: {},
  progress: {},
  book_id: "book-1",
  ...overrides,
});

beforeEach(() => {
  mockHook = {
    jobs: [],
    books: [],
    isLoading: false,
    isUploading: false,
    error: null,
    upload: jest.fn(),
    uploadBook: jest.fn(),
    remove: jest.fn(),
    removeBook: jest.fn(),
    reorderBook: jest.fn(),
  };
});

test("a PDF over 10 MB is refused with the size, the limit and the next step", async () => {
  const { container } = render(<RemediationTab />);
  pickFile(container, "big.pdf", 12 * MB);
  expect(await screen.findByText(/big\.pdf is 12\.0 MB\. The limit is 10 MB\. Split the book/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Upload textbook" })).toBeDisabled();
});

test("a PDF at or under 10 MB is accepted and clears an earlier size error", async () => {
  const { container } = render(<RemediationTab />);
  pickFile(container, "big.pdf", 12 * MB);
  pickFile(container, "ok.pdf", 10 * MB);
  expect(await screen.findByText("ok.pdf")).toBeInTheDocument();
  expect(screen.queryByText(/The limit is 10 MB/)).toBeNull();
  expect(screen.getByRole("button", { name: "Upload textbook" })).toBeEnabled();
});

test("choosing three PDFs opens the organiser and uploads them as one book in list order", async () => {
  const { container } = render(<RemediationTab />);
  pickFiles(container, [
    makeFile("Science_Unit_10_Matter.pdf", MB),
    makeFile("Science_Unit_02_Motion.pdf", MB),
    makeFile("Science_Unit_01_Units.pdf", MB),
  ]);
  const button = await screen.findByRole("button", { name: "Upload 3 PDFs as one book" });
  expect(button).toBeEnabled();
  expect(screen.getByLabelText("Book name")).toHaveValue("Science");
  const rows = screen.getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("Science_Unit_01_Units.pdf");

  fireEvent.click(screen.getByRole("button", { name: /Move Science_Unit_01_Units\.pdf down/ }));
  fireEvent.change(screen.getByLabelText("Book name"), { target: { value: "Science G9" } });
  fireEvent.click(screen.getByRole("button", { name: "Upload 3 PDFs as one book" }));

  await waitFor(() => expect(mockHook.uploadBook).toHaveBeenCalledTimes(1));
  const [files, options] = mockHook.uploadBook.mock.calls[0];
  expect(files.map((file) => file.name)).toEqual([
    "Science_Unit_02_Motion.pdf",
    "Science_Unit_01_Units.pdf",
    "Science_Unit_10_Matter.pdf",
  ]);
  expect(options).toEqual({ title: "Science G9", language: "auto", targetLanguage: "" });
});

test("a failed book upload keeps the files so the user can retry", async () => {
  mockHook.uploadBook.mockResolvedValue(false);
  const { container } = render(<RemediationTab />);
  pickFiles(container, [makeFile("a.pdf", MB), makeFile("b.pdf", MB)]);
  fireEvent.click(await screen.findByRole("button", { name: "Upload 2 PDFs as one book" }));

  await waitFor(() => expect(mockHook.uploadBook).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "Upload 2 PDFs as one book" })).toBeEnabled();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
});

test("a successful book upload clears the files", async () => {
  mockHook.uploadBook.mockResolvedValue(true);
  const { container } = render(<RemediationTab />);
  pickFiles(container, [makeFile("a.pdf", MB), makeFile("b.pdf", MB)]);
  fireEvent.click(await screen.findByRole("button", { name: "Upload 2 PDFs as one book" }));

  expect(await screen.findByRole("button", { name: "Upload textbook" })).toBeDisabled();
  expect(screen.queryByRole("listitem")).toBeNull();
});

test("removing files down to one moves focus to the Choose PDF files button", async () => {
  const { container } = render(<RemediationTab />);
  pickFiles(container, [makeFile("a.pdf", MB), makeFile("b.pdf", MB)]);
  fireEvent.click(await screen.findByRole("button", { name: "Remove a.pdf" }));

  expect(screen.queryByRole("button", { name: "Remove b.pdf" })).toBeNull();
  expect(screen.getByRole("button", { name: "Choose PDF files" })).toHaveFocus();
});

test("an over-limit file in a book blocks the upload until it is removed", async () => {
  const { container } = render(<RemediationTab />);
  pickFiles(container, [makeFile("a.pdf", MB), makeFile("b.pdf", 12 * MB), makeFile("c.pdf", MB)]);
  expect(await screen.findByText(/Over the 10 MB limit/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Upload 3 PDFs as one book" })).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Remove b.pdf" }));
  expect(screen.getByRole("button", { name: "Upload 2 PDFs as one book" })).toBeEnabled();
});

test("a book with an unverified chapter has disabled downloads and says why", () => {
  mockHook.books = [{ book_id: "book-1", title: "Science G9", language: "ta", job_ids: ["c1", "c2"], created_at: "2026-01-01T00:00:00Z" }];
  mockHook.jobs = [job("c1"), job("c2", { status: "in_review" })];
  render(<RemediationTab />);

  expect(screen.getByText("1 of 2 verified")).toBeInTheDocument();
  const parent = screen.getByRole("row", { name: /Science G9/ });
  ["Word", "PDF", "LaTeX"].forEach((label) => {
    const link = within(parent).getByRole("button", { name: label });
    expect(link).toBeDisabled();
    expect(link).toHaveAccessibleDescription("Available when all 2 chapters are verified");
  });
});

test("a fully verified book downloads the chosen format", () => {
  mockHook.books = [{ book_id: "book-1", title: "Science G9", language: "ta", job_ids: ["c1", "c2"], created_at: "2026-01-01T00:00:00Z" }];
  mockHook.jobs = [job("c1"), job("c2")];
  render(<RemediationTab />);

  const parent = screen.getByRole("row", { name: /Science G9/ });
  fireEvent.click(within(parent).getByRole("button", { name: "PDF" }));
  const { textbookRemediationService } = require("../../src/services/textbookRemediationService");
  expect(textbookRemediationService.downloadBookArtifact).toHaveBeenCalledWith("book-1", "pdf", "Science G9.pdf");
});

test("chapters show in book order under their book and singles keep their own rows", () => {
  mockHook.books = [{ book_id: "book-1", title: "Science G9", language: "ta", job_ids: ["c2", "c1"], created_at: "2026-01-01T00:00:00Z" }];
  mockHook.jobs = [job("single", { book_id: null }), job("c1"), job("c2")];
  render(<RemediationTab />);

  const rows = screen.getAllByRole("row").slice(1);
  expect(rows.map((row) => row.textContent)).toEqual([
    expect.stringContaining("Science G9"),
    expect.stringContaining("c2.pdf"),
    expect.stringContaining("c1.pdf"),
    expect.stringContaining("single.pdf"),
  ]);

  const chevron = screen.getByRole("button", { name: "Chapters of Science G9" });
  expect(chevron).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(chevron);
  expect(screen.queryByText("c1.pdf")).toBeNull();
  expect(screen.getByRole("button", { name: "Chapters of Science G9" })).toHaveAttribute("aria-expanded", "false");
});

test("Reorder saves the new chapter order", async () => {
  mockHook.books = [{ book_id: "book-1", title: "Science G9", language: "ta", job_ids: ["c1", "c2"], created_at: "2026-01-01T00:00:00Z" }];
  mockHook.jobs = [job("c1"), job("c2")];
  render(<RemediationTab />);

  fireEvent.click(screen.getByRole("button", { name: "Reorder" }));
  fireEvent.click(screen.getByRole("button", { name: /Move c1\.pdf down/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save order" }));

  await waitFor(() => expect(mockHook.reorderBook).toHaveBeenCalledWith("book-1", ["c2", "c1"]));
});

test("a failed reorder keeps the panel open with the edited order", async () => {
  mockHook.reorderBook.mockResolvedValue(false);
  mockHook.books = [{ book_id: "book-1", title: "Science G9", language: "ta", job_ids: ["c1", "c2"], created_at: "2026-01-01T00:00:00Z" }];
  mockHook.jobs = [job("c1"), job("c2")];
  render(<RemediationTab />);

  fireEvent.click(screen.getByRole("button", { name: "Reorder" }));
  fireEvent.click(screen.getByRole("button", { name: /Move c1\.pdf down/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save order" }));

  await waitFor(() => expect(mockHook.reorderBook).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "Save order" })).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("c2.pdf");
});

test("a successful reorder closes the panel", async () => {
  mockHook.reorderBook.mockResolvedValue(true);
  mockHook.books = [{ book_id: "book-1", title: "Science G9", language: "ta", job_ids: ["c1", "c2"], created_at: "2026-01-01T00:00:00Z" }];
  mockHook.jobs = [job("c1"), job("c2")];
  render(<RemediationTab />);

  fireEvent.click(screen.getByRole("button", { name: "Reorder" }));
  fireEvent.click(screen.getByRole("button", { name: "Save order" }));

  await waitFor(() => expect(screen.queryByRole("button", { name: "Save order" })).toBeNull());
});
