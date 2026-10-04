import { describe, expect, it } from "bun:test";

import type { NoteMeta } from "../../shared/types";
import { filterNotes, isInSubtree, scopeNotes, visibleNotes } from "./noteFilter";

const note = (id: string, title: string, preview = ""): NoteMeta => ({
  id,
  title,
  preview,
  folder: id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "",
  updatedAt: 0,
});

const notes: NoteMeta[] = [
  note("root.md", "Root", "# Root body"),
  note("Ideas/plan.md", "plan", "# Plan\nquarterly PLANNING notes"),
  note("Ideas/2026/Budget.md", "Budget", "spending"),
  note("Ideas/Drafts/untitled.md", "untitled", "draft body"),
  note("Archive/Old.md", "Old", "ancient"),
];

describe("isInSubtree", () => {
  it("treats the root as every note", () => {
    expect(notes.every((entry) => isInSubtree(entry.id, ""))).toBe(true);
  });

  it("matches a note directly in the folder and anything below it", () => {
    expect(isInSubtree("Ideas/plan.md", "Ideas")).toBe(true);
    expect(isInSubtree("Ideas/2026/Budget.md", "Ideas")).toBe(true);
    expect(isInSubtree("Ideas/2026/Budget.md", "Ideas/2026")).toBe(true);
  });

  it("does not match a sibling folder or a folder whose name merely starts the same", () => {
    expect(isInSubtree("Archive/Old.md", "Ideas")).toBe(false);
    expect(isInSubtree("Ideas2/plan.md", "Ideas")).toBe(false);
    expect(isInSubtree("Ideas/plan.md", "Ideas/2026")).toBe(false);
  });
});

describe("scopeNotes", () => {
  it("shows every note when no folder is selected", () => {
    expect(scopeNotes(notes, null)).toEqual(notes);
  });

  it("shows the selected folder's subtree, including two levels down", () => {
    expect(scopeNotes(notes, "Ideas").map((entry) => entry.id)).toEqual([
      "Ideas/plan.md",
      "Ideas/2026/Budget.md",
      "Ideas/Drafts/untitled.md",
    ]);
  });

  it("shows an empty list for a folder with no notes", () => {
    expect(scopeNotes(notes, "Missing")).toEqual([]);
  });
});

describe("filterNotes", () => {
  it("returns every note for an empty or whitespace-only query", () => {
    expect(filterNotes(notes, "")).toEqual(notes);
    expect(filterNotes(notes, "   ")).toEqual(notes);
  });

  it("matches the title case-insensitively", () => {
    expect(filterNotes(notes, "bud").map((entry) => entry.id)).toEqual([
      "Ideas/2026/Budget.md",
    ]);
  });

  it("matches the preview too, so a filename-only hit is not the only way in", () => {
    expect(filterNotes(notes, "planning").map((entry) => entry.id)).toEqual([
      "Ideas/plan.md",
    ]);
  });

  it("answers an empty list when nothing matches", () => {
    expect(filterNotes(notes, "zzz")).toEqual([]);
  });
});

describe("visibleNotes", () => {
  it("applies the scope before the search", () => {
    expect(visibleNotes(notes, "Ideas", "budget").map((entry) => entry.id)).toEqual([
      "Ideas/2026/Budget.md",
    ]);
  });

  it("ignores a note outside the selected subtree even when it matches the query", () => {
    expect(visibleNotes(notes, "Ideas/Drafts", "old")).toEqual([]);
  });

  it("searches the whole notebook when no folder is selected (SPEC §10.4)", () => {
    expect(visibleNotes(notes, null, "ancient").map((entry) => entry.id)).toEqual([
      "Archive/Old.md",
    ]);
  });
});
