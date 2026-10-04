import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { listAllNotes, readFolderTree } from "./tree";

const makeRoot = (): Promise<string> => mkdtemp(join(tmpdir(), "notes-tree-"));

const writeNoteFile = async (root: string, relative: string, content: string): Promise<void> => {
  const abs = join(root, relative);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf8");
};

/** A fixture carrying every shape the walk must skip or keep (SPEC §9.1). */
const seedFixture = async (root: string): Promise<void> => {
  await writeNoteFile(root, "Ideas/2026/plan.md", "# Plan\n\nsome body");
  await writeNoteFile(root, "Ideas/notes.txt", "not a note");
  await writeNoteFile(root, "Ideas/.hidden.md", "# hidden");
  await writeNoteFile(root, ".secret/deep.md", "# secret");
  await writeNoteFile(root, "Archive/Old.md", "## no h1\nbody");
  await writeNoteFile(root, "-root.md", "# root note");
  await writeNoteFile(root, "untitled.md", "# From Body\nbody");
};

describe("readFolderTree", () => {
  it("walks nested folders, skipping dotfiles, dot-directories and non-.md files", async () => {
    const root = await makeRoot();
    try {
      await seedFixture(root);

      const tree = await readFolderTree(root);

      expect(tree).toEqual({
        path: "",
        name: "Notebook",
        children: [
          { path: "Archive", name: "Archive", children: [] },
          {
            path: "Ideas",
            name: "Ideas",
            children: [{ path: "Ideas/2026", name: "2026", children: [] }],
          },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns just the root for an empty notebook", async () => {
    const root = await makeRoot();
    try {
      expect(await readFolderTree(root)).toEqual({ path: "", name: "Notebook", children: [] });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("listAllNotes", () => {
  it("lists notes recursively, excluding the hidden and non-.md entries", async () => {
    const root = await makeRoot();
    try {
      await seedFixture(root);

      const notes = await listAllNotes(root);

      expect(notes.map((note) => note.id).sort()).toEqual([
        "-root.md",
        "Archive/Old.md",
        "Ideas/2026/plan.md",
        "untitled.md",
      ]);

      const plan = notes.find((note) => note.id === "Ideas/2026/plan.md");
      expect(plan?.title).toBe("plan"); // the name wins over the H1 (SPEC §9.1)
      expect(plan?.folder).toBe("Ideas/2026");
      expect(plan?.preview).toBe("# Plan some body");
      expect(plan?.content).toBeUndefined();

      // the one case that takes its title from the body
      const named = notes.find((note) => note.id === "untitled.md");
      expect(named?.title).toBe("From Body");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("sorts updatedAt descending, ties broken by id ascending", async () => {
    const root = await makeRoot();
    try {
      await writeNoteFile(root, "a.md", "# a");
      await writeNoteFile(root, "b.md", "# b");
      await writeNoteFile(root, "c.md", "# c");

      const base = new Date(1_700_000_000_000);
      const newer = new Date(base.getTime() + 10_000);
      await utimes(join(root, "a.md"), newer, newer);
      await utimes(join(root, "b.md"), base, base);
      await utimes(join(root, "c.md"), base, base);

      const notes = await listAllNotes(root);

      expect(notes.map((note) => note.id)).toEqual(["a.md", "b.md", "c.md"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
