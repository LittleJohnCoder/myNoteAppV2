import { describe, expect, it } from "bun:test";

import { toTitleCharset } from "./titleCharset";

describe("toTitleCharset", () => {
  it("lowercases what is typed", () => {
    expect(toTitleCharset("Plan")).toBe("plan");
  });

  it("drops spaces and symbols, not just trims them", () => {
    expect(toTitleCharset("My Note!")).toBe("mynote");
  });

  it("keeps digits", () => {
    expect(toTitleCharset("2026Plan")).toBe("2026plan");
  });

  it("drops a typed dot, so a pasted .md loses its punctuation as it is shown", () => {
    // Deliberate: the field shows what will be stored (§10.1). The layer's slug strips a trailing
    // `.md` first, which is unreachable while typing — see the module comment.
    expect(toTitleCharset("notes.md")).toBe("notesmd");
  });

  it("returns an empty string for input with nothing left in the charset", () => {
    expect(toTitleCharset("!!!")).toBe("");
  });

  it("is idempotent", () => {
    expect(toTitleCharset(toTitleCharset("Café 1"))).toBe(toTitleCharset("Café 1"));
  });
});
