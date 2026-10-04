import { describe, expect, it } from "bun:test";

import { rekeyFolderPath, rekeyId } from "./rekey";

describe("rekeyId", () => {
  it("maps a renamed id to its new spelling", () => {
    const changes = [
      { from: "Ideas/2026/other.md", to: "Notes/2026/other.md" },
      { from: "Ideas/2026/plan.md", to: "Notes/2026/plan.md" },
    ];

    expect(rekeyId("Ideas/2026/plan.md", changes)).toBe("Notes/2026/plan.md");
  });

  it("leaves an id outside the rename alone", () => {
    const changes = [{ from: "Ideas/plan.md", to: "Notes/plan.md" }];

    expect(rekeyId("Archive/old.md", changes)).toBe("Archive/old.md");
  });

  it("keeps a null selection null, and answers the same id for an empty map", () => {
    expect(rekeyId(null, [{ from: "a.md", to: "b.md" }])).toBeNull();
    expect(rekeyId("a.md", [])).toBe("a.md");
  });

  it("does not re-key a note whose id merely starts with another id", () => {
    const changes = [{ from: "plan.md", to: "renamed.md" }];

    expect(rekeyId("plan.md.bak.md", changes)).toBe("plan.md.bak.md");
  });
});

describe("rekeyFolderPath", () => {
  it("re-keys the renamed folder itself", () => {
    expect(rekeyFolderPath("Ideas", "Ideas", "Notes")).toBe("Notes");
  });

  it("re-keys a descendant, keeping the tail of the path", () => {
    expect(rekeyFolderPath("Ideas/2026", "Ideas", "Notes")).toBe("Notes/2026");
    expect(rekeyFolderPath("Ideas/2026/Drafts", "Ideas", "Notes")).toBe("Notes/2026/Drafts");
  });

  it("leaves a folder outside the rename alone, including a name-only prefix collision", () => {
    expect(rekeyFolderPath("Archive", "Ideas", "Notes")).toBe("Archive");
    expect(rekeyFolderPath("Ideas2", "Ideas", "Notes")).toBe("Ideas2");
  });

  it("leaves the root selection alone when a folder below it is renamed", () => {
    // `from` is never `""`: the layer refuses to rename the root (`invalid name`, SPEC §9.1).
    expect(rekeyFolderPath("", "Ideas", "Notes")).toBe("");
  });

  it("keeps a null folder null and ignores a rename of a folder it is not under", () => {
    expect(rekeyFolderPath(null, "Ideas", "Notes")).toBeNull();
    expect(rekeyFolderPath("Ideas", "Archive", "Old")).toBe("Ideas");
  });
});
