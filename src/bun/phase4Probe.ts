import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { NOTE_DRAG_TYPE } from "../mainview/utils/noteDrag";

/**
 * The view-served `evaluateJavascriptWithResponse` request, as a plain function (SPEC §15.22):
 * one script in, its return value out.
 */
export type EvaluateScript = (script: string) => Promise<unknown>;

/**
 * Phase 4's dev-only DOM probe (todo.md's Phase 4 Verification, the reproducible half).
 *
 * `bun test` cannot reach this component tree — it drives pure helpers against a fixture — and a
 * screenshot proves nothing these days (SPEC §15.18: `dom-ready` is not a render). So the window's
 * own DOM is read back through the view-served `evaluateJavascriptWithResponse` request (§15.22),
 * the same channel Phase 2 used, with two changes that matter:
 *
 *   - the fixture lives **inside the real `NOTEBOOK_DIR`** but is namespaced (`Probe*`) and
 *     asserted as a *subset* of what is listed, so a pre-existing note cannot fail it — the
 *     Phase 3 smoke asserts exact id sets, which only works against an empty notebook;
 *   - every mutation is driven through the **real UI** (clicks, keyboard events, context menus)
 *     and the app is never told to refresh by hand: `noteChanged` is the app's own re-read
 *     trigger, so "appears without a manual refresh" is what these checks actually prove.
 *
 * Printed form, exactly one line per check: `[probe] N ok — <observed>` or `[probe] N FAIL —
 * expected <x>, saw <y>`, and a single `FAIL` means the phase's acceptance is not met. The real
 * drag gesture is the one thing this cannot do (a synthetic drag has no OS-level source), so it
 * stays a manual check and check 15 covers what is statically verifiable.
 */

export interface Phase4ProbeContext {
  dir: string;
  evaluate: EvaluateScript;
  /** The app's own bun → view trigger (SPEC §10.5): the view re-reads the notebook when it lands. */
  pushNoteChanged: (id: string, updatedAt: number) => void;
}

const FOLDER = "Probe";
const SUB_FOLDER = "Sub";
const RENAMED = "ProbeRenamed";
const NEW_SUB_FOLDER = "ProbeNewSub";
const ROOT_NOTE = "ProbeRoot.md";
const DECOY_FOLDER = "ProbeElsewhere";
const DECOY_NOTE = `${DECOY_FOLDER}/decoy.md`;

/** Every path the probe creates, removed in `finally` whatever happened. */
const SEEDED_PATHS = [FOLDER, RENAMED, DECOY_FOLDER, ROOT_NOTE, NEW_SUB_FOLDER];

const SEED: Array<{ relative: string; body: string }> = [
  { relative: ROOT_NOTE, body: "# Probe Root\nprobe-root-unique-body" },
  { relative: `${FOLDER}/alpha.md`, body: "# Alpha\nalpha-unique-body" },
  { relative: `${FOLDER}/${SUB_FOLDER}/beta.md`, body: "# Beta\nbeta-two-levels-down" },
  { relative: DECOY_NOTE, body: "# Decoy\ndecoy-unique-body" },
];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const quote = (value: string): string => JSON.stringify(value);

/* ── view-side scripts ────────────────────────────────────────────────────────────────────────
   Each runs through `new Function(script)` and must `return` its own value. They read either the
   probe's data attributes or plain text, never CSS pixels. */

const SCRIPT_FOLDER_PATHS = `
  return Array.from(document.querySelectorAll("button[data-folder-path]"))
    .map((row) => row.getAttribute("data-folder-path"));
`;

const scriptFolderRow = (path: string): string => `
  const row = document.querySelector('button[data-folder-path=${quote(path)}]');
  if (!row) return null;
  return {
    count: Number(row.getAttribute("data-folder-count")),
    expanded: row.getAttribute("data-expanded") === "true",
  };
`;

