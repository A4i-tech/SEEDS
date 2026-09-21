import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("../../src/services/translationService", () => ({
  translationService: { listTranslations: jest.fn().mockResolvedValue([]) },
}));

jest.mock("../../src/hooks/useLocalization", () => ({
  useLocalization: () => ({
    projects: [], sites: [], languages: [], isLoadingWorkspace: true, workspaceLoadError: "",
    handleCreateSite: jest.fn(), handleUpdateSite: jest.fn(), handleDeleteSite: jest.fn(),
  }),
}));

import LocalizationTab from "../../src/components/AllContent/LocalizationTab/LocalizationTab";

test("shows a loading skeleton instead of a blank screen while the dashboard loads", () => {
  render(<LocalizationTab />);
  expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
});
