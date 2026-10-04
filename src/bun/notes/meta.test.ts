import { describe, expect, it } from "bun:test";

import {
  buildNoteMeta,
  derivePreview,
  deriveTitle,
  isMarkdown,
  slugifyTitle,
  stemOf,
} from "./meta";

describe("deriveTitle", () => {
  // SPEC §9.1: the name (filename stem) wins; the H1 is the fallback for a note created untitled.
  it("uses the note's name and ignores an H1 in the body", () => {
    expect(deriveTitle("# Real Title\n\nbody", "plan.md")).toBe("plan");
    expect(deriveTitle("intro\n\n# Later Heading\n", "plan.md")).toBe("plan");
    expect(deriveTitle("", "notes.md")).toBe("notes");
  });

  it("falls back to the first H1 when the note was created untitled", () => {
    expect(deriveTitle("# Real Title\n\nbody", "untitled.md")).toBe("Real Title");
    expect(deriveTitle("intro\n\n# Later Heading\n", "untitled1.md")).toBe("Later Heading");
  });

  it("drops closing hashes and trims the H1 it does use", () => {
    expect(deriveTitle("#   Spaced Title   ###\n", "untitled.md")).toBe("Spaced Title");
  });

  it("answers untitled when there is neither a name nor an H1", () => {
    expect(deriveTitle("## Only H2\n", "untitled.md")).toBe("untitled");
    expect(deriveTitle("", "untitled.md")).toBe("untitled");
    expect(deriveTitle("no headings here", "untitled2.md")).toBe("untitled");
    // ATX needs the space: "#hashtag" is not a heading.
    expect(deriveTitle("#hashtag", "untitled.md")).toBe("untitled");
  });
});

describe("derivePreview", () => {
  it("collapses whitespace, trims and caps at 60 chars", () => {
    expect(derivePreview("  hello   world \n\n again  ")).toBe("hello world again");
    expect(derivePreview("a".repeat(100))).toHaveLength(60);
  });

  it("keeps the title line, which is part of the body", () => {
    expect(derivePreview("# Title\n\nbody text")).toBe("# Title body text");
  });
});

describe("slugifyTitle", () => {
  it("keeps letters and numbers only, dropping every symbol", () => {
    expect(slugifyTitle("My Notes")).toBe("mynotes");
    expect(slugifyTitle("# Hello, World!")).toBe("helloworld");
    expect(slugifyTitle("Plan (draft)")).toBe("plandraft");
  });

  it("never doubles the extension", () => {
    expect(slugifyTitle("notes.md")).toBe("notes");
    expect(slugifyTitle("NOTES.MD")).toBe("notes");
  });

  it("falls back to untitled", () => {
    expect(slugifyTitle("")).toBe("untitled");
    expect(slugifyTitle("***")).toBe("untitled");
    expect(slugifyTitle("...")).toBe("untitled");
  });

  it("drops spaces, dashes and underscores", () => {
    expect(slugifyTitle("  spaced  ")).toBe("spaced");
    expect(slugifyTitle("a-b_c")).toBe("abc");
  });
});

describe("buildNoteMeta", () => {
  it("derives id parts, title and preview, keeping the given timestamp", () => {
    expect(buildNoteMeta("Ideas/2026/plan.md", "# Plan\n\nbody", 1234)).toEqual({
      id: "Ideas/2026/plan.md",
      title: "plan", // the name wins over the H1 (SPEC §9.1)
      folder: "Ideas/2026",
      updatedAt: 1234,
      preview: "# Plan body",
    });
  });

  it("takes the title from the H1 only for an untitled note", () => {
    expect(buildNoteMeta("untitled.md", "# From Body\n\nbody", 1).title).toBe("From Body");
    expect(buildNoteMeta("untitled1.md", "no heading", 1).title).toBe("untitled");
  });
});

describe("isMarkdown and stemOf", () => {
  it("matches the extension case-insensitively", () => {
    expect(isMarkdown("a.md")).toBe(true);
    expect(isMarkdown("a.MD")).toBe(true);
    expect(isMarkdown("a.txt")).toBe(false);
    expect(stemOf("a.MD")).toBe("a");
  });
});
