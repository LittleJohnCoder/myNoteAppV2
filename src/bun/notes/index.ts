/**
 * The notes layer's barrel (SPEC §3) — the exact ten functions `src/bun/index.ts` wires as RPC
 * handlers (SPEC §5), so the main process imports one module and never reaches past it.
 */
export { listAllNotes, readFolderTree } from "./tree";
export { readNote } from "./read";
export {
  createFolder,
  createNote,
  deleteFolder,
  deleteNote,
  moveNote,
  renameFolder,
  writeNote,
} from "./write";
