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

function entityKey(table: string, entityId: string): string {
	return `${table}:${entityId}`;
}

/** Live peer currently vertex-editing this entity, if any. */
export function peerHoldingEdit(
	peers: PresencePeer[],
	table: string,
	entityId: string,
	developTip: string,
): PresencePeer | null {
	if (!table || !entityId) return null;
	for (const peer of peers) {
		if (!overlayIsLive(peer, developTip)) continue;
		if (
			peer.editing?.table === table &&
			peer.editing?.entityId === entityId
		) {
			return peer;
		}
	}
	return null;
}

/**
 * Map other members' ephemeral buffer + selection onto DiffFeature.
 * Cursor-coloured outline (no fill). Empty when based_on does not match develop.
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
		const painted = new Set<string>();
		const editingKey = peer.editing
			? entityKey(peer.editing.table, peer.editing.entityId)
			: "";
		for (const f of fromEditBuffer(buf)) {
			const key = entityKey(f.table, f.entityId);
			painted.add(key);
			out.push({
				...f,
				id: `peer:${peer.userId}:${f.id}`,
				oldGeometry: undefined,
				color,
				pickable: false,
				outline: true,
				emphasis: key === editingKey,
			});
		}
		for (const sel of peer.selection ?? []) {
			const key = entityKey(sel.table, sel.entityId);
			if (painted.has(key)) continue;
			const geometry =
				asGeometry(sel.geometry) ??
				lookup?.(sel.table, sel.entityId) ??
				null;
			if (!geometry) continue;
			painted.add(key);
			out.push({
				id: `peer:${peer.userId}:sel:${sel.table}:${sel.entityId}`,
				table: sel.table,
				entityId: sel.entityId,
				op: "head",
				geometry,
				color,
				pickable: false,
				outline: true,
				emphasis: key === editingKey,
			});
		}
		if (peer.editing && !painted.has(editingKey)) {
			const geometry =
				lookup?.(peer.editing.table, peer.editing.entityId) ?? null;
			if (geometry) {
				out.push({
					id: `peer:${peer.userId}:edit:${editingKey}`,
					table: peer.editing.table,
					entityId: peer.editing.entityId,
					op: "head",
					geometry,
					color,
					pickable: false,
					outline: true,
					emphasis: true,
				});
			}
		}
	}
	return out;
}
