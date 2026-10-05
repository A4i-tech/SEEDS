import { extractDomain } from "../../src/utils/url";

test("adds a protocol to a bare domain and returns the hostname", () => {
  expect(extractDomain("example.com")).toBe("example.com");
});

test("strips protocol, path, query and port down to the hostname", () => {
  expect(extractDomain("https://app.example.com:8443/a/b?x=1#y")).toBe("app.example.com");
});

test("accepts an http URL and an uppercase protocol", () => {
  expect(extractDomain("http://example.com/x")).toBe("example.com");
  expect(extractDomain("HTTPS://Example.com")).toBe("example.com");
});

test("returns the input unchanged when it cannot be parsed as a URL", () => {
  expect(extractDomain("not a url")).toBe("not a url");
});
