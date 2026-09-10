/**
 * Build entities from CZML the injalak way:
 * wait for real terrain → sampleTerrainMostDetailed → absolute Z → HeightReference.NONE.
 *
 * Ground polygons use the same path (not ClassificationType): classification
 * paints opaque and shards on steep DEM. Sampled vertex heights + a small
 * epsilon keep translucency and reduce z-fighting.
 */

import { entityIdFromPacket } from "./czmlLoad";

type CesiumNS = typeof import("cesium");

/** Metres above sampled terrain so translucent polygon fills clear the DEM. */
const GROUND_POLY_EPS_M = 0.75;

function rgbaToColor(Cesium: any, rgba: unknown, fallback: any) {
    if (!Array.isArray(rgba) || rgba.length < 3) return fallback;
    const [r, g, b, a = 255] = rgba as number[];
    return new Cesium.Color(r / 255, g / 255, b / 255, a / 255);
}

function czmlColor(Cesium: any, node: unknown, fallback: any) {
    if (!node || typeof node !== "object") return fallback;
    const n = node as Record<string, unknown>;
    if (Array.isArray(n.rgba)) return rgbaToColor(Cesium, n.rgba, fallback);
    const solid = (n.solidColor as { color?: { rgba?: number[] } } | undefined)
        ?.color?.rgba;
    if (solid) return rgbaToColor(Cesium, solid, fallback);
    return fallback;
}

function degreesToCartesians(Cesium: any, flat: number[]): any[] {
    const out: any[] = [];
    for (let i = 0; i + 1 < flat.length; i += 3) {
        out.push(
            Cesium.Cartesian3.fromDegrees(
                flat[i]!,
                flat[i + 1]!,
                flat[i + 2] ?? 0,
            ),
        );
    }
    return out;
}

function ringHasZ(flat: number[]): boolean {
    for (let i = 2; i < flat.length; i += 3) {
        if (Math.abs(flat[i]!) > 1e-6) return true;
    }
    return false;
}

function coordKey(lng: number, lat: number): string {
    return `${lng},${lat}`;
}

function pushSampleNeed(
    Cesium: any,
    lng: number,
    lat: number,
    seen: Set<string>,
    cartographics: any[],
    keys: string[],
): void {
    const key = coordKey(lng, lat);
    if (seen.has(key)) return;
    seen.add(key);
    cartographics.push(Cesium.Cartographic.fromDegrees(lng, lat));
    keys.push(key);
}

function collectFlatSamples(
    Cesium: any,
    flat: number[] | undefined,
    seen: Set<string>,
    cartographics: any[],
    keys: string[],
): void {
    if (!flat) return;
    for (let i = 0; i + 1 < flat.length; i += 3) {
        const lng = flat[i]!;
        const lat = flat[i + 1]!;
        const h = flat[i + 2] ?? 0;
        if (Math.abs(h) > 1e-6) continue;
        pushSampleNeed(Cesium, lng, lat, seen, cartographics, keys);
    }
}

function applyHeightMapToFlat(
    flat: number[],
    heightMap: Map<string, number>,
    epsM: number,
): number[] {
    const out: number[] = [];
    for (let i = 0; i + 1 < flat.length; i += 3) {
        const lng = flat[i]!;
        const lat = flat[i + 1]!;
        const packetH = flat[i + 2] ?? 0;
        const sampled = heightMap.get(coordKey(lng, lat));
        const h =
            sampled != null
                ? sampled + epsM
                : Math.abs(packetH) > 1e-6
                  ? packetH
                  : epsM;
        out.push(lng, lat, h);
    }
    return out;
}

