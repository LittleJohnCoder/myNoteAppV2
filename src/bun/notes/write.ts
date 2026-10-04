import { mkdir, readdir, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type {
  CreateFolderResult,
  CreateNoteResult,
  MoveNoteResult,
  MutationResult,
  RenameFolderResult,
  RenamedId,
  SaveNoteResult,
} from "../../shared/types";
import { buildNoteMeta, slugifyTitle } from "./meta";
import {
  ALREADY_EXISTS,
  FOLDER_NOT_EMPTY,
  INVALID_ID,
  INVALID_NAME,
  NOT_FOUND,
  folderOfId,
  folderPath,
  isContained,
  isNoteId,
  isValidFolderPath,
  isValidId,
  isValidName,
  joinId,
  nameOfId,
  notePath,
  statOrNull,
} from "./paths";
import { collectNoteIds } from "./tree";

/**
 * Every mutating endpoint (SPEC §9.1). Two rules run through all of them:
 *
 *   - expected failures are **returned** as `{ ok: false, error }`, never thrown; and
 *   - writes are atomic — a sibling temp file followed by `rename()`.
 */

/**
 * Temp file in the same directory, dot-prefixed **on purpose**: the §9.1 dotfile skip means a
 * walk can never surface a half-written note even if the process dies mid-write.
 */
const writeFileAtomic = async (absPath: string, content: string): Promise<void> => {
  const tmp = join(
    dirname(absPath),
    `.${basename(absPath)}.tmp-${process.pid}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
  );

  try {
    await writeFile(tmp, content, "utf8");
    await rename(tmp, absPath);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
};

/** `untitled.md`, then `untitled1.md`, `untitled2.md`, … — a plain number, the lowest free from 1. */
const uniqueNoteName = async (folderAbs: string, stem: string): Promise<string> => {
  for (let n = 0; ; n += 1) {
    const name = n === 0 ? `${stem}.md` : `${stem}${n}.md`;
    if (!(await statOrNull(join(folderAbs, name)))) return name;
  }
};

export const createNote = async (
  dir: string,
  folder: string,
  title: string,
): Promise<CreateNoteResult> => {
  if (!isValidFolderPath(folder)) return { ok: false, error: INVALID_NAME };

  const folderAbs = folderPath(dir, folder);
  if (!(await isContained(dir, folderAbs))) return { ok: false, error: INVALID_NAME };
  // `createNote` never creates folders — `createFolder` does (SPEC §9.1).
  if (!(await statOrNull(folderAbs))?.isDirectory()) return { ok: false, error: NOT_FOUND };

  const fileName = await uniqueNoteName(folderAbs, slugifyTitle(title));
  const abs = join(folderAbs, fileName);
  // A new note is written empty, so its title is the filename stem and its preview is "".
  await writeFileAtomic(abs, "");

  const id = joinId(folder, fileName);
  const stats = await statOrNull(abs);
  return { ok: true, note: buildNoteMeta(id, "", Math.floor(stats?.mtimeMs ?? Date.now())) };
};

export const writeNote = async (dir: string, id: string, content: string): Promise<SaveNoteResult> => {
  if (!isValidId(id) || !isNoteId(id)) return { ok: false, updatedAt: 0, error: INVALID_ID };

  const abs = notePath(dir, id);
  if (!(await isContained(dir, abs))) return { ok: false, updatedAt: 0, error: INVALID_ID };
  if (!(await statOrNull(abs))?.isFile()) return { ok: false, updatedAt: 0, error: NOT_FOUND };

  await writeFileAtomic(abs, content);

  const stats = await statOrNull(abs);
  return { ok: true, updatedAt: Math.floor(stats?.mtimeMs ?? Date.now()) };
};

export const deleteNote = async (dir: string, id: string): Promise<MutationResult> => {
  if (!isValidId(id) || !isNoteId(id)) return { ok: false, error: INVALID_ID };

  const abs = notePath(dir, id);
  if (!(await isContained(dir, abs))) return { ok: false, error: INVALID_ID };
  if (!(await statOrNull(abs))?.isFile()) return { ok: false, error: NOT_FOUND };

  await rm(abs);
  return { ok: true };
};

export const createFolder = async (
  dir: string,
  parent: string,
  name: string,
): Promise<CreateFolderResult> => {
  const fail = (error: string): CreateFolderResult => ({ ok: false, path: "", error });

  if (!isValidFolderPath(parent) || !isValidName(name)) return fail(INVALID_NAME);

  const parentAbs = folderPath(dir, parent);
  if (!(await isContained(dir, parentAbs))) return fail(INVALID_NAME);
  if (!(await statOrNull(parentAbs))?.isDirectory()) return fail(NOT_FOUND);

  const abs = join(parentAbs, name);
  if (await statOrNull(abs)) return fail(ALREADY_EXISTS);

  await mkdir(abs);
  return { ok: true, path: joinId(parent, name) };
};

export const deleteFolder = async (dir: string, path: string): Promise<MutationResult> => {
  // The root is not deletable, and `""` is not a valid folder name (SPEC §9.1).
  if (path === "" || !isValidFolderPath(path)) return { ok: false, error: INVALID_NAME };

  const abs = folderPath(dir, path);
  if (!(await isContained(dir, abs))) return { ok: false, error: INVALID_NAME };
  if (!(await statOrNull(abs))?.isDirectory()) return { ok: false, error: NOT_FOUND };

  // ANY entry counts as content — dotfiles and non-.md included (SPEC §9.1).
  const entries = await readdir(abs);
  if (entries.length > 0) return { ok: false, error: FOLDER_NOT_EMPTY };

  await rmdir(abs);
  return { ok: true };
};

export const moveNote = async (
  dir: string,
  id: string,
  targetFolder: string,
): Promise<MoveNoteResult> => {
  const fail = (error: string): MoveNoteResult => ({ ok: false, newId: "", error });

  if (!isValidId(id) || !isNoteId(id)) return fail(INVALID_ID);
  if (!isValidFolderPath(targetFolder)) return fail(INVALID_NAME);

  const fromAbs = notePath(dir, id);
  if (!(await isContained(dir, fromAbs))) return fail(INVALID_ID);
  if (!(await statOrNull(fromAbs))?.isFile()) return fail(NOT_FOUND);

  const targetAbs = folderPath(dir, targetFolder);
  if (!(await isContained(dir, targetAbs))) return fail(INVALID_NAME);
  if (!(await statOrNull(targetAbs))?.isDirectory()) return fail(NOT_FOUND);

  // A drop on the note's own folder is a no-op (SPEC §10.5) — touch no disk.
  if (folderOfId(id) === targetFolder) return { ok: true, newId: id };

  const name = nameOfId(id);
  const toAbs = join(targetAbs, name);
  if (await statOrNull(toAbs)) return fail(ALREADY_EXISTS);

  await rename(fromAbs, toAbs);
  return { ok: true, newId: joinId(targetFolder, name) };
};

export const renameFolder = async (
  dir: string,
  path: string,
  name: string,
): Promise<RenameFolderResult> => {
  const fail = (error: string): RenameFolderResult => ({ ok: false, path: "", changedIds: [], error });

  // The root cannot be renamed, and `""`/a separator is not a name (SPEC §9.1).
  if (path === "" || !isValidFolderPath(path) || !isValidName(name)) return fail(INVALID_NAME);

  const abs = folderPath(dir, path);
  if (!(await isContained(dir, abs))) return fail(INVALID_NAME);
  if (!(await statOrNull(abs))?.isDirectory()) return fail(NOT_FOUND);

  const parent = folderOfId(path);
  const toAbs = join(folderPath(dir, parent), name);

  // A case-only rename is legal on a case-insensitive filesystem, not a collision (SPEC §12).
  const isCaseOnly = abs.toLowerCase() === toAbs.toLowerCase();
  if (toAbs !== abs && !isCaseOnly && (await statOrNull(toAbs))) return fail(ALREADY_EXISTS);

  // Ids are paths, so every descendant's id changes — collect them before the move.
  const noteIds = await collectNoteIds(abs, path);
  await rename(abs, toAbs);

  const newPath = joinId(parent, name);
  const changedIds: RenamedId[] = noteIds.map((old) => ({
    from: old,
    to: `${newPath}${old.slice(path.length)}`,
  }));

  return { ok: true, path: newPath, changedIds };
};
