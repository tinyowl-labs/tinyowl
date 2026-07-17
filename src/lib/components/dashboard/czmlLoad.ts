/** Parse and index server CZML NDJSON for Cesium + scene graph. */

export function parseNdjsonCzml(text: string): Record<string, unknown>[] {
    const packets: Record<string, unknown>[] = [];
    for (const line of text.split("\n")) {
        const t = line.trim();
        if (!t) continue;
        packets.push(JSON.parse(t) as Record<string, unknown>);
    }
    return packets;
}

/** Strip `{layer}:` prefix and trailing `:{part}` multi-geom suffix. */
export function entityIdFromPacketId(
    packetId: string,
    layerName: string,
): string {
    let rest = packetId;
    const prefix = `${layerName}:`;
    if (packetId.toLowerCase().startsWith(prefix.toLowerCase())) {
        rest = packetId.slice(prefix.length);
    } else {
        const i = packetId.indexOf(":");
        rest = i >= 0 ? packetId.slice(i + 1) : packetId;
    }
    return rest.replace(/:\d+$/, "");
}

/**
 * Prefer TinyOwl packet identity (`layer:source_id`) over data columns named
 * `id` / `fid` — those are often natural keys from import and break popup joins
 * that look up rows by source_id.
 */
function propSourceId(props: unknown): string | null {
    if (!props || typeof props !== "object") return null;
    const p = props as Record<string, unknown>;
    for (const key of ["source_id", "entity_id"]) {
        const v = p[key];
        if (v != null && String(v).trim() !== "") return String(v);
    }
    return null;
}

export function entityIdFromPacket(
    packet: Record<string, unknown>,
    layerName: string,
): string | null {
    const id = packet.id;
    if (typeof id !== "string" || id === "document") return null;
    return propSourceId(packet.properties) ?? entityIdFromPacketId(id, layerName);
}

/** Unique entity ids in packet order (for SceneGraphPanel). */
export function entityIdsFromPackets(
    packets: Record<string, unknown>[],
    layerName: string,
): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of packets) {
        const eid = entityIdFromPacket(p, layerName);
        if (!eid || seen.has(eid)) continue;
        seen.add(eid);
        out.push(eid);
    }
    return out;
}

/** Read a Cesium entity property value (ConstantProperty or raw). */
export function cesiumPropValue(prop: unknown, time?: unknown): unknown {
    if (prop == null) return null;
    if (typeof prop === "object" && typeof (prop as { getValue?: unknown }).getValue === "function") {
        try {
            return (prop as { getValue: (t?: unknown) => unknown }).getValue(time);
        } catch {
            return null;
        }
    }
    return prop;
}
