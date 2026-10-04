import { describe, expect, it } from "bun:test";

import type { NoteMeta } from "../../shared/types";
import { ancestorFolderPaths, noteCountsByFolder } from "./folderTree";

const note = (id: string, folder: string): NoteMeta => ({
  id,
  folder,
  title: id.replace(/\.md$/, ""),
  preview: "",
  updatedAt: 0,
});

describe("ancestorFolderPaths", () => {
  it("lists the root first, then each prefix of the folder path", () => {
    expect(ancestorFolderPaths("Ideas/2026")).toEqual(["", "Ideas", "Ideas/2026"]);
  });

  it("lists only the root for a note at the notebook root", () => {
    expect(ancestorFolderPaths("")).toEqual([""]);
  });
});

describe("noteCountsByFolder", () => {
  it("counts a folder's whole subtree, and the root counts every note", () => {
    const counts = noteCountsByFolder([
      note("root.md", ""),
      note("Ideas/plan.md", "Ideas"),
      note("Ideas/2026/deep.md", "Ideas/2026"),
      note("Ideas/Drafts/draft.md", "Ideas/Drafts"),
      note("Archive/old.md", "Archive"),
    ]);

    expect(counts.get("")).toBe(5);
    expect(counts.get("Ideas")).toBe(3);
    expect(counts.get("Ideas/2026")).toBe(1);
    expect(counts.get("Ideas/Drafts")).toBe(1);
    expect(counts.get("Archive")).toBe(1);
  });

  it("omits folders that hold no notes rather than answering 0", () => {
    const counts = noteCountsByFolder([note("root.md", "")]);

    expect(counts.get("")).toBe(1);
    expect(counts.has("Ideas")).toBe(false);
  });

  it("answers an empty map for an empty notebook", () => {
    expect(noteCountsByFolder([]).size).toBe(0);
  });

  it("counts by a note's folder, not by its id's spelling", () => {
    // A note whose id and folder disagree is a bug upstream; the count follows `folder`, which is
    // what the notes layer derives from the walk (SPEC §9.1).
    const counts = noteCountsByFolder([note("Ideas/2026/plan.md", "Ideas")]);

    expect(counts.get("Ideas")).toBe(1);
    expect(counts.has("Ideas/2026")).toBe(false);
  });
});
