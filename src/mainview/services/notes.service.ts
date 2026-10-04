import { notes } from "@/rpc";

import type {
  CreateFolderResult,
  CreateNoteResult,
  FolderNode,
  MoveNoteResult,
  MutationResult,
  NoteMeta,
  RenameFolderResult,
  SaveNoteResult,
} from "../../shared/types";

/**
 * Framework-agnostic wrappers over the RPC client (CODE_STYLE §9.2). Controllers call these;
 * components never touch the client directly, and nothing outside `services/` + `rpc.ts` imports
 * it at all.
 *
 * All ten SPEC §7 methods are one-liners here — the shapes live in the schema, the behaviour in
 * the notes layer. Every call is a promise even though the data is local: the bridge is
 * asynchronous, so callers await (CODE_STYLE §9.1).
 */

export const getAllNotes = (): Promise<NoteMeta[]> => notes.getAllNotes({});

export const getFolders = (): Promise<FolderNode> => notes.getFolders({});

export const openNote = (id: string): Promise<NoteMeta | null> => notes.openNote({ id });

export const saveNote = (id: string, content: string): Promise<SaveNoteResult> =>
  notes.saveNote({ id, content });

export const createNote = (folder: string, title: string): Promise<CreateNoteResult> =>
  notes.createNote({ folder, title });

export const deleteNote = (id: string): Promise<MutationResult> => notes.deleteNote({ id });

export const createFolder = (parent: string, name: string): Promise<CreateFolderResult> =>
  notes.createFolder({ parent, name });

export const deleteFolder = (path: string): Promise<MutationResult> =>
  notes.deleteFolder({ path });

export const moveNote = (id: string, targetFolder: string): Promise<MoveNoteResult> =>
  notes.moveNote({ id, targetFolder });

export const renameFolder = (path: string, name: string): Promise<RenameFolderResult> =>
  notes.renameFolder({ path, name });