async function sampleGroundHeights(
    Cesium: CesiumNS | any,
    viewer: any,
    packets: Record<string, unknown>[],
): Promise<Map<string, number>> {
    const heightMap = new Map<string, number>();
    const cartographics: any[] = [];
    const keys: string[] = [];
    const seen = new Set<string>();

    for (const pkt of packets) {
        const point = pkt.point as Record<string, unknown> | undefined;
        const position = pkt.position as
            { cartographicDegrees?: number[] } | undefined;
        if (point && position?.cartographicDegrees) {
            const [lng, lat, h = 0] = position.cartographicDegrees;
            if (lng != null && lat != null && Math.abs(h) <= 1e-6) {
                pushSampleNeed(Cesium, lng, lat, seen, cartographics, keys);
            }
        }

        const polyline = pkt.polyline as Record<string, unknown> | undefined;
        if (polyline) {
            collectFlatSamples(
                Cesium,
                (polyline.positions as { cartographicDegrees?: number[] })
                    ?.cartographicDegrees,
                seen,
                cartographics,
                keys,
            );
        }

        const polygon = pkt.polygon as Record<string, unknown> | undefined;
        if (polygon) {
            collectFlatSamples(
                Cesium,
                (polygon.positions as { cartographicDegrees?: number[] })
                    ?.cartographicDegrees,
                seen,
                cartographics,
                keys,
            );
            const holes = (
                polygon.holes as { cartographicDegrees?: number[][] }
            )?.cartographicDegrees;
            for (const ring of holes ?? []) {
                collectFlatSamples(Cesium, ring, seen, cartographics, keys);
            }
        }
    }

    if (cartographics.length === 0) return heightMap;

    const terrain = viewer.terrainProvider;
    if (
        !terrain ||
        terrain instanceof Cesium.EllipsoidTerrainProvider ||
        typeof Cesium.sampleTerrainMostDetailed !== "function"
    ) {
        console.warn(
            "[czmlEntities] no World Terrain yet — ground features sit near ellipsoid",
        );
        return heightMap;
    }

    const results = await Cesium.sampleTerrainMostDetailed(
        terrain,
        cartographics,
    );
    for (let i = 0; i < results.length; i++) {
        heightMap.set(keys[i]!, results[i]?.height ?? 0);
    }
    return heightMap;
}

