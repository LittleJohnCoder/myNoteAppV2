/**
 * Proving a UI actually rendered, without screenshots.
 *
 * A `dom-ready` event says a document loaded, not that your components drew anything (SPEC
 * §15.18). The only channel that reports *content* back to the main process is a request the
 * view serves — the built-in `evaluateJavascriptWithResponse` (SPEC §15.22) — so a check of the
 * form "the value I pushed is visible in the window" is a poll over that channel.
 *
 * The transport is injected (`evaluate`) rather than imported: this module stays free of
 * electrobun types and is unit-testable with a fake evaluator.
 */

/** Runs a script inside the view and resolves with whatever it returned. */
export type EvaluateScript = (script: string) => Promise<unknown>;

export interface DomProbeQuery {
  /**
   * JS body evaluated inside the view. It runs through `new Function(script)`, so it must
   * contain an explicit `return` — a bare expression evaluates to `undefined`.
   */
  script: string;
  /** Substring that must appear in the returned text for the probe to pass. */
  needle: string;
}

export interface DomProbeOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

export interface DomProbeResult {
  matched: boolean;
  /** Last text read from the view — logged pass *and* fail, so a failure is diagnosable. */
  text: string;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const readText = async (evaluate: EvaluateScript, script: string): Promise<string> => {
  const value = await evaluate(script);
  return typeof value === "string" ? value : "";
};

/**
 * Polls the view until `needle` shows up in the text read by `script`, or the timeout expires.
 * Polling (rather than one read after a delay) is what keeps this honest: the DOM settles when
 * React commits, and no fixed sleep can know when that was.
 */
export const waitForDomText = async (
  evaluate: EvaluateScript,
  { script, needle }: DomProbeQuery,
  { timeoutMs = 3_000, intervalMs = 100 }: DomProbeOptions = {},
): Promise<DomProbeResult> => {
  const deadline = Date.now() + timeoutMs;
  let text = await readText(evaluate, script);

  while (!text.includes(needle) && Date.now() < deadline) {
    await sleep(intervalMs);
    text = await readText(evaluate, script);
  }

  return { matched: text.includes(needle), text };
};
