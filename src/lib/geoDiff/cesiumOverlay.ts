import { DIFF_OP_FILL } from "./colors";
import { asGeometry } from "./geometry";
import type { DiffFeature, DiffOp, GeoJsonGeometry } from "./types";

export const GEO_DIFF_DS_NAME = "tinyowl-geo-diff";

type Role = "after" | "before";

function findDiffDataSource(viewer: any): any | null {
    const col = viewer?.dataSources;
    if (!col) return null;
    const n = col.length ?? 0;
    for (let i = 0; i < n; i++) {
        const ds = col.get(i);
        if (ds?.name === GEO_DIFF_DS_NAME) return ds;
    }
    return null;
}

function firstPosition(coords: unknown): number[] | null {
    if (!Array.isArray(coords) || coords.length === 0) return null;
    if (typeof coords[0] === "number") return coords as number[];
    return firstPosition(coords[0]);
}

function coordsHaveZ(coords: unknown): boolean {
    const p = firstPosition(coords);
    return Boolean(p && p.length > 2);
}

function asRings(raw: unknown): unknown[] {
    return Array.isArray(raw) ? raw : [];
}

function ringToCartesians(Cesium: any, ring: unknown): any[] {
    const coords = Array.isArray(ring) ? ring : [];
    const out: any[] = [];
    for (const c of coords) {
        if (!Array.isArray(c) || c.length < 2) continue;
        const lon = Number(c[0]);
        const lat = Number(c[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        const h =
            c.length > 2 && Number.isFinite(Number(c[2])) ? Number(c[2]) : 0;
        out.push(Cesium.Cartesian3.fromDegrees(lon, lat, h));
    }
    return out;
}

function fillColor(Cesium: any, op: DiffOp, role: Role) {
    const hex = DIFF_OP_FILL[op] ?? DIFF_OP_FILL.head;
    const base =
        Cesium.Color.fromCssColorString(hex) ?? Cesium.Color.ORANGE;
    if (role === "before") return base.withAlpha(0.28);
    if (op === "delete") return base.withAlpha(0.4);
    if (op === "head") return base.withAlpha(0.55);
    return base.withAlpha(0.55);
}

function lineColor(Cesium: any, op: DiffOp, role: Role) {
    const hex = DIFF_OP_FILL[op] ?? DIFF_OP_FILL.head;
    const base =
        Cesium.Color.fromCssColorString(hex) ?? Cesium.Color.ORANGE;
    if (role === "before") return base.withAlpha(0.55);
    if (op === "delete") return base.withAlpha(0.7);
    return base;
}

function dashed(op: DiffOp, role: Role) {
    return role === "before" || op === "delete";
}

function addPoint(
    Cesium: any,
    ds: any,
    id: string,
    coords: unknown,
    op: DiffOp,
    role: Role,
) {
    if (!Array.isArray(coords) || coords.length < 2) return;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    const h =
        coords.length > 2 && Number.isFinite(Number(coords[2]))
            ? Number(coords[2])
            : 0;
    const color = fillColor(Cesium, op, role);
    ds.entities.add({
        id,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, h),
        point: {
            pixelSize: role === "before" ? 8 : 12,
            color,
            outlineColor: Cesium.Color.WHITE.withAlpha(
                role === "before" ? 0.55 : 0.9,
            ),
            outlineWidth: 1,
            heightReference: coordsHaveZ(coords)
                ? Cesium.HeightReference.NONE
                : Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        allowPicking: false,
    });
}

function addLine(
    Cesium: any,
    ds: any,
    id: string,
    coords: unknown,
    op: DiffOp,
    role: Role,
) {
    const positions = ringToCartesians(Cesium, coords);
    if (positions.length < 2) return;
    const color = lineColor(Cesium, op, role);
    const material = dashed(op, role)
        ? new Cesium.PolylineDashMaterialProperty({
              color,
              dashLength: 16,
          })
        : color;
    ds.entities.add({
        id,
        polyline: {
            positions,
            width: role === "before" ? 2 : 3,
            material,
            clampToGround: !coordsHaveZ(coords),
        },
        allowPicking: false,
    });
}

function addPolygon(
    Cesium: any,
    ds: any,
    id: string,
    coords: unknown,
    op: DiffOp,
    role: Role,
) {
    const rings = asRings(coords);
    const outer = ringToCartesians(Cesium, rings[0]);
    if (outer.length < 3) return;
    const holes = rings
        .slice(1)
        .map((r) => ringToCartesians(Cesium, r))
        .filter((r) => r.length >= 3);
    const hierarchy =
        holes.length > 0
            ? new Cesium.PolygonHierarchy(outer, holes)
            : outer;
    const color = fillColor(Cesium, op, role);
    const outline = lineColor(Cesium, op, role);
    ds.entities.add({
        id,
        polygon: {
            hierarchy,
            material: color,
            outline: true,
            outlineColor: outline,
            outlineWidth: 2,
            perPositionHeight: coordsHaveZ(coords),
            heightReference: coordsHaveZ(coords)
                ? Cesium.HeightReference.NONE
                : Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        allowPicking: false,
    });
    if (dashed(op, role) && outer.length >= 2) {
        ds.entities.add({
            id: `${id}:dash`,
            polyline: {
                positions: outer,
                width: 2,
                material: new Cesium.PolylineDashMaterialProperty({
                    color: outline,
                    dashLength: 14,
                }),
                clampToGround: !coordsHaveZ(coords),
            },
            allowPicking: false,
        });
    }
}

function paintGeometry(
    Cesium: any,
    ds: any,
    idBase: string,
    geom: GeoJsonGeometry,
    op: DiffOp,
    role: Role,
) {
    let n = 0;
    const nextId = () => `${idBase}:${n++}`;

    const visit = (g: GeoJsonGeometry) => {
        switch (g.type) {
            case "Point":
                addPoint(Cesium, ds, nextId(), g.coordinates, op, role);
                break;
            case "MultiPoint":
                for (const c of asRings(g.coordinates)) {
                    addPoint(Cesium, ds, nextId(), c, op, role);
                }
                break;
            case "LineString":
                addLine(Cesium, ds, nextId(), g.coordinates, op, role);
                break;
            case "MultiLineString":
                for (const c of asRings(g.coordinates)) {
                    addLine(Cesium, ds, nextId(), c, op, role);
                }
                break;
            case "Polygon":
                addPolygon(Cesium, ds, nextId(), g.coordinates, op, role);
                break;
            case "MultiPolygon":
                for (const c of asRings(g.coordinates)) {
                    addPolygon(Cesium, ds, nextId(), c, op, role);
                }
                break;
            case "GeometryCollection":
                for (const child of asRings(g.geometries)) {
                    const parsed = asGeometry(child);
                    if (parsed) visit(parsed);
                }
                break;
            default:
                break;
        }
    };
    visit(geom);
}

function addFeature(Cesium: any, ds: any, f: DiffFeature) {
    const op = f.op;
    if (f.oldGeometry) {
        paintGeometry(Cesium, ds, `${f.id}:before`, f.oldGeometry, op, "before");
    }
    if (f.geometry) {
        paintGeometry(Cesium, ds, `${f.id}:after`, f.geometry, op, "after");
    }
}

/** Paint `DiffFeature[]` on Cesium. Empty list removes the overlay. */
export async function syncDiffOverlay(
    Cesium: any,
    viewer: any,
    features: DiffFeature[],
): Promise<any | null> {
    if (!Cesium || !viewer) return null;
    let ds = findDiffDataSource(viewer);
    if (!features.length) {
        if (ds) {
            try {
                viewer.dataSources.remove(ds, true);
            } catch {
                /* ignore */
            }
        }
        return null;
    }
    if (!ds) {
        ds = new Cesium.CustomDataSource(GEO_DIFF_DS_NAME);
        await viewer.dataSources.add(ds);
    }
    ds.entities.removeAll();
    for (const f of features) addFeature(Cesium, ds, f);
    return ds;
}

export function destroyDiffOverlay(viewer: any, ds: any | null) {
    if (!ds) return;
    try {
        viewer?.dataSources?.remove?.(ds, true);
    } catch {
        /* ignore */
    }
}
