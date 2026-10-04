import { describe, expect, it } from "bun:test";

import { cx } from "./cx";

describe("cx", () => {
  it("joins the truthy parts with a single space", () => {
    expect(cx("sidebar__row", "sidebar__row_active", "extra")).toBe(
      "sidebar__row sidebar__row_active extra",
    );
  });

  it("drops the falsy parts, so a conditional class needs no template literal", () => {
    expect(cx("sidebar__row", false, null, undefined, "", "extra")).toBe("sidebar__row extra");
  });

  it("answers an empty string when there is nothing to join", () => {
    expect(cx(false, undefined)).toBe("");
  });
});
