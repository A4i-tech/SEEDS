import { deriveNameFromDomain } from "../../src/utils/deriveNameFromDomain";

test("example-school.org becomes Example School", () => {
  expect(deriveNameFromDomain("example-school.org")).toBe("Example School");
});

test("drops a subdomain-style multi-label TLD correctly for a plain two-label domain", () => {
  expect(deriveNameFromDomain("my-cool-site.com")).toBe("My Cool Site");
});

test("single-label domain with no dot still title-cases", () => {
  expect(deriveNameFromDomain("localhost")).toBe("Localhost");
});

test("underscore separators are treated like hyphens", () => {
  expect(deriveNameFromDomain("foo_bar.net")).toBe("Foo Bar");
});
