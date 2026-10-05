import { describe, expect, it } from "bun:test";

import { countDocument } from "./documentCounts";

describe("countDocument", () => {
  it("counts whitespace-separated tokens", () => {
    expect(countDocument("one two three")).toEqual({ words: 3, lines: 1 });
  });

  it("collapses runs of whitespace and ignores leading/trailing space", () => {
    expect(countDocument("  one   two \n\n three  ")).toEqual({ words: 3, lines: 3 });
  });

  it("counts an empty document as one line and no words", () => {
    expect(countDocument("")).toEqual({ words: 0, lines: 1 });
  });

  it("counts markdown punctuation as part of its token — the rule is whitespace, not words", () => {
    expect(countDocument("# Heading\n- [ ] task")).toEqual({ words: 6, lines: 2 });
  });

  it("tracks a trailing newline as its own line", () => {
    expect(countDocument("a\n")).toEqual({ words: 1, lines: 2 });
  });
});
