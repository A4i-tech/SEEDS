import React from "react";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import ContentTable from "../../src/components/AllContent/ContentTab/ContentTable";
import { getRole, getSchoolId, getTokenPayload } from "../../src/utils/authHelpers";

jest.mock("../../src/utils/authHelpers", () => ({
  getRole: jest.fn(),
  getSchoolId: jest.fn(),
  getTokenPayload: jest.fn(),
}));

jest.mock("../../src/components/AllContent/shared/MiddleEllipsis", () => ({ text }) => <span>{text}</span>);

const SCHOOL = "school-1";
const ME = "user-me";

const row = (id, createdBy, schoolId = SCHOOL) => ({
  id,
  type: "story",
  language: "en",
  created_by: createdBy,
  school_id: schoolId,
  title: { english: id, local: "" },
  theme: { english: "theme", local: "" },
});

const CONTENT = [row("mine", ME), row("others", "user-other"), row("other-school", ME, "school-2")];

const renderAs = (role, isTenant = false, payload = { sub: ME }) => {
  getRole.mockReturnValue(role);
  getSchoolId.mockReturnValue(SCHOOL);
  getTokenPayload.mockReturnValue(payload);
  render(
    <ContentTable
      content={CONTENT}
      isLoading={false}
      onEdit={jest.fn()}
      onView={jest.fn()}
      onDelete={jest.fn()}
      isTenant={isTenant}
    />
  );
};

const actionsFor = (title) =>
  within(screen.getByRole("row", { name: new RegExp(`^${title} `) }))
    .getAllByRole("button")
    .map((b) => b.textContent);

describe("ContentTable row actions", () => {
  test("teacher sees Edit/Delete only on own content, View on all", () => {
    renderAs("teacher");
    expect(actionsFor("mine")).toEqual(["Edit", "View", "Delete"]);
    expect(actionsFor("others")).toEqual(["View"]);
    expect(actionsFor("other-school")).toEqual(["View"]);
  });

  test.each(["school_admin", "content_creator"])("%s sees Edit/Delete on all own-school content", (role) => {
    renderAs(role);
    expect(actionsFor("mine")).toEqual(["Edit", "View", "Delete"]);
    expect(actionsFor("others")).toEqual(["Edit", "View", "Delete"]);
    expect(actionsFor("other-school")).toEqual(["View"]);
  });

  test("unknown role sees View only", () => {
    renderAs("some_future_role");
    expect(actionsFor("mine")).toEqual(["View"]);
    expect(actionsFor("others")).toEqual(["View"]);
    expect(actionsFor("other-school")).toEqual(["View"]);
  });

  test("teacher with empty token payload sees View only", () => {
    renderAs("teacher", false, {});
    expect(actionsFor("mine")).toEqual(["View"]);
    expect(actionsFor("others")).toEqual(["View"]);
  });

  test("tenant sees Edit/Delete on all content", () => {
    renderAs("tenant", true);
    expect(actionsFor("mine")).toEqual(["Edit", "View", "Delete"]);
    expect(actionsFor("others")).toEqual(["Edit", "View", "Delete"]);
    expect(actionsFor("other-school")).toEqual(["Edit", "View", "Delete"]);
  });
});
