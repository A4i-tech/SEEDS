import { act, renderHook, waitFor } from "@testing-library/react";
import { useRemediationJobs } from "../../src/hooks/useRemediationJobs";
import { textbookRemediationService } from "../../src/services/textbookRemediationService";

jest.mock("../../src/services/textbookRemediationService", () => ({
  textbookRemediationService: {
    getJobs: jest.fn(),
    getJob: jest.fn(),
    createJob: jest.fn(),
    streamJob: jest.fn(),
  },
}));

/**
 * The hook's job is to keep the list live while the consumer works. Everything
 * worth testing is about which jobs it attaches a stream to and what it does
 * with the events: a finished job must not be followed, an event must replace
 * the row rather than append a duplicate, and unmounting must abort.
 */

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
    jobs: [job(), job({ job_id: "job-2", status: "completed" })],
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
  textbookRemediationService.getJobs.mockResolvedValue({ jobs: [job({ job_id: "old", status: "completed" })] });
  textbookRemediationService.createJob.mockResolvedValue({ job_id: "job-new" });
  textbookRemediationService.getJob.mockResolvedValue(job({ job_id: "job-new", status: "pending" }));

  const { result } = renderHook(() => useRemediationJobs());
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  await act(async () => {
    await result.current.upload(new File(["%PDF-"], "new.pdf"), "ta");
  });

  expect(textbookRemediationService.createJob).toHaveBeenCalledWith(expect.any(File), "ta");
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
