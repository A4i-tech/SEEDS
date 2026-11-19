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

test("strips a leading www.", () => {
  expect(deriveNameFromDomain("www.example.com")).toBe("Example");
});

test.each([
  ["school.co.uk", "School"],
  ["charity.org.uk", "Charity"],
  ["shop.com.au", "Shop"],
  ["www.green-valley-school.co.in", "Green Valley School"],
  ["loja.com.br", "Loja"],
])("removes the multi-part public suffix of %s", (domain, expected) => {
  expect(deriveNameFromDomain(domain)).toBe(expected);
});

test("keeps ordinary subdomains", () => {
  expect(deriveNameFromDomain("blog.example.com")).toBe("Blog Example");
});

test("removes only the last label for an unknown multi-part suffix", () => {
  expect(deriveNameFromDomain("school.edu.sg")).toBe("School Edu");
});

test("ignores surrounding whitespace and letter case", () => {
  expect(deriveNameFromDomain("  WWW.Example-School.CO.UK  ")).toBe("Example School");
});
