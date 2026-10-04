import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { NotesHandlers } from "./index";
import {
  createFolder,
  createNote,
  deleteFolder,
  deleteNote,
  listAllNotes,
  moveNote,
  readFolderTree,
  readNote,
  renameFolder,
  writeNote,
} from "./notes";

/**
 * Phase 3 boot smoke (todo.md's Verification list) — **temporary dev scaffolding**, to be
 * deleted once Phase 4 drives the methods through the UI for real.
 *
 * It is the only Phase 3 channel that reaches the ten methods against the *real* notebook:
 * `bun test` drives the pure layer inside a `mkdtemp` fixture, while this drives the barrel
 * functions (checks 1–13, every SPEC §9.1 ruling) and the handler map (checks 14–17, the wiring
 * `src/bun/index.ts` actually writes). Nothing here crosses the wire — Phase 2 proved the bridge.
 *
 * Printed form, exactly one line per check: `[smoke] N ok — <observed>` or
 * `[smoke] N FAIL — expected <x>, saw <y>`. A single FAIL means the phase is not done.
 */

export interface Phase3SmokeContext {
  dir: string;
  handlers: NotesHandlers;
}

type Check = { ok: boolean; observed: string; expected?: string };

const statOrNull = async (path: string): Promise<Awaited<ReturnType<typeof stat>> | null> => {
  try {
    return await stat(path);
  } catch {
    return null;
  }
};

const sortedIds = async (dir: string): Promise<string[]> =>
  (await listAllNotes(dir)).map((note) => note.id).sort();

