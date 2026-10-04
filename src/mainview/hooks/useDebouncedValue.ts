import { useEffect, useState } from "react";

/**
 * SPEC §10.5's search debounce (~150 ms): the query in the box is immediate, the value the list
 * filters on trails it. An effect rather than a derivation, and it cleans its timer up on every
 * keystroke and on unmount (CODE_STYLE §7.3).
 */
export const useDebouncedValue = <T>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
};
