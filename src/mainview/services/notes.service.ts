import { notes } from "@/rpc";

import type { FolderNode } from "../../shared/types";

/**
 * Framework-agnostic wrappers over the RPC client (CODE_STYLE §9.2). Controllers call these;
 * components never touch the client directly.
 *
 * Phase 2 ships only the one method whose bun handler exists — the other eight land with their
 * filesystem work in Phase 3 (see todo.md), each as a one-liner here. Every call is a promise:
 * the data is local but the bridge is still asynchronous.
 */

export const getFolders = (): Promise<FolderNode> => notes.getFolders({});