export const runPhase3Smoke = async ({ dir, handlers }: Phase3SmokeContext): Promise<void> => {
  // The checks assume a clean notebook: on a populated one check 1 would produce `untitled1.md`
  // instead of `untitled.md` and every later expectation would drift. Say so and stay out of it.
  const existing = await readdir(dir).catch(() => [] as string[]);
  if (existing.length > 0) {
    console.log(
      `[smoke] skipped — the notebook is not empty (${existing.length} entr${
        existing.length === 1 ? "y" : "ies"
      }); the Phase 3 checks need a clean notebook`,
    );
    return;
  }

  const put = async (rel: string, content: string): Promise<void> => {
    const abs = join(dir, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
  };

  let failures = 0;

  /** Runs one check, guaranteeing exactly one line even if the check itself throws. */
  const check = async (n: number, run: () => Promise<Check>): Promise<void> => {
    try {
      const result = await run();
      if (!result.ok) failures += 1;
      if (result.ok) console.log(`[smoke] ${n} ok — ${result.observed}`);
      else console.log(`[smoke] ${n} FAIL — expected ${result.expected ?? "?"}, saw ${result.observed}`);
    } catch (error) {
      failures += 1;
      console.log(`[smoke] ${n} FAIL — threw ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  console.log("[smoke] Phase 3 checks — notes layer (1–13) then the handler map (14–17)");

  try {
    // 1 — createNote slugs the title into the filename and writes an empty file.
    await check(1, async () => {
      const created = await createNote(dir, "", "My Note");
      const file = await statOrNull(join(dir, "mynote.md"));
      const body = await readTextOrEmpty(join(dir, "mynote.md"));
      const ok =
        created.ok === true &&
        created.note?.id === "mynote.md" &&
        created.note?.title === "mynote" &&
        created.note?.preview === "" &&
        file?.isFile() === true &&
        file.size === 0 &&
        body === "";
      return {
        ok,
        observed: `id=${created.note?.id} title=${created.note?.title} preview=${JSON.stringify(
          created.note?.preview,
        )} bytes=${file?.size} body=${JSON.stringify(body)}`,
        expected: 'id=mynote.md title=mynote preview="" bytes=0 body=""',
      };
    });

    // 2 — the collision suffix, and the two untitled notes both titled `untitled`
    //     (`mynote.md` keeps its name — its stem is not the no-title pattern).
    await check(2, async () => {
      const first = await createNote(dir, "", "");
      const second = await createNote(dir, "", "");
      const notes = await listAllNotes(dir);
      const titleOf = (id: string): string | undefined => notes.find((note) => note.id === id)?.title;
      const ok =
        first.note?.id === "untitled.md" &&
        second.note?.id === "untitled1.md" &&
        titleOf("untitled.md") === "untitled" &&
        titleOf("untitled1.md") === "untitled" &&
        titleOf("mynote.md") === "mynote";
      return {
        ok,
        observed: `${first.note?.id}:${titleOf("untitled.md")} ${second.note?.id}:${titleOf(
          "untitled1.md",
        )} mynote.md:${titleOf("mynote.md")}`,
        expected: "untitled.md:untitled untitled1.md:untitled mynote.md:mynote",
      };
    });

    // 3 — a body H1 renames the *title* of an untitled note, never its file.
    await check(3, async () => {
      const saved = await writeNote(dir, "untitled.md", "# Hello, World!\n\nbody");
      const row = (await listAllNotes(dir)).find((note) => note.id === "untitled.md");
      const ok =
        saved.ok === true &&
        row?.title === "Hello, World!" &&
        row.preview.startsWith("# Hello, World!") &&
        row.id === "untitled.md";
      return {
        ok,
        observed: `id=${row?.id} title=${JSON.stringify(row?.title)} preview=${JSON.stringify(
          row?.preview,
        )}`,
        expected: 'id=untitled.md title="Hello, World!" preview starting "# Hello, World!"',
      };
    });

    // 4 — list order (updatedAt desc, id asc) and the row shape (no bodies in the list).
    await check(4, async () => {
      const notes = await listAllNotes(dir);
      const ordered = notes.every(
        (note, index) =>
          index === 0 ||
          notes[index - 1].updatedAt > note.updatedAt ||
          (notes[index - 1].updatedAt === note.updatedAt && notes[index - 1].id < note.id),
      );
      const shaped = notes.every(
        (note) =>
          typeof note.folder === "string" &&
          typeof note.title === "string" &&
          typeof note.preview === "string" &&
          !("content" in note),
      );
      return {
        ok: ordered && shaped && notes.length === 3,
        observed: `order=${ordered} shape=${shaped} rows=${notes.length}`,
        expected: "updatedAt desc / id asc, folder+title+preview and no content on all 3 rows",
      };
    });

    // 5 — the walk: dot-files and dot-directories skipped, non-.md ignored but its directory kept.
    await check(5, async () => {
      await put("Ideas/2026/plan.md", "# Plan\nbody");
      await put("Ideas/2026/other.md", "other body");
      await put("Ideas/notes.txt", "not a note");
      await put("Ideas/.hidden.md", "hidden");
      await put(".secret/deep.md", "secret");
      await put("Archive/Old.md", "## no h1\nbody");
      await put("-root.md", "# root note");

      const tree = await readFolderTree(dir);
      const words = JSON.stringify(tree.children.map((child) => child.path));
      const grandchild = JSON.stringify(tree.children[1]?.children.map((child) => child.path));
      const ok =
        tree.path === "" &&
        tree.name === "Notebook" &&
        words === JSON.stringify(["Archive", "Ideas"]) &&
        grandchild === JSON.stringify(["Ideas/2026"]);
      return {
        ok,
        observed: `name=${tree.name} children=${words} ideas.children=${grandchild}`,
        expected: 'name=Notebook children=["Archive","Ideas"] ideas.children=["Ideas/2026"]',
      };
    });

    // 6 — the full note list, and the name (not the H1) deciding `plan`'s title.
    await check(6, async () => {
      const ids = await sortedIds(dir);
      const expected = [
        "-root.md",
        "Archive/Old.md",
        "Ideas/2026/other.md",
        "Ideas/2026/plan.md",
        "mynote.md",
        "untitled.md",
        "untitled1.md",
      ].sort();
      const plan = (await listAllNotes(dir)).find((note) => note.id === "Ideas/2026/plan.md");
      const ok = JSON.stringify(ids) === JSON.stringify(expected) && plan?.title === "plan";
      return {
        ok,
        observed: `${JSON.stringify(ids)} plan.title=${JSON.stringify(plan?.title)}`,
        expected: `${JSON.stringify(expected)} plan.title="plan"`,
      };
    });

    // 7 — openNote returns the body; a missing note is `null`, not an error.
    await check(7, async () => {
      const found = await readNote(dir, "Ideas/2026/plan.md");
      const missing = await readNote(dir, "nope/missing.md");
      const ok = found?.content === "# Plan\nbody" && missing === null;
      return {
        ok,
        observed: `content=${JSON.stringify(found?.content)} missing=${JSON.stringify(missing)}`,
        expected: 'content="# Plan\\nbody" missing=null',
      };
    });

    // 8 — createFolder does not slug, does not build missing parents, refuses a sibling.
    await check(8, async () => {
      const created = await createFolder(dir, "Ideas", "Drafts");
      const duplicate = await createFolder(dir, "Ideas", "Drafts");
      const noParent = await createFolder(dir, "Missing", "Child");
      const ok =
        created.ok === true &&
        created.path === "Ideas/Drafts" &&
        duplicate.ok === false &&
        duplicate.error === "already exists" &&
        noParent.error === "not found";
      return {
        ok,
        observed: `create=${created.path} duplicate=${duplicate.error} missingParent=${noParent.error}`,
        expected: 'create=Ideas/Drafts duplicate="already exists" missingParent="not found"',
      };
    });

    // 9 — a note inside the folder, then deleteFolder refuses it (and leaves it on disk).
    await check(9, async () => {
      const created = await createNote(dir, "Ideas/Drafts", "Draft");
      const refused = await deleteFolder(dir, "Ideas/Drafts");
      const stillThere = (await statOrNull(join(dir, "Ideas/Drafts")))?.isDirectory() === true;
      const ok =
        created.note?.id === "Ideas/Drafts/draft.md" &&
        refused.ok === false &&
        refused.error === "folder not empty" &&
        stillThere;
      return {
        ok,
        observed: `id=${created.note?.id} delete=${JSON.stringify(refused.error)} onDisk=${stillThere}`,
        expected: 'id=Ideas/Drafts/draft.md delete="folder not empty" onDisk=true',
      };
    });

    // 10 — delete the note, the repeat is `not found`, and the folder can now go.
    await check(10, async () => {
      const deleted = await deleteNote(dir, "Ideas/Drafts/draft.md");
      const repeat = await deleteNote(dir, "Ideas/Drafts/draft.md");
      const folder = await deleteFolder(dir, "Ideas/Drafts");
      const ok = deleted.ok === true && repeat.error === "not found" && folder.ok === true;
      return {
        ok,
        observed: `delete=${deleted.ok} repeat=${JSON.stringify(repeat.error)} folder=${folder.ok}`,
        expected: 'delete=true repeat="not found" folder=true',
      };
    });

    // 11 — moveNote re-ids the note; a move into its own folder is a no-op that touches no disk.
    await check(11, async () => {
      const moved = await moveNote(dir, "Ideas/2026/plan.md", "Archive");
      const atNewPath = (await statOrNull(join(dir, "Archive/plan.md")))?.isFile() === true;
      const oldGone = (await readNote(dir, "Ideas/2026/plan.md")) === null;
      const beforeNoop = (await statOrNull(join(dir, "Archive/plan.md")))?.mtimeMs;
      const noop = await moveNote(dir, "Archive/plan.md", "Archive");
      const afterNoop = (await statOrNull(join(dir, "Archive/plan.md")))?.mtimeMs;
      const ok =
        moved.ok === true &&
        moved.newId === "Archive/plan.md" &&
        atNewPath &&
        oldGone &&
        noop.ok === true &&
        noop.newId === "Archive/plan.md" &&
        beforeNoop === afterNoop;
      return {
        ok,
        observed: `newId=${moved.newId} atNewPath=${atNewPath} oldGone=${oldGone} noop=${noop.newId} mtimeUnchanged=${
          beforeNoop === afterNoop
        }`,
        expected: "newId=Archive/plan.md atNewPath=true oldGone=true noop=Archive/plan.md mtimeUnchanged=true",
      };
    });

    // 12 — renameFolder re-ids every descendant (only other.md sits below Ideas by now).
    await check(12, async () => {
      const renamed = await renameFolder(dir, "Ideas", "Notes");
      const expected = [{ from: "Ideas/2026/other.md", to: "Notes/2026/other.md" }];
      const opened = await readNote(dir, "Notes/2026/other.md");
      const old = await readNote(dir, "Ideas/2026/other.md");
      const ok =
        renamed.ok === true &&
        JSON.stringify(renamed.changedIds) === JSON.stringify(expected) &&
        opened?.id === "Notes/2026/other.md" &&
        old === null;
      return {
        ok,
        observed: `path=${renamed.path} changedIds=${JSON.stringify(renamed.changedIds)} toOpens=${
          opened?.id
        } fromOpens=${JSON.stringify(old)}`,
        expected: `path=Notes changedIds=${JSON.stringify(expected)} toOpens=Notes/2026/other.md fromOpens=null`,
      };
    });

    // 13 — path safety: rejected, not normalised, and nothing lands outside the notebook.
    await check(13, async () => {
      const parentBefore = (await readdir(join(dir, ".."))).sort().join("|");
      const traversalId = await writeNote(dir, "../x.md", "x");
      const absoluteId = await readNote(dir, "/etc/passwd");
      const traversalFolder = await createFolder(dir, "Ideas/../../x.md", "y");
      const separatorName = await createFolder(dir, "", "a/b");
      const rootDelete = await deleteFolder(dir, "");
      const parentAfter = (await readdir(join(dir, ".."))).sort().join("|");
      const ok =
        traversalId.error === "invalid id" &&
        absoluteId === null &&
        traversalFolder.error === "invalid name" &&
        separatorName.error === "invalid name" &&
        rootDelete.error === "invalid name" &&
        parentBefore === parentAfter;
      return {
        ok,
        observed: `id=${JSON.stringify(traversalId.error)} abs=${JSON.stringify(
          absoluteId,
        )} folder=${JSON.stringify(traversalFolder.error)} name=${JSON.stringify(
          separatorName.error,
        )} root=${JSON.stringify(rootDelete.error)} outsideTouched=${parentBefore !== parentAfter}`,
        expected:
          'id="invalid id" abs=null folder="invalid name" name="invalid name" root="invalid name" outsideTouched=false',
      };
    });

    // 14 — the handler map is exactly the ten SPEC §7 methods, all async.
    await check(14, async () => {
      const expected = [
        "getAllNotes",
        "getFolders",
        "openNote",
        "saveNote",
        "createNote",
        "deleteNote",
        "createFolder",
        "deleteFolder",
        "moveNote",
        "renameFolder",
      ].sort();
      const keys = Object.keys(handlers).sort();
      const allAsync = Object.values(handlers).every(
        (handler) => handler.constructor.name === "AsyncFunction",
      );
      const ok = JSON.stringify(keys) === JSON.stringify(expected) && allAsync;
      return {
        ok,
        observed: `keys=${JSON.stringify(keys)} allAsync=${allAsync}`,
        expected: `${JSON.stringify(expected)} allAsync=true`,
      };
    });

    // 15 — every handler driven once: the wiring test (a misnamed param fails here, nowhere else).
    await check(15, async () => {
      const created = await handlers.createNote({ folder: "", title: "Handler Probe" });
      const id = created.note?.id ?? "";
      const opened = await handlers.openNote({ id });
      const saved = await handlers.saveNote({ id, content: "# Handler Probe\nsaved" });
      const listed = (await handlers.getAllNotes({})).find((note) => note.id === id);
      const folder = await handlers.createFolder({ parent: "", name: "HandlerFolder" });
      const moved = await handlers.moveNote({ id, targetFolder: "HandlerFolder" });
      const renamed = await handlers.renameFolder({
        path: "HandlerFolder",
        name: "HandlerFolderRenamed",
      });
      const tree = await handlers.getFolders({});
      const noteGone = await handlers.deleteNote({ id: "HandlerFolderRenamed/handlerprobe.md" });
      const folderGone = await handlers.deleteFolder({ path: "HandlerFolderRenamed" });

      const expectedChanges = [
        {
          from: "HandlerFolder/handlerprobe.md",
          to: "HandlerFolderRenamed/handlerprobe.md",
        },
      ];
      const ok =
        created.ok === true &&
        id === "handlerprobe.md" &&
        typeof opened?.content === "string" &&
        saved.ok === true &&
        typeof saved.updatedAt === "number" &&
        listed !== undefined &&
        !("content" in (listed ?? {})) &&
        folder.ok === true &&
        folder.path === "HandlerFolder" &&
        moved.ok === true &&
        moved.newId === "HandlerFolder/handlerprobe.md" &&
        renamed.ok === true &&
        JSON.stringify(renamed.changedIds) === JSON.stringify(expectedChanges) &&
        tree.path === "" &&
        tree.name === "Notebook" &&
        noteGone.ok === true &&
        folderGone.ok === true;
      return {
        ok,
        observed: `create=${id} openNote.content=${typeof opened?.content} save=${
          saved.updatedAt
        } listHasBody=${"content" in (listed ?? {})} folder=${folder.path} moved=${moved.newId} changedIds=${JSON.stringify(
          renamed.changedIds,
        )} root=${tree.name} deleted=${noteGone.ok}/${folderGone.ok}`,
        expected: `create=handlerprobe.md openNote.content=string save=<ms> listHasBody=false folder=HandlerFolder moved=HandlerFolder/handlerprobe.md changedIds=${JSON.stringify(
          expectedChanges,
        )} root=Notebook deleted=true/true`,
      };
    });

    // 16 — ANY directory entry blocks a delete, not just notes (a stray .DS_Store counts).
    await check(16, async () => {
      await handlers.createFolder({ parent: "", name: "HandlerFolder2" });
      await writeFile(join(dir, "HandlerFolder2", ".DS_Store"), "");
      const refused = await handlers.deleteFolder({ path: "HandlerFolder2" });
      const stillThere = (await statOrNull(join(dir, "HandlerFolder2")))?.isDirectory() === true;
      await rm(join(dir, "HandlerFolder2", ".DS_Store"), { force: true });
      const allowed = await handlers.deleteFolder({ path: "HandlerFolder2" });
      const ok =
        refused.ok === false &&
        refused.error === "folder not empty" &&
        stillThere &&
        allowed.ok === true;
      return {
        ok,
        observed: `withDotfile=${JSON.stringify(refused.error)} onDisk=${stillThere} afterRemoval=${allowed.ok}`,
        expected: 'withDotfile="folder not empty" onDisk=true afterRemoval=true',
      };
    });

    // 17 — a case-only folder rename is legal on APFS, not a collision, and the ids follow.
    await check(17, async () => {
      await handlers.createFolder({ parent: "", name: "CaseDir" });
      await writeFile(join(dir, "CaseDir/n.md"), "body", "utf8");
      const renamed = await handlers.renameFolder({ path: "CaseDir", name: "casedir" });
      const opened = await handlers.openNote({ id: "casedir/n.md" });
      const expected = [{ from: "CaseDir/n.md", to: "casedir/n.md" }];
      const ok =
        renamed.ok === true &&
        JSON.stringify(renamed.changedIds) === JSON.stringify(expected) &&
        opened?.content === "body";
      return {
        ok,
        observed: `ok=${renamed.ok} path=${renamed.path} changedIds=${JSON.stringify(
          renamed.changedIds,
        )} opened=${JSON.stringify(opened?.content)}`,
        expected: `ok=true path=casedir changedIds=${JSON.stringify(expected)} opened="body"`,
      };
    });
  } finally {
    // The notebook was empty going in, so everything in it now is this smoke's litter.
    for (const entry of await readdir(dir).catch(() => [] as string[])) {
      await rm(join(dir, entry), { recursive: true, force: true });
    }
    console.log(
      `[smoke] done — ${failures} failure(s); notebook cleared (checks 1–17 done, 18 is \`bun run test\`)`,
    );
  }
};

/** Reads a file's text, answering `""` when it is missing (keeps check 1 to a single expression). */
const readTextOrEmpty = async (path: string): Promise<string> => {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
};
