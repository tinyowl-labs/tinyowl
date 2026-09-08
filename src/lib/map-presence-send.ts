/** Presence send policy — no SvelteKit imports so tests can load this file. */

export const CURSOR_THROTTLE_MS = 500;
/** ~1.5× send interval so the interpolator plays between samples. */
export const CURSOR_PLAYBACK_DELAY_MS = 750;
export const MIN_MOVE_DEG = 1e-7;

export const FIELD_EVENT = "field";
export const FIELD_THROTTLE_MS = 2_000;
/** ~11 m at the equator — field GPS, not globe picking. */
export const FIELD_MIN_MOVE_DEG = 1e-4;

export const MAX_GLOBE_EDITORS = 24;

export function shouldBroadcastPresence(peerCount: number): boolean {
  return peerCount > 0;
}

export function holdsCursorSlot(
  userId: string,
  peerIds: Iterable<string>,
  max = MAX_GLOBE_EDITORS,
): boolean {
  const ids = [userId, ...peerIds].filter(Boolean);
  ids.sort();
  const rank = ids.indexOf(userId);
  return rank >= 0 && rank < max;
}

export function globeEditorsCapped(
  memberCount: number,
  max = MAX_GLOBE_EDITORS,
): boolean {
  return memberCount > max;
}

export type LatestWinsGate = {
  busy: boolean;
  queued: boolean;
};

export function createLatestWinsGate(): LatestWinsGate {
  return { busy: false, queued: false };
}

/** Begin a send, or remember that a newer payload should replace it. */
export function requestLatestWins(gate: LatestWinsGate): "send" | "queue" {
  if (gate.busy) {
    gate.queued = true;
    return "queue";
  }
  gate.busy = true;
  gate.queued = false;
  return "send";
}

/**
 * QoS 0: the completed send is never retried. If a newer payload arrived
 * while busy, start that send now.
 */
export function releaseLatestWins(gate: LatestWinsGate): boolean {
  gate.busy = false;
  if (!gate.queued) return false;
  gate.queued = false;
  gate.busy = true;
  return true;
}

export function cursorTickPayload(
  userId: string,
  lon: number,
  lat: number,
  h: number | undefined,
  t: number,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { user_id: userId, lon, lat, t };
  if (typeof h === "number" && Number.isFinite(h)) payload.h = h;
  return payload;
}

export function fieldTickPayload(
  userId: string,
  lon: number,
  lat: number,
  t: number,
): Record<string, unknown> {
  return { user_id: userId, lon, lat, t };
}

export function movedEnough(
  prev: { lon: number; lat: number } | null,
  lon: number,
  lat: number,
  minDeg: number,
): boolean {
  if (!prev) return true;
  const dlon = lon - prev.lon;
  const dlat = lat - prev.lat;
  return dlon * dlon + dlat * dlat >= minDeg * minDeg;
}