const SCRIPT_NOTE_IDS = `
  // Scoped to the list: since Phase 5 the editor pane carries data-note-id too (§10.6), and an
  // unscoped query would hand back the pane as if it were a row.
  return Array.from(document.querySelectorAll("#notes-list [data-note-id]"))
    .map((row) => row.getAttribute("data-note-id"));
`;

const SCRIPT_ACTIVE_NOTE = `
  return document.querySelector(".notes__row_active")?.getAttribute("data-note-id") ?? null;
`;

const SCRIPT_SHELL_STATE = `
  const shell = document.querySelector("#shell");
  return {
    folder: shell?.getAttribute("data-selected-folder") ?? null,
    note: shell?.getAttribute("data-selected-note") ?? null,
    draft: shell?.getAttribute("data-draft-folder") ?? null,
    theme: document.documentElement.getAttribute("data-theme"),
  };
`;

const scriptClick = (selector: string): string => `
  const element = document.querySelector(${quote(selector)});
  if (!element) return false;
  element.click();
  return true;
`;

const scriptToggleFolder = (path: string): string => `
  const row = document.querySelector('button[data-folder-path=${quote(path)}]');
  const twisty = row?.closest(".tree__row")?.querySelector(".tree__twisty");
  if (!twisty) return false;
  twisty.click();
  return true;
`;

const SCRIPT_MENU_OPEN = `
  return Boolean(document.querySelector("#folder-context-menu"));
`;

const scriptOpenMenu = (path: string): string => `
  const row = document.querySelector('button[data-folder-path=${quote(path)}]');
  if (!row) return false;
  row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 40, clientY: 40 }));
  return true;
`;

const scriptClickMenuItem = (label: string): string => `
  const item = Array.from(document.querySelectorAll("#folder-context-menu .context-menu__item"))
    .find((button) => button.textContent.trim() === ${quote(label)});
  if (!item || item.disabled) return false;
  item.click();
  return true;
`;

/** Reads a menu item's state without touching it — the only safe way to check a destructive one. */
const scriptMenuItemDisabled = (label: string): string => `
  const item = Array.from(document.querySelectorAll("#folder-context-menu .context-menu__item"))
    .find((button) => button.textContent.trim() === ${quote(label)});
  if (!item) return "missing";
  return String(item.disabled);
`;

const scriptPressEscape = (): string => `
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  return "sent";
`;

/**
 * A native-HTML5 drag, built by hand: `dragstart` on the row (which must put the note id on the
 * transfer), then `dragover` + `drop` on the folder. The transfer object is the one real piece the
 * OS normally supplies; `DataTransfer`'s constructor is what makes this testable at all. The
 * returned string reports both halves of the wiring — the data type the row wrote, and whether the
 * folder prevented the default (without which no drop is delivered).
 */
const scriptDragDrop = (noteId: string, folderPath: string): string => `
  const row = document.querySelector('#notes-list [data-note-id=${quote(noteId)}]');
  const target = document.querySelector('button[data-folder-path=${quote(folderPath)}]');
  if (!row || !target) return "missing:" + (row ? "drop-target" : "note-row");
  if (typeof DataTransfer !== "function") return "no-DataTransfer-constructor";
  const transfer = new DataTransfer();
  row.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  const carried = transfer.types.includes(${quote(NOTE_DRAG_TYPE)});
  const over = new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer });
  target.dispatchEvent(over);
  target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  return "carried=" + carried + " overPrevented=" + over.defaultPrevented;
`;

/** Sets a value the way a user would, so React's onChange fires (native setter bypasses its cache). */
const scriptType = (selector: string, value: string): string => `
  const input = document.querySelector(${quote(selector)});
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, ${quote(value)});
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
`;

const scriptPressEnter = (selector: string): string => `
  const input = document.querySelector(${quote(selector)});
  if (!input) return false;
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  return true;
`;

const SCRIPT_DRAG_WIRING = `
  const noteRow = document.querySelector("#notes-list [data-note-id]");
  return {
    noteDraggable: noteRow?.getAttribute("draggable") === "true",
    dropZones: document.querySelectorAll("button[data-drop-zone='true']").length,
  };
`;

