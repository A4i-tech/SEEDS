import { act, renderHook, waitFor } from "@testing-library/react";
import { useRemediationJobs } from "../../src/hooks/useRemediationJobs";
import { textbookRemediationService } from "../../src/services/textbookRemediationService";

jest.mock("../../src/services/textbookRemediationService", () => ({
  textbookRemediationService: {
    getJobs: jest.fn(),
    getJob: jest.fn(),
    createJob: jest.fn(),
    createBook: jest.fn(),
    reorderBook: jest.fn(),
    deleteBook: jest.fn(),
    deleteJob: jest.fn(),
    streamJob: jest.fn(),
  },
}));

const job = (overrides = {}) => ({
  job_id: "job-1",
  source_name: "book.pdf",
  language: "kn",
  status: "running",
  stage: "ocr",
  stage_index: 1,
  stage_count: 3,
  artifacts: {},
  counts: {},
  error: null,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  textbookRemediationService.streamJob.mockReturnValue(new Promise(() => {}));
});

test("follows a running job and leaves a finished one alone", async () => {
  textbookRemediationService.getJobs.mockResolvedValue({
    jobs: [job(), job({ job_id: "job-2", status: "ready_to_review" })],
  });

  const { result } = renderHook(() => useRemediationJobs());

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(textbookRemediationService.streamJob).toHaveBeenCalledTimes(1);
  expect(textbookRemediationService.streamJob.mock.calls[0][0]).toBe("job-1");
});

test("follows a pending job, which has not reached a stage yet", async () => {
  textbookRemediationService.getJobs.mockResolvedValue({
    jobs: [job({ status: "pending", stage: null, stage_index: 0 })],
  });

  const { result } = renderHook(() => useRemediationJobs());

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(textbookRemediationService.streamJob).toHaveBeenCalledTimes(1);
});

test("a stream event replaces the row instead of appending a duplicate", async () => {
  textbookRemediationService.getJobs.mockResolvedValue({ jobs: [job()] });
  let emit;
  textbookRemediationService.streamJob.mockImplementation((jobId, onEvent) => {
    emit = onEvent;
    return new Promise(() => {});
  });

  const { result } = renderHook(() => useRemediationJobs());
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  act(() => emit({ event: "progress", job: job({ stage: "review", stage_index: 2 }) }));

  expect(result.current.jobs).toHaveLength(1);
  expect(result.current.jobs[0].stage).toBe("review");
});

test("uploading adds the new job to the top of the list and follows it", async () => {
  textbookRemediationService.getJobs.mockResolvedValue({ jobs: [job({ job_id: "old", status: "ready_to_review" })] });
  textbookRemediationService.createJob.mockResolvedValue({ job_id: "job-new" });
  textbookRemediationService.getJob.mockResolvedValue(job({ job_id: "job-new", status: "pending" }));

  const { result } = renderHook(() => useRemediationJobs());
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  await act(async () => {
    await result.current.upload(new File(["%PDF-"], "new.pdf"), "ta");
  });

  expect(textbookRemediationService.createJob).toHaveBeenCalledWith(expect.any(File), "ta", undefined);
  expect(result.current.jobs[0].job_id).toBe("job-new");
  expect(textbookRemediationService.streamJob).toHaveBeenCalledWith("job-new", expect.any(Function), expect.anything());
});

test("surfaces a failed upload rather than silently doing nothing", async () => {
  textbookRemediationService.getJobs.mockResolvedValue({ jobs: [] });
  textbookRemediationService.createJob.mockRejectedValue(new Error("PDF is larger than 200 MB"));

  const { result } = renderHook(() => useRemediationJobs());
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  await act(async () => {
    await result.current.upload(new File(["x"], "big.pdf"), "en");
  });

  expect(result.current.error).toBe("PDF is larger than 200 MB");
  expect(result.current.isUploading).toBe(false);
});

test("surfaces a failed listing", async () => {
  textbookRemediationService.getJobs.mockRejectedValue(new Error("network down"));

  const { result } = renderHook(() => useRemediationJobs());

  await waitFor(() => expect(result.current.error).toBe("network down"));
});

