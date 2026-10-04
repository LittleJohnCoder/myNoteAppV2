import type { Stats } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * Id ↔ path mapping and containment (SPEC §9.1). Pure string work except `isContained`, which
 * has to touch the filesystem to see through symlinks, and `statOrNull`, an existence probe the
 * mutating layer shares.
 *
 * Every rejection in §9.1 is a *validation* here — ids, names and folder paths that can escape
 * the notebook are rejected, never silently normalised, so the caller's key never goes stale.
 */

/** The §9.1 failure vocabulary. Expected failures are returned, never thrown. */
export const INVALID_ID = "invalid id";
export const INVALID_NAME = "invalid name";
export const NOT_FOUND = "not found";
export const ALREADY_EXISTS = "already exists";
export const FOLDER_NOT_EMPTY = "folder not empty";

/** The notebook root's id/folder path — `""` (SPEC §9.1). */
export const ROOT_PATH = "";
/** The root node's name is fixed, not derived from the userData path (SPEC §9.1). */
export const ROOT_NAME = "Notebook";

export const NOTE_EXTENSION = ".md";

/** A note id ends in `.md`, compared case-insensitively (SPEC §9.1). */
export const isNoteId = (id: string): boolean => id.toLowerCase().endsWith(NOTE_EXTENSION);

const hasForbiddenSegment = (segments: string[]): boolean =>
  segments.some((segment) => segment === "" || segment === "." || segment === "..");

/**
 * Syntax-only id check (SPEC §9.1): `/`-separated, non-empty, relative, no empty/`.`/`..`
 * segment and no NUL. Containment is a separate, filesystem-aware step (`isContained`).
 */
export const isValidId = (id: string): boolean => {
  if (typeof id !== "string" || id.length === 0) return false;
  if (id.includes("\0")) return false;
  if (isAbsolute(id)) return false;
  if (id.endsWith("/")) return false;
  return !hasForbiddenSegment(id.split("/"));
};

/** A folder-path param (`folder`, `parent`, `path`, `targetFolder`); `""` is the root. */
export const isValidFolderPath = (folderPath: string): boolean =>
  folderPath === ROOT_PATH || isValidId(folderPath);

/** A single file/folder name: non-empty, no separators, no `.`/`..`, no NUL (SPEC §9.1). */
export const isValidName = (name: string): boolean => {
  if (typeof name !== "string" || name.length === 0) return false;
  if (name.includes("\0") || name.includes("/") || name.includes("\\")) return false;
  return name !== "." && name !== "..";
};

/** The folder part of an id — `"Ideas/2026/plan.md"` → `"Ideas/2026"`, `""` at the root. */
export const folderOfId = (id: string): string => {
  const cut = id.lastIndexOf("/");
  return cut === -1 ? "" : id.slice(0, cut);
};

/** The last segment of an id — the filename, extension included. */
export const nameOfId = (id: string): string => id.slice(id.lastIndexOf("/") + 1);

/** Join a folder path and a name into an id (`""` folder yields the bare name). */
export const joinId = (folder: string, name: string): string => (folder === "" ? name : `${folder}/${name}`);

/** Absolute path of a note id. */
export const notePath = (dir: string, id: string): string => join(dir, id);

/** Absolute path of a folder path (`""` is `dir` itself). */
export const folderPath = (dir: string, folder: string): string => (folder === ROOT_PATH ? dir : join(dir, folder));

/** Notebook-relative, `/`-separated id for an absolute path under `dir`. */
export const idFromAbsolute = (dir: string, absolute: string): string =>
  relative(dir, absolute).split(sep).join("/");

/** `stat` that answers `null` instead of throwing when the path is absent. */
export const statOrNull = async (path: string): Promise<Stats | null> => {
  try {
    return await stat(path);
  } catch {
    return null;
  }
};

const isInside = (root: string, target: string): boolean =>
  target === root || target.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);

const realpathOrNull = async (path: string): Promise<string | null> => {
  try {
    return await realpath(path);
  } catch {
    return null;
  }
};

/**
 * Containment (SPEC §9.1): first the lexical `resolve()` test, then — because `..` is banned by
 * `isValidId` but a *symlink* is not — the real path of the nearest existing ancestor, so a link
 * inside the notebook cannot smuggle a target out of it.
 *
 * The leaf itself may not exist yet (a create/move target), and a non-existent path cannot be
 * realpath'd, which is why it is the nearest existing ancestor that gets resolved. The notebook
 * root is realpath'd too: on macOS `tmpdir()` is `/var/...` while its real path is
 * `/private/var/...`, so comparing a real target against a lexical root would always fail.
 */
export const isContained = async (dir: string, target: string): Promise<boolean> => {
  const lexicalRoot = resolve(dir);
  const lexicalTarget = resolve(target);
  if (!isInside(lexicalRoot, lexicalTarget)) return false;

  const realRoot = (await realpathOrNull(lexicalRoot)) ?? lexicalRoot;

  let ancestor = lexicalTarget;
  for (;;) {
    const real = await realpathOrNull(ancestor);
    if (real !== null) return isInside(realRoot, real);
    const parent = dirname(ancestor);
    if (parent === ancestor) return false;
    ancestor = parent;
  }
};
