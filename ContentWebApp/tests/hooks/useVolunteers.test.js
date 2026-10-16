import { renderHook, waitFor } from "@testing-library/react";
import { useVolunteers } from "../../src/hooks/useVolunteers";
import { volunteerService } from "../../src/services/volunteerService";
import { getRole } from "../../src/utils/authHelpers";

jest.mock("../../src/services/volunteerService", () => ({
  volunteerService: { getVolunteers: jest.fn(), createVolunteer: jest.fn() },
}));

jest.mock("../../src/utils/authHelpers", () => ({ getRole: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  getRole.mockReturnValue("tenant");
  volunteerService.getVolunteers.mockResolvedValue([]);
});

test.each([["content"], ["ivr"], ["analytics"], ["localization"]])(
  "does not fetch volunteers on the %s tab",
  async (activeTab) => {
    renderHook(() => useVolunteers(activeTab));
    await waitFor(() => expect(volunteerService.getVolunteers).not.toHaveBeenCalled());
  }
);

test.each([["registration"], ["remediation"]])("fetches volunteers on the %s tab", async (activeTab) => {
  renderHook(() => useVolunteers(activeTab));
  await waitFor(() => expect(volunteerService.getVolunteers).toHaveBeenCalledTimes(1));
});

test("does not fetch for a non-tenant role even on the registration tab", async () => {
  getRole.mockReturnValue("textbook_remediation_volunteer");
  renderHook(() => useVolunteers("registration"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(volunteerService.getVolunteers).not.toHaveBeenCalled();
});