async function yieldEntityBuild(): Promise<void> {
    const scheduler = (
        globalThis as typeof globalThis & {
            scheduler?: { yield?: () => Promise<void> };
        }
    ).scheduler;
    if (typeof scheduler?.yield === "function") {
        await scheduler.yield();
        return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export async function customDataSourceFromCzml(
    Cesium: CesiumNS | any,
    viewer: any,
    packets: Record<string, unknown>[],
    layerName: string,
): Promise<any> {
    const ds = new Cesium.CustomDataSource(layerName);
    const terrainPoints: Array<{ entity: any; lng: number; lat: number }> = [];
    const terrainPolygons: Array<{
        entity: any;
        flat: number[];
        holesRaw: number[][] | undefined;
    }> = [];

    // Emit one collectionChanged notification after the bulk feed. Cesium's
    // visualizers can then build their static batches without per-entity churn.
    ds.entities.suspendEvents();
    try {
        for (let packetIndex = 0; packetIndex < packets.length; packetIndex++) {
            const pkt = packets[packetIndex]!;
            const id = pkt.id;
            if (typeof id !== "string" || id === "document") continue;
            const entityId = entityIdFromPacket(pkt, layerName);
            if (!entityId) continue;

            const props = pkt.properties;
            const point = pkt.point as Record<string, unknown> | undefined;
            const polyline = pkt.polyline as
                Record<string, unknown> | undefined;
            const polygon = pkt.polygon as Record<string, unknown> | undefined;
            const position = pkt.position as
                { cartographicDegrees?: number[] } | undefined;

            if (point && position?.cartographicDegrees) {
                const [lng, lat, h = 0] = position.cartographicDegrees;
                if (lng == null || lat == null) continue;
                const height = h;
                const color = czmlColor(
                    Cesium,
                    point.color,
                    Cesium.Color.DODGERBLUE,
                );
                const outline = czmlColor(
                    Cesium,
                    point.outlineColor,
                    Cesium.Color.WHITE.withAlpha(0.85),
                );
                const entity = ds.entities.add({
                    id,
                    position: Cesium.Cartesian3.fromDegrees(lng, lat, height),
                    point: {
                        pixelSize: Number(point.pixelSize) || 8,
                        color,
                        outlineColor: outline,
                        outlineWidth: Number(point.outlineWidth) || 1,
                        heightReference: Cesium.HeightReference.NONE,
                    },
                    properties: props,
                });
                if (Math.abs(h) <= 1e-6) {
                    terrainPoints.push({ entity, lng, lat });
                }
                continue;
            }

            if (polyline) {
                const flat = (
                    polyline.positions as { cartographicDegrees?: number[] }
                )?.cartographicDegrees;
                if (!flat || flat.length < 6) continue;
                const useHeights = ringHasZ(flat);
                const color = czmlColor(
                    Cesium,
                    polyline.material,
                    Cesium.Color.fromBytes(51, 128, 204, 255),
                );
                ds.entities.add({
                    id,
                    polyline: {
                        positions: degreesToCartesians(Cesium, flat),
                        width: Number(polyline.width) || 2,
                        material: color,
                        ...(useHeights ? {} : { clampToGround: true }),
                    },
                    properties: props,
                });
                continue;
            }

            if (polygon) {
                const flat = (
                    polygon.positions as { cartographicDegrees?: number[] }
                )?.cartographicDegrees;
                if (!flat || flat.length < 9) continue;
                const useHeights = ringHasZ(flat);
                const fill = czmlColor(
                    Cesium,
                    polygon.material,
                    Cesium.Color.fromBytes(51, 153, 204, 89),
                );
                const holesRaw = (
                    polygon.holes as { cartographicDegrees?: number[][] }
                )?.cartographicDegrees;
                const holes = (holesRaw ?? []).map(
                    (ring) =>
                        new Cesium.PolygonHierarchy(
                            degreesToCartesians(Cesium, ring),
                        ),
                );
                const hierarchy = new Cesium.PolygonHierarchy(
                    degreesToCartesians(Cesium, flat),
                    holes,
                );
                const outline = czmlColor(
                    Cesium,
                    polygon.outlineColor,
                    Cesium.Color.fromBytes(30, 100, 160, 255),
                );
                const outlineWidth = Number(polygon.outlineWidth) || 2;
                const wantOutline = polygon.outline !== false;
                const entity = ds.entities.add({
                    id,
                polygon: {
                    hierarchy,
                    material: fill,
                    outline: wantOutline,
                    outlineColor: outline,
                    outlineWidth,
                    // Heightless polygons can paint immediately while the
                    // accurate per-vertex terrain samples run in the background.
                    ...(useHeights
                        ? { perPositionHeight: true }
                        : {
                              height: 0,
                              heightReference:
                                  Cesium.HeightReference.CLAMP_TO_GROUND,
                          }),
                    },
                    properties: props,
                });
                if (!useHeights) {
                    terrainPolygons.push({
                        entity,
                        flat,
                        holesRaw: holesRaw ?? undefined,
                    });
                }
            }

            // Cesium's Entity visualizers already batch static ground geometry;
            // yield while feeding them so large layers do not become one long task.
            if (packetIndex > 0 && packetIndex % 100 === 0) {
                await yieldEntityBuild();
            }
        }
    } finally {
        ds.entities.resumeEvents();
    }

    // Terrain sampling is an enhancement, not a prerequisite for showing the
    // layer. Let this data source return first, then correct zero-height
    // features in a later task when the most-detailed samples arrive.
    void yieldEntityBuild()
        .then(() => sampleGroundHeights(Cesium, viewer, packets))
        .catch(() => new Map<string, number>())
        .then(async (heightMap) => {
            if (ds.__echidnaDisposed || heightMap.size === 0) return;
            for (const { entity, lng, lat } of terrainPoints) {
                const height = heightMap.get(coordKey(lng, lat));
                if (height == null) continue;
                entity.position = Cesium.Cartesian3.fromDegrees(
                    lng,
                    lat,
                    height,
                );
            }
            for (let i = 0; i < terrainPolygons.length; i++) {
                const { entity, flat, holesRaw } = terrainPolygons[i]!;
                if (!entity?.polygon) continue;
                const outer = applyHeightMapToFlat(
                    flat,
                    heightMap,
                    GROUND_POLY_EPS_M,
                );
                const holeHierarchies = (holesRaw ?? []).map(
                    (ring) =>
                        new Cesium.PolygonHierarchy(
                            degreesToCartesians(
                                Cesium,
                                applyHeightMapToFlat(
                                    ring,
                                    heightMap,
                                    GROUND_POLY_EPS_M,
                                ),
                            ),
                        ),
                );
                entity.polygon.hierarchy = new Cesium.PolygonHierarchy(
                    degreesToCartesians(Cesium, outer),
                    holeHierarchies,
                );
                entity.polygon.perPositionHeight = true;
                entity.polygon.classificationType = undefined;
                entity.polygon.height = undefined;
                entity.polygon.heightReference = undefined;
                if (i > 0 && i % 100 === 0) await yieldEntityBuild();
            }
            ds.__echidnaTerrainHeightsReady = true;
            ds.__echidnaOnTerrainHeights?.();
            viewer?.scene?.requestRender?.();
        });

    return ds;
}
