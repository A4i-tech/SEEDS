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
