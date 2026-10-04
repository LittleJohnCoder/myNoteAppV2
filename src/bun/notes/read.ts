import { readFile } from "node:fs/promises";

import type { NoteMeta } from "../../shared/types";
import { buildNoteMeta } from "./meta";
import { isContained, isNoteId, isValidId, notePath, statOrNull } from "./paths";

/**
 * `openNote` — the only read that returns a body (SPEC §9.1). Reads return data and use `null` for
 * absence, so an invalid id, a path that escapes the notebook and a missing file all answer `null`
 * rather than throwing.
 */
export const readNote = async (dir: string, id: string): Promise<NoteMeta | null> => {
  if (!isValidId(id) || !isNoteId(id)) return null;

  const abs = notePath(dir, id);
  if (!(await isContained(dir, abs))) return null;

  const stats = await statOrNull(abs);
  if (!stats?.isFile()) return null;

  const body = await readFile(abs, "utf8");
  return { ...buildNoteMeta(id, body, Math.floor(stats.mtimeMs)), content: body };
};
