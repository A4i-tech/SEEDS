import { deriveStage, toSegment, pagesFromDocs } from "../../src/utils/segments";

describe("deriveStage", () => {
  test("rejected and approved statuses win", () => {
    expect(deriveStage({ translations: { hi: { text: "x", status: "rejected" } } }, "hi")).toBe("rejected");
    expect(deriveStage({ translations: { hi: { text: "x", status: "approved" } } }, "hi")).toBe("approved");
  });

  test("a segment with no entry or empty text for the language is new", () => {
    expect(deriveStage({}, "hi")).toBe("new");
    expect(deriveStage({ translations: { kn: { text: "x" } } }, "hi")).toBe("new");
    expect(deriveStage({ translations: { hi: { text: "", status: "pending" } } }, "hi")).toBe("new");
  });

  test("a pending draft with text needs review", () => {
    expect(deriveStage({ translations: { hi: { text: "x", status: "pending" } } }, "hi")).toBe("needs_review");
  });
});

describe("toSegment", () => {
  test("maps id, source, translation and stage", () => {
    const doc = { id: "k1", sourceText: "Hello", translations: { hi: { text: "namaste", status: "approved" } } };
    expect(toSegment(doc, "hi")).toEqual({ id: "k1", sourceText: "Hello", translation: "namaste", stage: "approved" });
  });

  test("uses an empty translation when the language has no draft", () => {
    expect(toSegment({ id: "k2", sourceText: "Bye" }, "hi")).toEqual({
      id: "k2",
      sourceText: "Bye",
      translation: "",
      stage: "new",
    });
  });
});

describe("pagesFromDocs", () => {
  const t = (ts) => new Date(ts).getTime();

  test("groups by route, counts approvals for the language and sorts by latest update", () => {
    const docs = [
      { route: "/a", translations: { hi: { status: "approved" } }, updatedAt: "2024-01-05" },
      { route: "/a", translations: { hi: { status: "pending" } }, updatedAt: "2024-01-02" },
      { route: "/b", translations: { kn: { status: "approved" } }, updatedAt: "2024-01-09" },
    ];
    expect(pagesFromDocs(docs, "hi")).toEqual([
      { route: "/b", total: 1, approved: 0, updatedAt: t("2024-01-09") },
      { route: "/a", total: 2, approved: 1, updatedAt: t("2024-01-05") },
    ]);
  });

  test("keeps the newest update whichever order the docs arrive in", () => {
    const older = { route: "/a", translations: {}, updatedAt: "2024-01-01" };
    const newer = { route: "/a", translations: {}, updatedAt: "2024-03-01" };
    expect(pagesFromDocs([newer, older], "hi")[0].updatedAt).toBe(t("2024-03-01"));
    expect(pagesFromDocs([older, newer], "hi")[0].updatedAt).toBe(t("2024-03-01"));
  });

  test("a doc without a route belongs to '/' and a missing updatedAt counts as 0", () => {
    expect(pagesFromDocs([{ translations: {} }], "hi")).toEqual([{ route: "/", total: 1, approved: 0, updatedAt: 0 }]);
  });

  test("no docs gives no pages", () => {
    expect(pagesFromDocs([], "hi")).toEqual([]);
  });
});
