import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  folderOfId,
  isContained,
  isNoteId,
  isValidFolderPath,
  isValidId,
  isValidName,
  nameOfId,
  statOrNull,
} from "./paths";

const makeRoot = (): Promise<string> => mkdtemp(join(tmpdir(), "notes-paths-"));

describe("isValidId", () => {
  it("accepts notebook-relative ids including the extension", () => {
    expect(isValidId("a.md")).toBe(true);
    expect(isValidId("Ideas/2026/plan.md")).toBe(true);
  });

  it("rejects traversal, absolute paths, empty and malformed segments", () => {
    expect(isValidId("")).toBe(false);
    expect(isValidId("/abs.md")).toBe(false);
    expect(isValidId("../escape.md")).toBe(false);
    expect(isValidId("Ideas/../../escape.md")).toBe(false);
    expect(isValidId("Ideas/./plan.md")).toBe(false);
    expect(isValidId("Ideas//plan.md")).toBe(false);
    expect(isValidId("Ideas/")).toBe(false);
    expect(isValidId("a\0b.md")).toBe(false);
  });
});

describe("isValidName and isValidFolderPath", () => {
  it("accepts spaces in a name but rejects separators and traversal", () => {
    expect(isValidName("My Notes")).toBe(true);
    expect(isValidName("")).toBe(false);
    expect(isValidName(".")).toBe(false);
    expect(isValidName("..")).toBe(false);
    expect(isValidName("a/b")).toBe(false);
    expect(isValidName("a\\b")).toBe(false);
  });

  it("treats the empty string as the root folder path only", () => {
    expect(isValidFolderPath("")).toBe(true);
    expect(isValidFolderPath("Ideas/2026")).toBe(true);
    expect(isValidFolderPath("../x")).toBe(false);
  });
});

describe("isNoteId and id parts", () => {
  it("matches the extension case-insensitively", () => {
    expect(isNoteId("a.md")).toBe(true);
    expect(isNoteId("a.MD")).toBe(true);
    expect(isNoteId("a.txt")).toBe(false);
  });

  it("splits folder and name", () => {
    expect(folderOfId("Ideas/2026/plan.md")).toBe("Ideas/2026");
    expect(folderOfId("plan.md")).toBe("");
    expect(nameOfId("Ideas/2026/plan.md")).toBe("plan.md");
    expect(nameOfId("plan.md")).toBe("plan.md");
  });
});

describe("isContained", () => {
  it("accepts a target under the root, existing or not", async () => {
    const root = await makeRoot();
    try {
      expect(await isContained(root, join(root, "a.md"))).toBe(true);
      expect(await isContained(root, join(root, "Ideas", "deep", "new.md"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a lexical escape", async () => {
    const root = await makeRoot();
    try {
      expect(await isContained(root, join(root, "..", "escape.md"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a symlink that points outside the notebook", async () => {
    const root = await makeRoot();
    const outside = await mkdtemp(join(tmpdir(), "notes-outside-"));
    try {
      await mkdir(join(outside, "sub"));
      await symlink(outside, join(root, "link"));
      expect(await isContained(root, join(root, "link"))).toBe(false);
      expect(await isContained(root, join(root, "link", "sub"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe("statOrNull", () => {
  it("answers null for a missing path and stats for a present one", async () => {
    const root = await makeRoot();
    try {
      expect(await statOrNull(join(root, "missing.md"))).toBeNull();
      await writeFile(join(root, "present.md"), "hi");
      expect((await statOrNull(join(root, "present.md")))?.isFile()).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
