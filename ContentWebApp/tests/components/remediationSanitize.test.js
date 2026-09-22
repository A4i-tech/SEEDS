import { sanitize } from "hast-util-sanitize";
import { remediationSanitizeSchema } from "../../src/components/remediationSanitizeSchema";

const element = (tagName, properties = {}, children = []) => ({
  type: "element",
  tagName,
  properties,
  children,
});
const text = (value) => ({ type: "text", value });
const root = (children) => ({ type: "root", children });

const clean = (children) => sanitize(root(children), remediationSanitizeSchema);

describe("remediationSanitizeSchema", () => {
  test("strips script elements produced from raw markdown HTML", () => {
    const result = clean([element("script", {}, [text("alert(1)")])]);
    expect(result.children).toHaveLength(0);
  });

  test("strips inline event handlers but keeps safe image attributes", () => {
    const result = clean([
      element("img", { src: "images/figure.png", alt: "Figure", width: "200", onError: "alert(1)" }),
    ]);
    expect(result.children[0].tagName).toBe("img");
    expect(result.children[0].properties.src).toBe("images/figure.png");
    expect(result.children[0].properties.alt).toBe("Figure");
    expect(result.children[0].properties.width).toBe("200");
    expect(result.children[0].properties.onError).toBeUndefined();
  });

  test("keeps MathML blocks emitted by the backend", () => {
    const result = clean([
      element("math", { xmlns: "http://www.w3.org/1998/Math/MathML", display: "block" }, [
        element("mrow", {}, [
          element("mi", {}, [text("x")]),
          element("mo", {}, [text("+")]),
          element("mn", {}, [text("1")]),
        ]),
      ]),
    ]);
    const math = result.children[0];
    expect(math.tagName).toBe("math");
    expect(math.properties.display).toBe("block");
    expect(math.children[0].tagName).toBe("mrow");
    expect(math.children[0].children.map((child) => child.tagName)).toEqual(["mi", "mo", "mn"]);
  });

  test("keeps GFM tables", () => {
    const result = clean([
      element("table", {}, [
        element("thead", {}, [element("tr", {}, [element("th", {}, [text("a")])])]),
        element("tbody", {}, [element("tr", {}, [element("td", {}, [text("1")])])]),
      ]),
    ]);
    const table = result.children[0];
    expect(table.tagName).toBe("table");
    expect(table.children.map((child) => child.tagName)).toEqual(["thead", "tbody"]);
  });

  test("keeps the math classes rehype-katex relies on", () => {
    const result = clean([
      element("code", { className: ["language-math", "math-inline"] }, [text("x^2")]),
    ]);
    expect(result.children[0].properties.className).toEqual(["language-math", "math-inline"]);
  });
});
