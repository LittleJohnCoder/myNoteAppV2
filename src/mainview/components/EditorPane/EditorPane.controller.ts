import { useCallback, useEffect, useRef, useState } from "react";

import { createEditor, type EditorHandle } from "@/editor/createEditor";
import { SAVE_DEBOUNCE_MS } from "@/editor/extensions";
import { onViewContext } from "@/rpc";
import { createNote, openNote, saveNote } from "@/services/notes.service";
import { useClearDraft, useDraftFolder, useDraftToken } from "@/store/draftNote";
import { useSetEditorCounts } from "@/store/editorStats";
import { useSelectNote, useSelectedNoteId } from "@/store/selectedNote";
import { useNoteTheme } from "@/store/theme";
import { countDocument } from "@/utils/documentCounts";
import { errorMessage } from "@/utils/errorMessage";

import type { EditorView } from "@codemirror/view";
import type { RefObject } from "react";

export interface EditorPaneController {
  hostRef: RefObject<HTMLDivElement>;
  title: string;
  isTitleReadOnly: boolean;
  focusToken: number | null;
  isDraft: boolean;
  isDirty: boolean;
  noteId: string | null;
  /** A note or a draft is open — the title field and the body have something to show (§10.1). */
  hasDocument: boolean;
  error: string | null;
  handleTitleChange: (value: string) => void;
  handleCommitTitle: (options: { moveToBody: boolean }) => void;
}

/**
 * The editor pane's logic: which note is open, the draft that has no file yet, the save cadence,
 * and the title field (SPEC §10.1, §10.5, §9.1).
 *
 * The editor's document lives in `EditorState` (CODE_STYLE §8.5), so this hook is the only thing
 * that reads or writes it; the component renders around it. Three rules shape the code below:
 *
 *   - **The pane is driven by the stores**, never by a prop: `selectedNoteId` says which note is
 *     open and `draftNote` says a new one is being started (§10.5).
 *   - **One write per file.** A draft materialises exactly once — on the title commit, or on the
 *     first body save with `title: ""` — and the editor then binds to the id the layer *returned*
 *     (`plan1.md` when `plan.md` collided), never to a name it guessed (§10.5).
 *   - **A pending save is flushed before the pane changes note** (§9.1), and a result that arrives
 *     after the selection moved is dropped, so a switch mid-save cannot mark the wrong note clean.
 */
