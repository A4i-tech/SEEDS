import {
  splitBlocks,
  joinBlocks,
  parseHeading,
  buildHeading,
  parseList,
  buildList,
  applyListEdit,
  parseImage,
  buildImage,
  replacePageInDocument,
  splitIntoPages,
} from "../../src/components/remediationBlocks";

const PAGE = `<!-- page 1 -->

# Chapter One

This is a paragraph about plants.

- First item
- Second item

| A | B |
| --- | --- |
| 1 | 2 |

$$x^2 + y = z$$

![A plant](images/plant.png "A green plant in a pot")`;

describe("classifyBlock", () => {
  test("identifies each block type", () => {
    const blocks = splitBlocks(PAGE);
    expect(blocks.map((b) => b.type)).toEqual([
      "marker",
      "heading",
      "paragraph",
      "list",
      "table",
      "math",
      "image",
    ]);
  });
});

describe("split -> edit one block -> rebuild", () => {
  test("keeps every other block byte-identical", () => {
    const blocks = splitBlocks(PAGE);
    const headingBlock = blocks.find((b) => b.type === "heading");
    const parsed = parseHeading(headingBlock.raw);
    const editedRaw = buildHeading({ ...parsed, text: "Chapter One Revised" });

    const rebuiltBlocks = blocks.map((b) => (b.id === headingBlock.id ? { ...b, raw: editedRaw } : b));
    const rebuiltPage = joinBlocks(rebuiltBlocks);

    blocks.forEach((block) => {
      if (block.id === headingBlock.id) return;
      const rebuiltBlock = rebuiltBlocks.find((b) => b.id === block.id);
      expect(rebuiltBlock.raw).toBe(block.raw);
    });
    expect(rebuiltPage).toContain("# Chapter One Revised");
    expect(rebuiltPage).toContain("This is a paragraph about plants.");
    expect(rebuiltPage).toContain("![A plant](images/plant.png \"A green plant in a pot\")");
  });

  test("editing the list keeps bullet markers and other blocks untouched", () => {
    const blocks = splitBlocks(PAGE);
    const listBlock = blocks.find((b) => b.type === "list");
    const items = parseList(listBlock.raw);
    const editedText = items.map((i) => i.text).join("\n").replace("First item", "First item edited");
    const editedRaw = buildList(applyListEdit(items, editedText));

    expect(editedRaw).toBe("- First item edited\n- Second item");

    const rebuiltBlocks = blocks.map((b) => (b.id === listBlock.id ? { ...b, raw: editedRaw } : b));
    blocks.forEach((block) => {
      if (block.id === listBlock.id) return;
      expect(rebuiltBlocks.find((b) => b.id === block.id).raw).toBe(block.raw);
    });
  });

  test("editing the image alt/description round-trips the markdown", () => {
    const blocks = splitBlocks(PAGE);
    const imageBlock = blocks.find((b) => b.type === "image");
    const parsed = parseImage(imageBlock.raw);
    expect(parsed).toEqual({ alt: "A plant", src: "images/plant.png", description: "A green plant in a pot" });

    const editedRaw = buildImage({ ...parsed, description: "A green plant in a clay pot" });
    expect(editedRaw).toBe("![A plant](images/plant.png \"A green plant in a clay pot\")");
  });

  test("buildImage keeps a multi-line description on one line so the image title still parses", () => {
    const raw = buildImage({ alt: "A", src: "images/a.png", description: "line one\n  line two" });
    expect(raw).toBe("![A](images/a.png \"line one line two\")");
    expect(parseImage(raw).description).toBe("line one line two");
  });
});

describe("replacePageInDocument", () => {
  test("replaces only the target page and leaves the rest of the document untouched", () => {
    const fullText = "<!-- page 1 -->\nfirst page\n\n<!-- page 2 -->\nsecond page\n\n<!-- page 3 -->\nthird page";
    const pages = splitIntoPages(fullText);

    const updated = replacePageInDocument(fullText, pages, 1, "<!-- page 2 -->\nsecond page edited");

    expect(updated).toContain("first page");
    expect(updated).toContain("second page edited");
    expect(updated).toContain("third page");
    expect(updated).not.toContain("\nsecond page\n");
  });
});
