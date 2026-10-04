/**
 * Assembling a class string happens here and nowhere else (CODE_STYLE §11.1) — a component uses
 * this to merge its own classes with an incoming `className` (§5.5).
 */
export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");