test("aborts every stream on unmount", async () => {
  textbookRemediationService.getJobs.mockResolvedValue({ jobs: [job()] });
  let signal;
  textbookRemediationService.streamJob.mockImplementation((jobId, onEvent, options) => {
    signal = options.signal;
    return new Promise(() => {});
  });

  const { result, unmount } = renderHook(() => useRemediationJobs());
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  expect(signal.aborted).toBe(false);
  unmount();
  expect(signal.aborted).toBe(true);
});

const book = (overrides = {}) => ({
  book_id: "book-1",
  title: "Science",
  language: "auto",
  job_ids: ["c1", "c2"],
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

test("keeps the books from the listing", async () => {
  textbookRemediationService.getJobs.mockResolvedValue({ jobs: [], books: [book()] });

  const { result } = renderHook(() => useRemediationJobs());

  await waitFor(() => expect(result.current.books).toHaveLength(1));
});

test("uploading a book creates it, then reloads jobs and books", async () => {
  textbookRemediationService.getJobs
    .mockResolvedValueOnce({ jobs: [], books: [] })
    .mockResolvedValueOnce({
      jobs: [job({ job_id: "c1", status: "pending", book_id: "book-1" })],
      books: [book({ job_ids: ["c1"] })],
    });
  textbookRemediationService.createBook.mockResolvedValue({ book_id: "book-1", job_ids: ["c1"] });

  const { result } = renderHook(() => useRemediationJobs());
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  const files = [new File(["x"], "c1.pdf")];
  await act(async () => {
    await result.current.uploadBook(files, { title: "Science", language: "auto", targetLanguage: "" });
  });

  expect(textbookRemediationService.createBook).toHaveBeenCalledWith(files, {
    title: "Science",
    language: "auto",
    targetLanguage: "",
  });
  expect(result.current.books).toHaveLength(1);
  expect(textbookRemediationService.streamJob).toHaveBeenCalledWith("c1", expect.any(Function), expect.anything());
});

test("reordering a book replaces it with the saved order", async () => {
  textbookRemediationService.getJobs.mockResolvedValue({ jobs: [], books: [book()] });
  textbookRemediationService.reorderBook.mockResolvedValue(book({ job_ids: ["c2", "c1"] }));

  const { result } = renderHook(() => useRemediationJobs());
  await waitFor(() => expect(result.current.books).toHaveLength(1));

  await act(async () => {
    await result.current.reorderBook("book-1", ["c2", "c1"]);
  });

  expect(textbookRemediationService.reorderBook).toHaveBeenCalledWith("book-1", ["c2", "c1"]);
  expect(result.current.books[0].job_ids).toEqual(["c2", "c1"]);
});

test("removing a book drops it and its chapters", async () => {
  textbookRemediationService.getJobs.mockResolvedValue({
    jobs: [
      job({ job_id: "c1", status: "verified", book_id: "book-1" }),
      job({ job_id: "c2", status: "verified", book_id: "book-1" }),
      job({ job_id: "solo", status: "verified", book_id: null }),
    ],
    books: [book()],
  });
  textbookRemediationService.deleteBook.mockResolvedValue("");

  const { result } = renderHook(() => useRemediationJobs());
  await waitFor(() => expect(result.current.books).toHaveLength(1));

  await act(async () => {
    await result.current.removeBook("book-1");
  });

  expect(result.current.books).toHaveLength(0);
  expect(result.current.jobs.map((j) => j.job_id)).toEqual(["solo"]);
});

test("removing a chapter takes it out of its book order", async () => {
  textbookRemediationService.getJobs.mockResolvedValue({
    jobs: [job({ job_id: "c1", status: "verified", book_id: "book-1" })],
    books: [book()],
  });
  textbookRemediationService.deleteJob.mockResolvedValue("");

  const { result } = renderHook(() => useRemediationJobs());
  await waitFor(() => expect(result.current.books).toHaveLength(1));

  await act(async () => {
    await result.current.remove("c1");
  });

  expect(result.current.books[0].job_ids).toEqual(["c2"]);
});
