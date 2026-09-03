import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("../../src/services/translationService", () => ({
  translationService: { listTranslations: jest.fn().mockResolvedValue([]) },
}));

jest.mock("../../src/hooks/useLocalization", () => ({
  useLocalization: () => ({
    projects: [], sites: [], languages: [], isLoadingWorkspace: true, workspaceLoadError: "",
    handleCreateProject: jest.fn(), handleUpdateProject: jest.fn(), handleDeleteProject: jest.fn(),
    handleCreateSite: jest.fn(), handleUpdateSite: jest.fn(), handleDeleteSite: jest.fn(),
    handleCreateLanguage: jest.fn(), handleUpdateLanguage: jest.fn(), handleDeleteLanguage: jest.fn(),
  }),
}));

import LocalizationUI from "../../src/localization-ui/LocalizationUI";

test("shows a loading skeleton instead of a blank screen while the dashboard loads", () => {
  render(<LocalizationUI />);
  expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
});
