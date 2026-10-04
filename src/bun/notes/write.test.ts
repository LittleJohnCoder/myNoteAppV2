import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readNote } from "./read";
import { listAllNotes } from "./tree";
import {
  createFolder,
  createNote,
  deleteFolder,
  deleteNote,
  moveNote,
  renameFolder,
  writeNote,
} from "./write";

const makeRoot = (): Promise<string> => mkdtemp(join(tmpdir(), "notes-write-"));

describe("createNote", () => {
  it("writes an empty .md at the expected path and returns its meta", async () => {
    const root = await makeRoot();
    try {
      const result = await createNote(root, "", "My Note");

      expect(result.ok).toBe(true);
      expect(result.note?.id).toBe("mynote.md"); // §9.1 alphanumeric slug
      expect(result.note?.folder).toBe("");
      expect(result.note?.title).toBe("mynote");
      expect(result.note?.preview).toBe("");
      expect(typeof result.note?.updatedAt).toBe("number");
      expect(await readFile(join(root, "mynote.md"), "utf8")).toBe("");
      // the created note is then listed with the same folder/title/preview
      expect((await listAllNotes(root)).map((note) => note.id)).toEqual(["mynote.md"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("names the default new note untitled, then untitled1, untitled2 …", async () => {
    const root = await makeRoot();
    try {
      const first = await createNote(root, "", "untitled");
      const second = await createNote(root, "", "untitled");
      const third = await createNote(root, "", "untitled");

      expect([first.note?.id, second.note?.id, third.note?.id]).toEqual([
        "untitled.md",
        "untitled1.md",
        "untitled2.md",
      ]);
      // none of the three has a name, so all three fall back to `untitled` (SPEC §9.1)
      expect([first.note?.title, second.note?.title, third.note?.title]).toEqual([
        "untitled",
        "untitled",
        "untitled",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("suffixes collisions with a plain number, the lowest free from 1", async () => {
    const root = await makeRoot();
    try {
      const a = await createNote(root, "", "Plan");
      const b = await createNote(root, "", "Plan");
      const c = await createNote(root, "", "Plan");

      expect([a.note?.id, b.note?.id, c.note?.id]).toEqual(["plan.md", "plan1.md", "plan2.md"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses a missing folder and a folder that escapes the notebook", async () => {
    const root = await makeRoot();
    try {
      expect((await createNote(root, "missing", "x")).error).toBe("not found");
      expect((await createNote(root, "../out", "x")).error).toBe("invalid name");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("writeNote / readNote", () => {
  it("rewrites the file and leaves no temp file behind", async () => {
    const root = await makeRoot();
    try {
      const created = await createNote(root, "", "Plan");
      const id = created.note!.id;

      const saved = await writeNote(root, id, "# Real Title\n\nbody text");
      expect(saved.ok).toBe(true);
      expect(typeof saved.updatedAt).toBe("number");

      expect(await readFile(join(root, id), "utf8")).toBe("# Real Title\n\nbody text");

      const opened = await readNote(root, id);
      // the name wins over the body's H1 (SPEC §9.1)
      expect(opened?.title).toBe("plan");
      expect(opened?.content).toBe("# Real Title\n\nbody text");

      const leftovers = (await readdir(root)).filter((name) => name.includes(".tmp-"));
      expect(leftovers).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("takes the title from the H1 once an untitled note gets one", async () => {
    const root = await makeRoot();
    try {
      const created = await createNote(root, "", "");
      const id = created.note!.id;
      expect(id).toBe("untitled.md");
      expect(created.note?.title).toBe("untitled");

      await writeNote(root, id, "# Now Named\n\nbody");
      expect((await readNote(root, id))?.title).toBe("Now Named");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns not found for a missing note and invalid id for a traversal", async () => {
    const root = await makeRoot();
    try {
      expect((await writeNote(root, "nope.md", "x")).error).toBe("not found");
      expect((await writeNote(root, "../escape.md", "x")).error).toBe("invalid id");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("deleteNote", () => {
  it("removes the file, then reports not found and an invalid id for a traversal", async () => {
    const root = await makeRoot();
    try {
      const created = await createNote(root, "", "Doomed");
      const id = created.note!.id;

      expect((await deleteNote(root, id)).ok).toBe(true);
      expect(await readNote(root, id)).toBeNull();
      expect((await deleteNote(root, id)).error).toBe("not found");
      expect((await deleteNote(root, "../escape.md")).error).toBe("invalid id");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("createFolder / deleteFolder", () => {
  it("creates nested folders and refuses a collision", async () => {
    const root = await makeRoot();
    try {
      expect(await createFolder(root, "", "Ideas")).toEqual({ ok: true, path: "Ideas" });
      expect(await createFolder(root, "Ideas", "2026")).toEqual({ ok: true, path: "Ideas/2026" });
      expect((await createFolder(root, "", "Ideas")).error).toBe("already exists");
      expect((await createFolder(root, "missing", "x")).error).toBe("not found");
      expect((await createFolder(root, "", "a/b")).error).toBe("invalid name");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses a non-empty folder and leaves it on disk, but deletes an empty one", async () => {
    const root = await makeRoot();
    try {
      await createFolder(root, "", "Ideas");
      await createNote(root, "Ideas", "Plan");

      const refused = await deleteFolder(root, "Ideas");
      expect(refused).toEqual({ ok: false, error: "folder not empty" });
      expect((await readNote(root, "Ideas/plan.md"))?.id).toBe("Ideas/plan.md");

      await deleteNote(root, "Ideas/plan.md");
      expect((await deleteFolder(root, "Ideas")).ok).toBe(true);
      expect(await readNote(root, "Ideas/plan.md")).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses the root and an escaping path", async () => {
    const root = await makeRoot();
    try {
      expect((await deleteFolder(root, "")).error).toBe("invalid name");
      expect((await deleteFolder(root, "../outside")).error).toBe("invalid name");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("moveNote", () => {
  it("relocates the file, returns the newId and makes the old id unresolvable", async () => {
    const root = await makeRoot();
    try {
      await createFolder(root, "", "Ideas");
      const created = await createNote(root, "", "Plan");
      const oldId = created.note!.id;

      const moved = await moveNote(root, oldId, "Ideas");

      expect(moved.ok).toBe(true);
      expect(moved.newId).toBe("Ideas/plan.md");
      expect(await readNote(root, oldId)).toBeNull();
      expect((await readNote(root, "Ideas/plan.md"))?.id).toBe("Ideas/plan.md");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("treats a move into the note's own folder as a no-op and refuses a collision", async () => {
    const root = await makeRoot();
    try {
      await createFolder(root, "", "Ideas");
      const a = await createNote(root, "", "Plan"); // plan.md at the root
      await createNote(root, "Ideas", "Plan"); // Ideas/plan.md — the collision target

      const same = await moveNote(root, a.note!.id, "");
      expect(same).toEqual({ ok: true, newId: "plan.md" });

      const collision = await moveNote(root, a.note!.id, "Ideas");
      expect(collision.error).toBe("already exists");
      // the refused move left the note where it was
      expect((await readNote(root, a.note!.id))?.id).toBe(a.note!.id);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses a missing target folder and an escaping target", async () => {
    const root = await makeRoot();
    try {
      const created = await createNote(root, "", "Plan");
      const id = created.note!.id;

      expect((await moveNote(root, id, "missing")).error).toBe("not found");
      expect((await moveNote(root, id, "../out")).error).toBe("invalid name");
      expect((await moveNote(root, "../escape.md", "")).error).toBe("invalid id");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("renameFolder", () => {
  it("returns changedIds covering every descendant, each opening the right file", async () => {
    const root = await makeRoot();
    try {
      await createFolder(root, "", "Ideas");
      await createFolder(root, "Ideas", "2026");
      await createNote(root, "Ideas/2026", "Plan");
      await createNote(root, "Ideas", "Top");

      const renamed = await renameFolder(root, "Ideas", "Thoughts");

      expect(renamed.ok).toBe(true);
      expect(renamed.path).toBe("Thoughts");
      expect(renamed.changedIds.map((change) => change.from).sort()).toEqual([
        "Ideas/2026/plan.md",
        "Ideas/top.md",
      ]);
      expect(renamed.changedIds.map((change) => change.to).sort()).toEqual([
        "Thoughts/2026/plan.md",
        "Thoughts/top.md",
      ]);
      expect((await readNote(root, "Thoughts/2026/plan.md"))?.id).toBe("Thoughts/2026/plan.md");
      expect((await readNote(root, "Thoughts/top.md"))?.id).toBe("Thoughts/top.md");
      expect(await readNote(root, "Ideas/2026/plan.md")).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns an empty changedIds when no note sits below", async () => {
    const root = await makeRoot();
    try {
      await createFolder(root, "", "Empty");
      expect((await renameFolder(root, "Empty", "Blank")).changedIds).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses a collision and the root, and allows a case-only rename", async () => {
    const root = await makeRoot();
    try {
      await createFolder(root, "", "Ideas");
      await createFolder(root, "", "Other");

      expect((await renameFolder(root, "Ideas", "Other")).error).toBe("already exists");
      expect((await renameFolder(root, "", "Root")).error).toBe("invalid name");

      const caseOnly = await renameFolder(root, "Ideas", "ideas");
      expect(caseOnly.ok).toBe(true);
      expect(caseOnly.path).toBe("ideas");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
