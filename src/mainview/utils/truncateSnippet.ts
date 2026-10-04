/**
 * The presentation half of SPEC §9.1's preview: the notes layer hands over the raw first 60
 * characters with no ellipsis, so any *shorter* cut is the renderer's call (the "60-char preview"
 * in §10.2's list). Marking the cut is the point — a silently clipped row reads as a full one.
 */
export const truncateSnippet = (text: string, max: number): string => {
  if (!text || max <= 0) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()} …`;
};
