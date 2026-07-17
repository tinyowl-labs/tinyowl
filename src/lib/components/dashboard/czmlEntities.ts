/**
 * Build entities from CZML the injalak way:
 * wait for real terrain → sampleTerrainMostDetailed → absolute Z → HeightReference.NONE.
 */

import { entityIdFromPacket } from "./czmlLoad";

type CesiumNS = typeof import("cesium");

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

async function samplePointHeights(
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
            | { cartographicDegrees?: number[] }
            | undefined;
        if (!point || !position?.cartographicDegrees) continue;
        const [lng, lat, h = 0] = position.cartographicDegrees;
        if (lng == null || lat == null) continue;
        if (Math.abs(h) > 1e-6) continue;
        const key = coordKey(lng, lat);
        if (seen.has(key)) continue;
        seen.add(key);
        cartographics.push(Cesium.Cartographic.fromDegrees(lng, lat));
        keys.push(key);
    }

    if (cartographics.length === 0) return heightMap;

    const terrain = viewer.terrainProvider;
    if (
        !terrain ||
        terrain instanceof Cesium.EllipsoidTerrainProvider ||
        typeof Cesium.sampleTerrainMostDetailed !== "function"
    ) {
        console.warn(
            "[czmlEntities] no World Terrain yet — points would sit at ellipsoid",
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

export async function customDataSourceFromCzml(
    Cesium: CesiumNS | any,
    viewer: any,
    packets: Record<string, unknown>[],
    layerName: string,
): Promise<any> {
    const ds = new Cesium.CustomDataSource(layerName);
    const heightMap = await samplePointHeights(Cesium, viewer, packets);

    for (const pkt of packets) {
        const id = pkt.id;
        if (typeof id !== "string" || id === "document") continue;
        const entityId = entityIdFromPacket(pkt, layerName);
        if (!entityId) continue;

        const props = pkt.properties;
        const point = pkt.point as Record<string, unknown> | undefined;
        const polyline = pkt.polyline as Record<string, unknown> | undefined;
        const polygon = pkt.polygon as Record<string, unknown> | undefined;
        const position = pkt.position as
            | { cartographicDegrees?: number[] }
            | undefined;

        if (point && position?.cartographicDegrees) {
            const [lng, lat, h = 0] = position.cartographicDegrees;
            if (lng == null || lat == null) continue;
            const height =
                Math.abs(h) > 1e-6
                    ? h
                    : (heightMap.get(coordKey(lng, lat)) ?? 0);
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
            ds.entities.add({
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
            ds.entities.add({
                id,
                polygon: {
                    hierarchy,
                    material: fill,
                    outline: polygon.outline !== false,
                    outlineColor: outline,
                    outlineWidth: Number(polygon.outlineWidth) || 2,
                    ...(useHeights
                        ? { perPositionHeight: true }
                        : {
                              classificationType:
                                  Cesium.ClassificationType.BOTH,
                          }),
                },
                properties: props,
            });
        }
    }

    return ds;
}
