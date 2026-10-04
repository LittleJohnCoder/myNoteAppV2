import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import type { FolderNode, NoteMeta } from "../../shared/types";
import { buildNoteMeta, isMarkdown } from "./meta";
import { ROOT_NAME } from "./paths";

/**
 * The tree walk (SPEC §9.1): one pass over the notebook producing either the folder tree or the
 * note list. Dot-**files** and dot-**directories** are skipped at every depth; a non-`.md` file is
 * not a note, but its directory is still walked so nesting is not lost.
 */

type NoteVisitor = (absolutePath: string, id: string) => Promise<void>;

const isHidden = (name: string): boolean => name.startsWith(".");

const joinRel = (relPath: string, name: string): string => (relPath === "" ? name : `${relPath}/${name}`);

const walkNotes = async (absDir: string, relPath: string, visit: NoteVisitor): Promise<void> => {
  const entries = await readdir(absDir, { withFileTypes: true });

  for (const entry of entries) {
    if (isHidden(entry.name)) continue;

    const abs = join(absDir, entry.name);
    const rel = joinRel(relPath, entry.name);

    if (entry.isDirectory()) {
      await walkNotes(abs, rel, visit);
      continue;
    }
    if (!entry.isFile() || !isMarkdown(entry.name)) continue;

    await visit(abs, rel);
  }
};

/** Ids of every note under `absDir` (whose notebook-relative path is `relPath`). */
export const collectNoteIds = async (absDir: string, relPath: string): Promise<string[]> => {
  const ids: string[] = [];
  await walkNotes(absDir, relPath, async (_abs, id) => {
    ids.push(id);
  });
  return ids;
};

const collator = new Intl.Collator(undefined, { sensitivity: "base" });

const byFolderName = (a: FolderNode, b: FolderNode): number => collator.compare(a.name, b.name);

const childFolders = async (absDir: string, relPath: string): Promise<FolderNode[]> => {
  const entries = await readdir(absDir, { withFileTypes: true });
  const folders: FolderNode[] = [];

  for (const entry of entries) {
    if (isHidden(entry.name) || !entry.isDirectory()) continue;

    const rel = joinRel(relPath, entry.name);
    const children = await childFolders(join(absDir, entry.name), rel);
    folders.push({ path: rel, name: entry.name, children });
  }

  // SPEC §9.1: children are `name` ascending, locale-aware and case-insensitive.
  return folders.sort(byFolderName);
};

/** The whole folder tree, rooted at the fixed `Notebook` node (SPEC §9.1). */
export const readFolderTree = async (dir: string): Promise<FolderNode> => ({
  path: "",
  name: ROOT_NAME,
  children: await childFolders(dir, ""),
});

const byMostRecent = (a: NoteMeta, b: NoteMeta): number => {
  if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** Every note's meta, `updatedAt` descending with `id` ascending as the tie-break (SPEC §9.1). */
export const listAllNotes = async (dir: string): Promise<NoteMeta[]> => {
  const notes: NoteMeta[] = [];

  await walkNotes(dir, "", async (abs, id) => {
    const [body, stats] = await Promise.all([readFile(abs, "utf8"), stat(abs)]);
    notes.push(buildNoteMeta(id, body, Math.floor(stats.mtimeMs)));
  });

  return notes.sort(byMostRecent);
};