/**
 * The persistence half of the theme. `views://` is a custom scheme, so "localStorage obviously
 * works" is exactly the kind of assumption this probe exists to replace with a reading — and
 * `localStorage.key(i)` is used instead of `Object.keys` because Storage's named properties are
 * not reliably enumerable.
 */
const SCRIPT_STORAGE = `
  try {
    const probeKey = "probe-storage-round-trip";
    window.localStorage.setItem(probeKey, "ok");
    const roundTrip = window.localStorage.getItem(probeKey) === "ok";
    window.localStorage.removeItem(probeKey);
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i += 1) keys.push(window.localStorage.key(i));
    const themeKeys = keys.filter((key) => key !== null && key.toLowerCase().includes("theme"));
    return {
      available: true,
      roundTrip,
      origin: window.location.origin,
      themeKeys,
      themeValues: themeKeys.map((key) => window.localStorage.getItem(key)),
    };
  } catch (error) {
    return {
      available: false,
      roundTrip: false,
      origin: window.location.origin,
      themeKeys: [],
      themeValues: [],
      error: String(error),
    };
  }
`;

/**
 * Writes the persisted theme directly, bypassing the store. Its purpose is the run *after* this
 * one: the store reads storage during hydration, so a value put here must show up as the live
 * theme (and as check 11's `before`) on the next launch. Two consecutive runs therefore measure
 * "the theme persists", and the second one writes the first one's value back.
 */
const scriptWriteStoredTheme = (value: string): string => `
  const keys = [];
  for (let i = 0; i < window.localStorage.length; i += 1) keys.push(window.localStorage.key(i) ?? "");
  const key = keys.filter((entry) => entry.toLowerCase().includes("theme"))[0] ?? "mynoteappv2.theme";
  const before = window.localStorage.getItem(key);
  window.localStorage.setItem(key, ${quote(JSON.stringify({ state: { theme: value }, version: 0 }))});
  return key + " -> " + before;
`;

/* ── the probe ─────────────────────────────────────────────────────────────────────────────── */

