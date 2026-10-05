import { describe, expect, it } from "bun:test";

import { NOTEBOOK_LABEL, noteLocation } from "./noteLocation";

describe("noteLocation", () => {
  it("renders a root note against the notebook's fixed name", () => {
    expect(noteLocation("plan.md")).toBe(`plan · ${NOTEBOOK_LABEL}`);
  });

  it("strips the extension from the filename and keeps the folder path", () => {
    expect(noteLocation("Ideas/2026/plan.md")).toBe("plan · Ideas/2026");
  });

  it("strips only the trailing extension", () => {
    expect(noteLocation("v1.2.md")).toBe("v1.2 · Notebook");
  });

  it("renders a single-segment note whose id is not .md (defensive)", () => {
    expect(noteLocation("plan")).toBe("plan · Notebook");
  });
});
