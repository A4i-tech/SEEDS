import { buildQueryString } from "../../src/services/api";

describe("buildQueryString", () => {
  test("serializes scalar values", () => {
    expect(buildQueryString({ limit: 10, cursor: "abc" })).toBe("limit=10&cursor=abc");
  });

  test("serializes array values as repeated query params", () => {
    expect(buildQueryString({ ids: ["one", "two"], limit: 2 })).toBe("ids=one&ids=two&limit=2");
  });

  test("skips null and undefined array items", () => {
    expect(buildQueryString({ ids: ["one", null, undefined, "two"] })).toBe("ids=one&ids=two");
  });
});
