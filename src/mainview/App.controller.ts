import { useEffect, useState } from "react";

import { announceViewReady, onNoteChanged } from "@/rpc";
import { getFolders } from "@/services/notes.service";

import type { FolderNode, NoteChangedPayload } from "../shared/types";
import { flattenFolderPaths } from "./utils/folderTree";

export interface AppController {
  folders: FolderNode | null;
  isLoading: boolean;
  loadError: string | null;
  rootLabel: string;
  folderPaths: string[];
  lastChangeLabel: string | null;
}

/**
 * The shell's logic (CODE_STYLE §6): loads the notebook tree through the service layer, and
 * mirrors the bun → view push into local state. Both are effects because both synchronise with
 * an external system — the RPC bridge (CODE_STYLE §7.3).
 */
export const useAppController = (): AppController => {
  const [folders, setFolders] = useState<FolderNode | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastChange, setLastChange] = useState<NoteChangedPayload | null>(null);

  useEffect(() => {
    let isActive = true;

    getFolders()
      .then((tree) => {
        if (isActive) setFolders(tree);
      })
      .catch((error: unknown) => {
        if (isActive) setLoadError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onNoteChanged((change) => {
      setLastChange(change);
    });

    // Tell bun the view is listening before it pushes anything at us.
    announceViewReady(window.location.href);

    return unsubscribe;
  }, []);

  const lastChangeLabel = lastChange
    ? `${lastChange.id} · ${new Date(lastChange.updatedAt).toLocaleTimeString()}`
    : null;

  return {
    folders,
    isLoading: folders === null && loadError === null,
    loadError,
    rootLabel: folders?.name ?? "",
    folderPaths: folders ? flattenFolderPaths(folders) : [],
    lastChangeLabel,
  };
};
