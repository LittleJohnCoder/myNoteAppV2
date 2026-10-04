import { describe, expect, it } from "bun:test";

import { truncateSnippet } from "./truncateSnippet";

describe("truncateSnippet", () => {
  it("keeps short text intact", () => {
    expect(truncateSnippet("hi", 60)).toBe("hi");
  });

  it("keeps text of exactly the limit intact", () => {
    expect(truncateSnippet("a".repeat(60), 60)).toBe("a".repeat(60));
  });

  it("truncates and marks the cut", () => {
    expect(truncateSnippet("a".repeat(100), 60)).toBe(`${"a".repeat(60).trimEnd()} …`);
  });

  it("trims the cut so the ellipsis never follows a space", () => {
    expect(truncateSnippet(`${"a".repeat(59)}  tail`, 60)).toBe(`${"a".repeat(59)} …`);
  });

  it("answers an empty string for empty text or a non-positive limit", () => {
    expect(truncateSnippet("", 60)).toBe("");
    expect(truncateSnippet("body", 0)).toBe("");
  });
});
