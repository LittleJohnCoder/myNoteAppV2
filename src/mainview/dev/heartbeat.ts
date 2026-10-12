import { onViewContext } from "@/rpc";

/**
 * SPEC §10.6 / debug.md's X6: the dev-only heartbeat.
 *
 * The wedge (debug.md) stops the view answering RPC while both ends still report the socket OPEN,
 * so bun is blind to it. The one channel that does not use that socket is the view's own navigation
 * events: the preload emits `did-navigate-in-page` on `hashchange`, and `src/bun/index.ts` logs it
 * as `[hash] …`. So a timer that writes a changing hash is a liveness signal for the *page*, one
 * hop outside the transport:
 *
 *   - hashes keep arriving → the page's run loop is alive; only the socket died (T2/T3)
 *   - hashes stop, process alive → the page is suspended (T1)
 *
 * Nothing in the renderer reads `location.hash` (`announceViewReady` reads `location.href` once, at
 * mount), so writing it is inert.
 */

/** 5 s: fine enough to date a wedge, coarse enough to cost nothing on an idle app (SPEC §10.6). */
export const HEARTBEAT_INTERVAL_MS = 5_000;

let started = false;

const start = (): void => {
  if (started) return; // one timer per page, however many times the context arrives
  started = true;
  console.log(`[view] heartbeat on — every ${HEARTBEAT_INTERVAL_MS}ms`);
  setInterval(() => {
    window.location.hash = `hb-${Math.round(performance.now())}`;
  }, HEARTBEAT_INTERVAL_MS);
};

/**
 * Starts only when bun says so: the switch arrives on the handshake push as
 * `viewContext.heartbeat`, and `onViewContext` replays the last context to a subscriber that
 * registers late — so a mount-order change cannot silently lose it.
 */
export const startHeartbeatIfEnabled = (): void => {
  onViewContext((context) => {
    if (context.heartbeat) start();
  });
};
