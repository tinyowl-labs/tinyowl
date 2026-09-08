/** Presence send policy — no SvelteKit imports so tests can load this file. */

export function shouldBroadcastPresence(peerCount: number): boolean {
  return peerCount > 0;
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
