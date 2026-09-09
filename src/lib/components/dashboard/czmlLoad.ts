/** Parse and index server CZML NDJSON for Cesium + scene graph. */

export type PacketLonLat = { lon: number; lat: number };

function pushCartographicDegrees(out: PacketLonLat[], raw: unknown): void {
    if (!Array.isArray(raw) || raw.length === 0) return;
    if (Array.isArray(raw[0])) {
        for (const ring of raw) pushCartographicDegrees(out, ring);
        return;
    }
    const nums = raw as number[];
    for (let i = 0; i + 1 < nums.length; i += 3) {
        const lon = Number(nums[i]);
        const lat = Number(nums[i + 1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        if (Math.abs(lon) > 180 || Math.abs(lat) > 90) continue;
        out.push({ lon, lat });
    }
}

function cartographicDegreesOf(node: unknown): unknown {
    if (!node || typeof node !== "object") return undefined;
    return (node as { cartographicDegrees?: unknown }).cartographicDegrees;
}

/** Lon/lat from CZML packets — independent of Cesium visualizer spheres. */
export function collectPacketLonLats(
    packets: Record<string, unknown>[] | undefined,
): PacketLonLat[] {
    const out: PacketLonLat[] = [];
    for (const pkt of packets ?? []) {
        if (pkt.id === "document") continue;
        const position = pkt.position as
            | { cartographicDegrees?: unknown }
            | undefined;
        pushCartographicDegrees(out, position?.cartographicDegrees);
        const polyline = pkt.polyline as { positions?: unknown } | undefined;
        pushCartographicDegrees(out, cartographicDegreesOf(polyline?.positions));
        const polygon = pkt.polygon as
            | { positions?: unknown; holes?: unknown }
            | undefined;
        pushCartographicDegrees(out, cartographicDegreesOf(polygon?.positions));
        pushCartographicDegrees(out, cartographicDegreesOf(polygon?.holes));
    }
    return out;
}

/** Drop lon/lat 0,0 placeholders when real coordinates exist. */
export function preferRealLonLats(pts: PacketLonLat[]): PacketLonLat[] {
    const real = pts.filter(
        (p) => Math.abs(p.lon) > 1e-5 || Math.abs(p.lat) > 1e-5,
    );
    return real.length > 0 ? real : pts;
}

export function parseNdjsonCzml(text: string): Record<string, unknown>[] {
    const packets: Record<string, unknown>[] = [];
    for (const line of text.split("\n")) {
        const t = line.trim();
        if (!t) continue;
        packets.push(JSON.parse(t) as Record<string, unknown>);
    }
    return packets;
}

/**
 * Parse large layer payloads without monopolising the main thread.  A single
 * polygon packet can still be sizeable, but yielding between roughly 1 MiB
 * slices keeps map chrome and Cesium's loader responsive on dense projects.
 */
export async function parseNdjsonCzmlAsync(
    text: string,
    yieldAfterBytes = 1_000_000,
): Promise<Record<string, unknown>[]> {
    const packets: Record<string, unknown>[] = [];
    let bytesSinceYield = 0;
    let lineStart = 0;
    while (lineStart < text.length) {
        const newline = text.indexOf("\n", lineStart);
        const lineEnd = newline < 0 ? text.length : newline;
        const line = text.slice(lineStart, lineEnd);
        lineStart = lineEnd + 1;
        const t = line.trim();
        if (!t) continue;
        packets.push(JSON.parse(t) as Record<string, unknown>);
        bytesSinceYield += line.length;
        if (bytesSinceYield < yieldAfterBytes) continue;
        bytesSinceYield = 0;
        const scheduler = (
            globalThis as typeof globalThis & {
                scheduler?: { yield?: () => Promise<void> };
            }
        ).scheduler;
        if (typeof scheduler?.yield === "function") {
            await scheduler.yield();
        } else {
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
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

/** Attribute rows from CZML properties (map SoT; no geom). One row per entity. */
export function rowsFromPackets(
    packets: Record<string, unknown>[] | undefined,
    layerName: string,
): Record<string, unknown>[] {
    const seen = new Set<string>();
    const out: Record<string, unknown>[] = [];
    for (const pkt of packets ?? []) {
        const eid = entityIdFromPacket(pkt, layerName);
        if (!eid || seen.has(eid)) continue;
        seen.add(eid);
        const props =
            pkt.properties && typeof pkt.properties === "object"
                ? { ...(pkt.properties as Record<string, unknown>) }
                : {};
        out.push({ ...props, source_id: eid });
    }
    return out;
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