export const useEditorPaneController = (): EditorPaneController => {
  const selectedNoteId = useSelectedNoteId();
  const selectNote = useSelectNote();
  const draftFolder = useDraftFolder();
  const draftToken = useDraftToken();
  const clearDraft = useClearDraft();
  const theme = useNoteTheme();
  const setCounts = useSetEditorCounts();

  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorHandle | null>(null);

  /** The id the editor's document belongs to; `null` while a draft has no file yet. */
  const boundIdRef = useRef<string | null>(null);
  /** A draft is open and unwritten — the flag the first body save keys off ("" is a valid folder). */
  const draftActiveRef = useRef(false);
  /** The folder a draft will be created in, captured at bind time. */
  const draftFolderRef = useRef("");
  /** An id this hook just created: its document is already loaded, so the pane must not reload it. */
  const createdRef = useRef<string | null>(null);
  /** The body save the debounce is holding, with the id it belongs to (§9.1). */
  const pendingRef = useRef<{ id: string; content: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** One create at a time: Enter commits and then the field blurs, which would create twice. */
  const isCreatingRef = useRef(false);
  const themeRef = useRef(theme);

  const [title, setTitle] = useState("");
  const [isTitleReadOnly, setTitleReadOnly] = useState(true);
  const [isDirty, setDirty] = useState(false);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [isDraft, setDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearTimer = useCallback((): void => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  /** Writes whatever the debounce is holding, now (§9.1's "flush before the pane changes note"). */
  const flush = useCallback(async (): Promise<void> => {
    clearTimer();
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;

    try {
      const result = await saveNote(pending.id, pending.content);
      if (!result.ok) {
        setError(result.error ?? "The note was not saved");
        return;
      }
      setError(null);
      // Drop the result if the selection moved while the write was in flight (§10.5): the file did
      // get its own text, but the pane now belongs to another note and is not the one that is clean.
      if (boundIdRef.current === pending.id) setDirty(false);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, [clearTimer]);

  const schedule = useCallback(
    (id: string, content: string): void => {
      pendingRef.current = { id, content };
      clearTimer();
      timerRef.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [clearTimer, flush],
  );

  /**
   * The first body save of a draft (§10.5): the note is created with `title: ""`, so its name comes
   * from the layer's own collision rule (`untitled`, `untitled1`, …) and never from the renderer.
   * The queued content is written by the selection effect's flush, which is also what leaves the
   * pane clean.
   */
  const createFromDraft = useCallback(
    async (content: string): Promise<void> => {
      if (isCreatingRef.current) return;
      isCreatingRef.current = true;
      try {
        const result = await createNote(draftFolderRef.current, "");
        if (!result.ok || !result.note) {
          setError(result.error ?? "The note was not created");
          return;
        }
        const id = result.note.id;
        createdRef.current = id;
        boundIdRef.current = id;
        draftActiveRef.current = false;
        pendingRef.current = { id, content };
        setNoteId(id);
        setDraft(false);
        setTitle(result.note.title);
        setTitleReadOnly(true);
        setCounts(countDocument(content));
        setError(null);
        selectNote(id);
        clearDraft();
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        isCreatingRef.current = false;
      }
    },
    [clearDraft, selectNote, setCounts],
  );

  const handleEditorChange = useCallback(
    (view: EditorView): void => {
      const content = view.state.doc.toString();

      if (boundIdRef.current) {
        setDirty(true);
        setCounts(countDocument(content));
        schedule(boundIdRef.current, content);
        return;
      }

      if (!draftActiveRef.current) return;

      // A draft has no id yet, so this is the save that creates it — and it never runs on empty
      // content, or walking into the body would leave a file behind (§10.5).
      setDirty(true);
      setCounts(null);
      if (content.trim().length === 0) return;
      clearTimer();
      timerRef.current = setTimeout(() => void createFromDraft(content), SAVE_DEBOUNCE_MS);
    },
    [clearTimer, createFromDraft, schedule, setCounts],
  );

  const handleEditorBlur = useCallback((): void => {
    if (boundIdRef.current) {
      void flush();
      return;
    }
    if (!draftActiveRef.current) return;

    const content = editorRef.current?.readDocument() ?? "";
    if (content.trim().length === 0) return;
    clearTimer();
    void createFromDraft(content);
  }, [clearTimer, createFromDraft, flush]);

  /** Enter / Tab / blur, identically (§10.5): the file exists before the caret reaches the body. */
  const handleCommitTitle = useCallback(
    (options: { moveToBody: boolean }): void => {
      const moveToBody = (): void => {
        if (options.moveToBody) editorRef.current?.focusDocument();
      };

      if (boundIdRef.current) {
        moveToBody();
        return;
      }
      if (!draftActiveRef.current) return;

      const name = title.trim();
      if (name.length === 0) {
        // An empty field commits to nothing but the caret move — the "nothing created yet" case.
        moveToBody();
        return;
      }
      if (isCreatingRef.current) return;
      isCreatingRef.current = true;

      void (async () => {
        // Whatever the body was holding is created by *this* note, not by a second `untitled.md`:
        // the pending draft-create is dropped and its text is queued against the new id instead.
        clearTimer();
        const body = editorRef.current?.readDocument() ?? "";
        try {
          const result = await createNote(draftFolderRef.current, name);
          if (!result.ok || !result.note) {
            setError(result.error ?? "The note was not created");
            return;
          }
          const id = result.note.id;
          createdRef.current = id;
          boundIdRef.current = id;
          draftActiveRef.current = false;
          if (body.trim().length > 0) pendingRef.current = { id, content: body };
          setNoteId(id);
          setDraft(false);
          setTitle(result.note.title);
          setTitleReadOnly(true);
          setCounts(countDocument(body));
          setError(null);
          selectNote(id);
          clearDraft();
          moveToBody();
        } catch (cause) {
          setError(errorMessage(cause));
        } finally {
          isCreatingRef.current = false;
        }
      })();
    },
    [clearDraft, clearTimer, selectNote, setCounts, title],
  );

  // The editor is created once and lives for the pane's lifetime; the callbacks are read through
  // refs so a new closure never re-creates the view (which would drop the document).
  const changeHandlerRef = useRef(handleEditorChange);
  const blurHandlerRef = useRef(handleEditorBlur);

  useEffect(() => {
    changeHandlerRef.current = handleEditorChange;
    blurHandlerRef.current = handleEditorBlur;
  }, [handleEditorBlur, handleEditorChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const handle = createEditor({
      parent: host,
      doc: "",
      theme: themeRef.current,
      onChange: (view) => changeHandlerRef.current(view),
      onBlur: () => blurHandlerRef.current(),
    });
    editorRef.current = handle;

    return () => {
      handle.destroy();
      editorRef.current = null;
      boundIdRef.current = null;
      draftActiveRef.current = false;
      pendingRef.current = null;
    };
  }, []);

  /** SPEC §10.1: the theme drives the hybrid plugin as well as `<html data-theme>` (§11.3). */
  useEffect(() => {
    if (themeRef.current === theme) return;
    themeRef.current = theme;
    editorRef.current?.applyTheme(theme);
  }, [theme]);

  /**
   * SPEC §10.1/§10.6's dev-only read-back: bun tells the view which channel it is running in (a
   * fire-and-forget push is only safe after the view announced itself, §15.21), and only `dev`
   * publishes the handle — that is the only way any probe can read or drive this editor.
   */
  useEffect(() => {
    const unsubscribe = onViewContext(({ channel }) => {
      window.__notesEditor = channel === "dev" ? (editorRef.current?.view ?? null) : null;
    });
    return () => {
      unsubscribe();
      window.__notesEditor = null;
    };
  }, []);

  /**
   * Binding. The flush comes first so a pending body save lands **before** the pane moves on
   * (§9.1), and a draft outranks a selection: it is the user's newer intent (§10.5).
   */
  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      await flush();
      if (isCancelled) return;

      const handle = editorRef.current;
      if (!handle) return;

      if (draftFolder !== null) {
        boundIdRef.current = null;
        draftActiveRef.current = true;
        draftFolderRef.current = draftFolder;
        pendingRef.current = null;
        handle.loadDocument("");
        setNoteId(null);
        setDraft(true);
        setTitle("");
        setTitleReadOnly(false);
        setDirty(false);
        setCounts(null);
        setError(null);
        return;
      }

      if (selectedNoteId === null) {
        boundIdRef.current = null;
        draftActiveRef.current = false;
        pendingRef.current = null;
        handle.loadDocument("");
        setNoteId(null);
        setDraft(false);
        setTitle("");
        setTitleReadOnly(true);
        setDirty(false);
        setCounts(null);
        return;
      }

      if (createdRef.current === selectedNoteId) {
        // Just created from a draft: this document is already in the editor, and reloading it would
        // reset the caret for nothing (§10.5).
        createdRef.current = null;
        draftActiveRef.current = false;
        return;
      }

      try {
        const note = await openNote(selectedNoteId);
        if (isCancelled) return;
        if (!note) {
          setError(`${selectedNoteId} is no longer on disk`);
          return;
        }
        const content = note.content ?? "";
        boundIdRef.current = note.id;
        draftActiveRef.current = false;
        handle.loadDocument(content);
        setNoteId(note.id);
        setDraft(false);
        setTitle(note.title);
        setTitleReadOnly(true);
        setDirty(false);
        setCounts(countDocument(content));
        setError(null);
        // SPEC §10.1: opening an existing note puts the caret in the body, at line 1.
        handle.focusDocument();
      } catch (cause) {
        setError(errorMessage(cause));
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [draftFolder, flush, selectedNoteId, setCounts]);

  // `handleEditorBlur` flushes on blur, not on unmount: quitting inside the 500 ms window loses the
  // last edit, which SPEC §9.1 accepts — there is no close-time flush in the MVP.

  return {
    hostRef,
    title,
    isTitleReadOnly,
    focusToken: draftToken === 0 ? null : draftToken,
    isDraft,
    isDirty,
    noteId,
    hasDocument: isDraft || noteId !== null,
    error,
    handleTitleChange: setTitle,
    handleCommitTitle,
  };
};
