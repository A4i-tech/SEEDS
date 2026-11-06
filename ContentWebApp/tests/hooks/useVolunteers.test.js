import { act, renderHook, waitFor } from "@testing-library/react";
import { useVolunteers } from "../../src/hooks/useVolunteers";
import { volunteerService } from "../../src/services/volunteerService";

jest.mock("../../src/services/volunteerService", () => ({
  volunteerService: { getVolunteers: jest.fn(), createVolunteer: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
  volunteerService.getVolunteers.mockResolvedValue([]);
});

test("does not fetch volunteers when disabled", async () => {
  renderHook(() => useVolunteers(false));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(volunteerService.getVolunteers).not.toHaveBeenCalled();
});

test("fetches volunteers when enabled", async () => {
  renderHook(() => useVolunteers(true));
  await waitFor(() => expect(volunteerService.getVolunteers).toHaveBeenCalledTimes(1));
});

test("creation success reports a refresh failure instead of a false success", async () => {
  volunteerService.createVolunteer.mockResolvedValue({});
  volunteerService.getVolunteers
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce(new Error("refresh failed"));
  const { result } = renderHook(() => useVolunteers(true));
  await waitFor(() => expect(volunteerService.getVolunteers).toHaveBeenCalledTimes(1));

  let created;
  await act(async () => {
    created = await result.current.createVolunteer("Name", "a@b.com", "pw");
  });

  expect(created).toBe(true);
  expect(result.current.message).toBe("Volunteer created, but refreshing the list failed.");
  expect(result.current.messageType).toBe("error");
});

test("surfaces a backend validation error on create", async () => {
  volunteerService.createVolunteer.mockRejectedValue(new Error("Email already registered"));
  const { result } = renderHook(() => useVolunteers(false));

  let created;
  await act(async () => {
    created = await result.current.createVolunteer("Name", "a@b.com", "pw");
  });

  expect(created).toBe(false);
  expect(result.current.message).toBe("Email already registered");
  expect(result.current.messageType).toBe("error");
});

test("maps a 422 field validation error to a field-specific message", async () => {
  const error = new Error("Request validation failed");
  error.details = { validation_errors: [{ loc: ["body", "password"], msg: "String should have at least 8 characters" }] };
  volunteerService.createVolunteer.mockRejectedValue(error);
  const { result } = renderHook(() => useVolunteers(false));

  let created;
  await act(async () => {
    created = await result.current.createVolunteer("Name", "a@b.com", "pw");
  });

  expect(created).toBe(false);
  expect(result.current.message).toBe("password: String should have at least 8 characters");
});

test("sets a load error that clears on a successful refetch", async () => {
  volunteerService.createVolunteer.mockResolvedValue({});
  volunteerService.getVolunteers.mockRejectedValueOnce(new Error("Failed to load volunteers."));
  const { result } = renderHook(() => useVolunteers(true));

  await waitFor(() => expect(result.current.loadError).toBe("Failed to load volunteers."));

  volunteerService.getVolunteers.mockResolvedValueOnce([]);
  await act(async () => {
    await result.current.createVolunteer("Name", "a@b.com", "pw");
  });

  expect(result.current.loadError).toBeNull();
});
