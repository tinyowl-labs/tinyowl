import { peerCursorColor } from "$lib/map-presence";
import type { PresencePeer } from "$lib/map-presence";
import { asGeometry } from "./geometry";
import { fromEditBuffer } from "./fromEditBuffer";
import type { DiffFeature, GeoJsonGeometry } from "./types";

/** Paint when tips match, or when either side has not loaded a tip yet. */
export function overlayIsLive(
	peer: PresencePeer,
	developTip: string,
): boolean {
	if (peer.tracking_ref && peer.tracking_ref !== "develop") return false;
	const tip = developTip.trim();
	const base = (peer.based_on ?? "").trim();
	if (!tip || !base) return true;
	return base === tip;
}

/**
 * Map other members' ephemeral buffer + selection onto DiffFeature.
 * Tinted per peer. Empty when based_on does not match develop.
 */
export function fromPeerAwareness(
	peers: PresencePeer[],
	developTip: string,
	lookup?: (table: string, entityId: string) => GeoJsonGeometry | null,
): DiffFeature[] {
	const out: DiffFeature[] = [];
	for (const peer of peers) {
		if (!overlayIsLive(peer, developTip)) continue;
		const color = peerCursorColor(peer.userId);
		const buf = peer.buffer ?? [];
		const bufIds = new Set(
			buf.map((e) => `${e.table}:${e.entityId}`),
		);
		for (const f of fromEditBuffer(buf)) {
			out.push({
				...f,
				id: `peer:${peer.userId}:${f.id}`,
				color,
				pickable: false,
			});
		}
		for (const sel of peer.selection ?? []) {
			if (bufIds.has(`${sel.table}:${sel.entityId}`)) continue;
			const geometry =
				asGeometry(sel.geometry) ??
				lookup?.(sel.table, sel.entityId) ??
				null;
			if (!geometry) continue;
			out.push({
				id: `peer:${peer.userId}:sel:${sel.table}:${sel.entityId}`,
				table: sel.table,
				entityId: sel.entityId,
				op: "head",
				geometry,
				color,
				pickable: false,
			});
		}
	}
	return out;
}