export const runPhase4Probe = async ({
  dir,
  evaluate,
  pushNoteChanged,
}: Phase4ProbeContext): Promise<void> => {
  const read = async (script: string): Promise<unknown> => {
    try {
      return await evaluate(script);
    } catch (error) {
      return `threw ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  /** Disk truth, for the checks whose whole point is that a file moved — or did not. */
  const exists = async (path: string): Promise<boolean> => {
    try {
      await stat(join(dir, path));
      return true;
    } catch {
      return false;
    }
  };

  const asStrings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

  /**
   * The exact id set, order-insensitive. Deliberately not "has N rows" or "contains X": the
   * search query trails the box by the debounce (§10.5), so a loose predicate is satisfied by the
   * *previous* check's list and reads a stale DOM as a pass.
   */
  const equalsIds =
    (expected: string[]) =>
    (value: unknown): boolean =>
      JSON.stringify([...asStrings(value)].sort()) === JSON.stringify([...expected].sort());

  let failures = 0;

  const check = async (
    n: number,
    run: () => Promise<{ ok: boolean; observed: string; expected?: string }>,
  ): Promise<void> => {
    try {
      const result = await run();
      if (!result.ok) failures += 1;
      if (result.ok) console.log(`[probe] ${n} ok — ${result.observed}`);
      else console.log(`[probe] ${n} FAIL — expected ${result.expected ?? "?"}, saw ${result.observed}`);
    } catch (error) {
      failures += 1;
      console.log(`[probe] ${n} FAIL — threw ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /** Waits for the view to catch up with a mutation, then reads — a fixed sleep would be a guess. */
  const readEventually = async (script: string, matches: (value: unknown) => boolean): Promise<unknown> => {
    const deadline = Date.now() + 5_000;
    let value = await read(script);
    while (!matches(value) && Date.now() < deadline) {
      await sleep(100);
      value = await read(script);
    }
    return value;
  };

  console.log("[probe] Phase 4 checks — shell layout, tree, selection, search, folders, theme, drag");

  try {
    // A previous crashed run would leave the fixture behind; start from a known state.
    for (const path of SEEDED_PATHS) {
      await rm(join(dir, path), { recursive: true, force: true });
    }
    for (const entry of SEED) {
      const abs = join(dir, entry.relative);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, entry.body, "utf8");
    }

    // The app's own re-read trigger, exactly as a save would send it.
    pushNoteChanged(`${FOLDER}/alpha.md`, Date.now());
    await readEventually(SCRIPT_FOLDER_PATHS, (value) =>
      asStrings(value).includes(FOLDER),
    );

    // 1 — the sidebar renders the real notebook tree (and hides a collapsed child).
    await check(1, async () => {
      const paths = asStrings(await read(SCRIPT_FOLDER_PATHS));
      const subFolderShown = paths.includes(`${FOLDER}/${SUB_FOLDER}`);
      const ok = paths.includes(FOLDER) && paths.includes("ProbeElsewhere") && !subFolderShown;
      return {
        ok,
        observed: `folders=${JSON.stringify(paths)} nested-before-expand=${subFolderShown}`,
        expected: `contains ${FOLDER} and ProbeElsewhere, ${FOLDER}/${SUB_FOLDER} not shown until expanded`,
      };
    });

    // 2 — expanding nests the child in, collapsing takes it out; nothing touches the disk.
    await check(2, async () => {
      await read(scriptToggleFolder(FOLDER));
      const expanded = await readEventually(SCRIPT_FOLDER_PATHS, (value) =>
        asStrings(value).includes(`${FOLDER}/${SUB_FOLDER}`),
      );
      const shown = asStrings(expanded).includes(`${FOLDER}/${SUB_FOLDER}`);

      await read(scriptToggleFolder(FOLDER));
      const collapsed = await readEventually(SCRIPT_FOLDER_PATHS, (value) =>
        !asStrings(value).includes(`${FOLDER}/${SUB_FOLDER}`),
      );
      const hidden = !asStrings(collapsed).includes(`${FOLDER}/${SUB_FOLDER}`);

      // Leave it expanded for the checks that follow.
      await read(scriptToggleFolder(FOLDER));

      return {
        ok: shown && hidden,
        observed: `expanded-shows-child=${shown} collapsed-hides-child=${hidden}`,
        expected: "expanded-shows-child=true collapsed-hides-child=true",
      };
    });

    // 3 — the counts are recursive and match the list (§10.5): Probe holds 2, All Notes holds all.
    await check(3, async () => {
      const probeRow = (await read(scriptFolderRow(FOLDER))) as { count: number } | null;
      const allNotesRow = (await read(scriptFolderRow(""))) as { count: number } | null;
      const ids = asStrings(await read(SCRIPT_NOTE_IDS));

      const ok =
        probeRow?.count === 2 &&
        allNotesRow?.count !== null &&
        allNotesRow?.count === ids.length;
      return {
        ok,
        observed: `probe=${probeRow?.count} allNotes=${allNotesRow?.count} rows=${ids.length}`,
        expected: "probe=2 allNotes=<the number of rows listed>",
      };
    });

    // 4 — selecting a folder filters the list to that subtree (§10.4).
    await check(4, async () => {
      await read(scriptClick(`button[data-folder-path='${FOLDER}']`));
      const ids = asStrings(
        await readEventually(SCRIPT_NOTE_IDS, (value) =>
          asStrings(value).includes(`${FOLDER}/alpha.md`),
        ),
      );
      const expected = [`${FOLDER}/alpha.md`, `${FOLDER}/${SUB_FOLDER}/beta.md`].sort();
      const ok = JSON.stringify([...ids].sort()) === JSON.stringify(expected);
      return {
        ok,
        observed: `rows=${JSON.stringify(ids)}`,
        expected: JSON.stringify(expected),
      };
    });

    // 5 — "All Notes" shows everything again, root note and the outsider included.
    await check(5, async () => {
      await read(scriptClick("#all-notes"));
      const ids = asStrings(
        await readEventually(SCRIPT_NOTE_IDS, (value) => asStrings(value).includes(ROOT_NOTE)),
      );
      const wanted = [ROOT_NOTE, `${FOLDER}/alpha.md`, `${FOLDER}/${SUB_FOLDER}/beta.md`, DECOY_NOTE];
      const ok = wanted.every((id) => ids.includes(id));
      return {
        ok,
        observed: `rows=${JSON.stringify(ids)}`,
        expected: `every one of ${JSON.stringify(wanted)} present`,
      };
    });

    // 6 — search filters by title without a manual refresh (§10.2, §10.5).
    await check(6, async () => {
      await read(scriptType("#search-input", "alpha"));
      const ids = asStrings(
        await readEventually(SCRIPT_NOTE_IDS, equalsIds([`${FOLDER}/alpha.md`])),
      );
      const ok = JSON.stringify(ids) === JSON.stringify([`${FOLDER}/alpha.md`]);
      return { ok, observed: `query="alpha" rows=${JSON.stringify(ids)}`, expected: `["${FOLDER}/alpha.md"]` };
    });

    // 7 — and by preview: a filename-only search would never find "beta-two-levels-down".
    await check(7, async () => {
      await read(scriptType("#search-input", "beta-two-levels-down"));
      const ids = asStrings(
        await readEventually(SCRIPT_NOTE_IDS, equalsIds([`${FOLDER}/${SUB_FOLDER}/beta.md`])),
      );
      const ok = JSON.stringify(ids) === JSON.stringify([`${FOLDER}/${SUB_FOLDER}/beta.md`]);
      return { ok, observed: `query="beta-two-levels-down" rows=${JSON.stringify(ids)}`, expected: "only the nested beta note" };
    });

    // 8 — case-insensitive.
    await check(8, async () => {
      await read(scriptType("#search-input", "ALPHA"));
      const ids = asStrings(
        await readEventually(SCRIPT_NOTE_IDS, equalsIds([`${FOLDER}/alpha.md`])),
      );
      const ok = JSON.stringify(ids) === JSON.stringify([`${FOLDER}/alpha.md`]);
      return { ok, observed: `query="ALPHA" rows=${JSON.stringify(ids)}`, expected: `["${FOLDER}/alpha.md"]` };
    });

    // 9 — the search is scoped: with Probe selected the decoy (outside it) can never match, while
    // on All Notes a note two levels down is found.
    await check(9, async () => {
      await read(scriptClick(`button[data-folder-path='${FOLDER}']`));
      await read(scriptType("#search-input", "decoy-unique-body"));
      const scoped = asStrings(await readEventually(SCRIPT_NOTE_IDS, equalsIds([])));

      await read(scriptClick("#all-notes"));
      const global = asStrings(
        await readEventually(SCRIPT_NOTE_IDS, (value) => asStrings(value).includes(DECOY_NOTE)),
      );

      const ok = scoped.length === 0 && JSON.stringify(global) === JSON.stringify([DECOY_NOTE]);
      return {
        ok,
        observed: `scoped-to-Probe rows=${JSON.stringify(scoped)} on-All-Notes rows=${JSON.stringify(global)}`,
        expected: `scoped-to-Probe rows=[] on-All-Notes rows=["${DECOY_NOTE}"]`,
      };
    });

    // 10 — clearing the query restores the unfiltered list.
    await check(10, async () => {
      await read(scriptType("#search-input", ""));
      const ids = asStrings(
        await readEventually(SCRIPT_NOTE_IDS, (value) => asStrings(value).includes(ROOT_NOTE)),
      );
      const ok = ids.includes(ROOT_NOTE) && ids.length > 1;
      return { ok, observed: `rows=${JSON.stringify(ids)}`, expected: "the full list again" };
    });

    // 11 — the theme toggle flips `data-theme` on <html> (§10.5, CODE_STYLE §11.3).
    await check(11, async () => {
      const before = (await read(SCRIPT_SHELL_STATE)) as { theme: string | null };
      await read(scriptClick("#theme-toggle"));
      const after = (await readEventually(SCRIPT_SHELL_STATE, (value) =>
        (value as { theme: string | null }).theme !== before.theme,
      )) as { theme: string | null };

      // Put it back, so a manual run does not silently leave the app inverted.
      await read(scriptClick("#theme-toggle"));

      const ok =
        (before.theme === "light" && after.theme === "dark") ||
        (before.theme === "dark" && after.theme === "light");
      return {
        ok,
        observed: `before=${before.theme} afterClick=${after.theme}`,
        expected: "data-theme flips light↔dark on <html>",
      };
    });

    // 12 — `+` starts a draft and writes nothing; selecting a note abandons the draft (§10.5).
    await check(12, async () => {
      await read(scriptClick(`button[data-folder-path='${FOLDER}']`));
      const before = asStrings(await read(SCRIPT_NOTE_IDS));

      await read(scriptClick("#new-note"));
      const drafted = (await readEventually(SCRIPT_SHELL_STATE, (value) =>
        (value as { draft: string | null }).draft === FOLDER,
      )) as { draft: string | null; note: string | null };
      const afterDraft = asStrings(await read(SCRIPT_NOTE_IDS));

      await read(scriptClick(`#notes-list [data-note-id='${FOLDER}/alpha.md']`));
      const abandoned = (await readEventually(SCRIPT_SHELL_STATE, (value) =>
        (value as { note: string | null }).note === `${FOLDER}/alpha.md`,
      )) as { draft: string | null; note: string | null };

      const ok =
        drafted.draft === FOLDER &&
        JSON.stringify(before) === JSON.stringify(afterDraft) &&
        abandoned.draft === "" &&
        abandoned.note === `${FOLDER}/alpha.md`;
      return {
        ok,
        observed: `draft=${JSON.stringify(drafted.draft)} rows-before=${before.length} rows-after=${afterDraft.length} after-selecting-a-note draft=${JSON.stringify(abandoned.draft)} note=${abandoned.note}`,
        expected: `draft="${FOLDER}" rows unchanged, then draft="" with the note selected`,
      };
    });

    // 13 — New Subfolder through the real context menu appears without a manual refresh, and an
    // empty folder can be deleted again (§10.2, §10.5).
    await check(13, async () => {
      await read(scriptOpenMenu(FOLDER));
      // Read the menu in a *later* script: a dispatched event has not committed by the time the
      // script that dispatched it returns.
      const opened = (await readEventually(SCRIPT_MENU_OPEN, (value) => value === true)) === true;
      const askedName = await read(scriptClickMenuItem("New Subfolder"));
      await read(scriptType("#folder-name-input", NEW_SUB_FOLDER));
      await sleep(50); // let React commit the typed value before Enter reads it
      await read(scriptPressEnter("#folder-name-input"));

      const created = asStrings(
        await readEventually(SCRIPT_FOLDER_PATHS, (value) =>
          asStrings(value).includes(`${FOLDER}/${NEW_SUB_FOLDER}`),
        ),
      ).includes(`${FOLDER}/${NEW_SUB_FOLDER}`);

      await read(scriptOpenMenu(`${FOLDER}/${NEW_SUB_FOLDER}`));
      const deleted = await read(scriptClickMenuItem("Delete Folder"));
      const gone = !asStrings(
        await readEventually(SCRIPT_FOLDER_PATHS, (value) =>
          !asStrings(value).includes(`${FOLDER}/${NEW_SUB_FOLDER}`),
        ),
      ).includes(`${FOLDER}/${NEW_SUB_FOLDER}`);

      const ok = opened === true && askedName === true && created && deleted === true && gone;
      return {
        ok,
        observed: `menu=${opened} namePrompt=${askedName} created=${created} deleteClicked=${deleted} goneAfterDelete=${gone}`,
        expected: "menu=true namePrompt=true created=true deleteClicked=true goneAfterDelete=true",
      };
    });

    // 14 — Rename Folder re-keys the list and keeps the selected note selected under its new id
    // (§12: ids are paths, so every descendant note's id changes).
    await check(14, async () => {
      await read(scriptClick(`button[data-folder-path='${FOLDER}']`));
      await read(scriptClick(`#notes-list [data-note-id='${FOLDER}/alpha.md']`));

      await read(scriptOpenMenu(FOLDER));
      const askedName = await read(scriptClickMenuItem("Rename Folder"));
      await read(scriptType("#folder-name-input", RENAMED));
      await sleep(50);
      await read(scriptPressEnter("#folder-name-input"));

      const renamedIds = asStrings(
        await readEventually(SCRIPT_NOTE_IDS, (value) =>
          asStrings(value).includes(`${RENAMED}/alpha.md`),
        ),
      );
      const state = (await read(SCRIPT_SHELL_STATE)) as {
        folder: string | null;
        note: string | null;
      };
      const active = await read(SCRIPT_ACTIVE_NOTE);
      const folders = asStrings(await read(SCRIPT_FOLDER_PATHS));

      const ok =
        askedName === true &&
        folders.includes(RENAMED) &&
        !folders.includes(FOLDER) &&
        renamedIds.includes(`${RENAMED}/alpha.md`) &&
        !renamedIds.includes(`${FOLDER}/alpha.md`) &&
        state.folder === RENAMED &&
        state.note === `${RENAMED}/alpha.md` &&
        active === `${RENAMED}/alpha.md`;
      return {
        ok,
        observed: `rows=${JSON.stringify(renamedIds)} selectedFolder=${state.folder} selectedNote=${state.note} activeRow=${active}`,
        expected: `rows re-keyed to ${RENAMED}/*, selection re-keyed to ${RENAMED}/alpha.md and marked active`,
      };
    });

    // 15 — the drag wiring exists (rows draggable, folders drop targets). A synthetic drag has no
    // OS-level source, so the gesture itself stays a manual check.
    await check(15, async () => {
      const wiring = (await read(SCRIPT_DRAG_WIRING)) as {
        noteDraggable: boolean;
        dropZones: number;
      };
      const ok = wiring.noteDraggable && wiring.dropZones >= 2;
      return {
        ok,
        observed: `noteRowDraggable=${wiring.noteDraggable} dropZones=${wiring.dropZones}`,
        expected: "noteRowDraggable=true dropZones>=2 (All Notes + folders)",
      };
    });

    // 16 — a drag moves the note for real: the row carries the id, the folder accepts the drop, the
    // file moves on disk, and the list plus the selection re-key from `moveNote`'s `newId` (§10.5).
    await check(16, async () => {
      await read(scriptClick(`#notes-list [data-note-id='${RENAMED}/alpha.md']`));
      // Expansion is keyed by path, so the rename left Sub collapsed: open it to expose the target.
      await read(scriptToggleFolder(RENAMED));
      const target = `${RENAMED}/${SUB_FOLDER}`;
      await readEventually(SCRIPT_FOLDER_PATHS, (value) => asStrings(value).includes(target));

      const dispatched = await read(scriptDragDrop(`${RENAMED}/alpha.md`, target));
      const movedTo = `${target}/alpha.md`;
      const ids = asStrings(
        await readEventually(
          SCRIPT_NOTE_IDS,
          equalsIds([movedTo, `${target}/beta.md`]),
        ),
      );
      const state = (await read(SCRIPT_SHELL_STATE)) as { note: string | null };
      const active = await read(SCRIPT_ACTIVE_NOTE);
      const onDisk = await exists(movedTo);
      const sourceGone = !(await exists(`${RENAMED}/alpha.md`));

      const ok =
        dispatched === "carried=true overPrevented=true" &&
        onDisk &&
        sourceGone &&
        state.note === movedTo &&
        active === movedTo;
      return {
        ok,
        observed: `drag=${JSON.stringify(dispatched)} disk-moved=${onDisk} source-gone=${sourceGone} rows=${JSON.stringify(ids)} selectedNote=${state.note} activeRow=${active}`,
        expected: `the drag carries the id and the folder accepts it; ${movedTo} is on disk, listed and still selected`,
      };
    });

    // 17 — dropping a note on the folder it already lives in is a no-op (§10.5).
    await check(17, async () => {
      const current = `${RENAMED}/${SUB_FOLDER}`;
      const before = asStrings(await read(SCRIPT_NOTE_IDS));
      const dispatched = await read(scriptDragDrop(`${current}/alpha.md`, current));
      await sleep(300); // a (wrong) move would have landed by now

      const after = asStrings(await read(SCRIPT_NOTE_IDS));
      const stillThere = await exists(`${current}/alpha.md`);
      const ok =
        dispatched === "carried=true overPrevented=true" &&
        JSON.stringify(before) === JSON.stringify(after) &&
        stillThere;
      return {
        ok,
        observed: `drag=${JSON.stringify(dispatched)} rows-unchanged=${JSON.stringify(before) === JSON.stringify(after)} file-still-there=${stillThere}`,
        expected: "the drag is accepted but nothing moves: rows and disk unchanged",
      };
    });

    // 18 — Delete Folder is offered only for an empty folder. Check 13 covers the enabled half (its
    // click only lands on an enabled item); this is the half that protects a folder with notes.
    await check(18, async () => {
      await read(scriptOpenMenu(RENAMED));
      await readEventually(SCRIPT_MENU_OPEN, (value) => value === true);
      const disabled = await read(scriptMenuItemDisabled("Delete Folder"));
      await read(scriptPressEscape());
      const closed = (await read(SCRIPT_MENU_OPEN)) === false;

      const ok = disabled === "true" && closed;
      return {
        ok,
        observed: `folder=${RENAMED} deleteDisabled=${disabled} menuClosedOnEscape=${closed}`,
        expected: "deleteDisabled=true (the folder holds notes) and Escape closes the menu",
      };
    });

    // 19 — the theme store persists through localStorage. Two half-truths lived here before this
    // check: "the attribute flips" (measured in 11) says nothing about storage, and "localStorage
    // under a custom scheme" was an assumption. This reads both, and reports the key's value so a
    // later failure can tell "key missing" from "key present but wrong".
    await check(19, async () => {
      const storage = (await read(SCRIPT_STORAGE)) as {
        available: boolean;
        roundTrip: boolean;
        origin: string;
        themeKeys: string[];
        themeValues: (string | null)[];
        error?: string;
      };
      const ok = storage.available && storage.roundTrip && storage.themeKeys.length > 0;
      return {
        ok,
        observed: `origin=${storage.origin} available=${storage.available} roundTrip=${storage.roundTrip} themeKeys=${JSON.stringify(storage.themeKeys)} values=${JSON.stringify(storage.themeValues)}${storage.error ? ` error=${storage.error}` : ""}`,
        expected: "localStorage round-trips and the theme store's persist key holds a value",
      };
    });

    // 20 — arms the NEXT launch: it writes the opposite theme straight into storage and reports
    // what it replaced. Check 11 of the following run must then read that value. Two runs in a row
    // therefore verify "the stored theme wins at boot" (§10.5), and restore the original value.
    await check(20, async () => {
      const state = (await read(SCRIPT_SHELL_STATE)) as { theme: string | null };
      const target = state.theme === "dark" ? "light" : "dark";
      const written = await read(scriptWriteStoredTheme(target));
      const ok = typeof written === "string" && !written.includes("threw");
      return {
        ok,
        observed: `live=${state.theme} armed-next-boot=${target} storage=${JSON.stringify(written)}`,
        expected: "the persisted theme now differs from the live one — re-run to prove it boots",
      };
    });
  } finally {
    // The probe's own litter only: every path it created, seeds included.
    for (const path of SEEDED_PATHS) {
      await rm(join(dir, path), { recursive: true, force: true });
    }
    // Leave the window consistent with what is on disk now.
    pushNoteChanged(`,probe-cleanup`, Date.now());

    console.log(`[probe] done — ${failures} failure(s); fixture removed`);
  }
};
