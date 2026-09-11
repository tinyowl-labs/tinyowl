import { DIFF_OP_FILL } from "./colors";
import { asGeometry, coordsHaveMeaningfulZ } from "./geometry";
import type { DiffFeature, DiffOp, GeoJsonGeometry } from "./types";

const GEO_DIFF_DS_NAME = "tinyowl-geo-diff";
export const PEER_AWARENESS_DS_NAME = "tinyowl-peer-awareness";

type Role = "after" | "before";

type OverlayStamp = {
    tinyowlTable: string;
    tinyowlEntityId: string;
    tinyowlRole: Role;
};

function findNamedDataSource(viewer: any, name: string): any | null {
    const col = viewer?.dataSources;
    if (!col) return null;
    const n = col.length ?? 0;
    for (let i = 0; i < n; i++) {
        const ds = col.get(i);
        if (ds?.name === name) return ds;
    }
    return null;
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

function fillColor(Cesium: any, op: DiffOp, role: Role, tint?: string) {
    if (role === "before") {
        const grey = Cesium.Color.fromCssColorString("#94a3b8");
        return (grey ?? Cesium.Color.GRAY).withAlpha(0.35);
    }
    const hex = tint || DIFF_OP_FILL[op] || DIFF_OP_FILL.head;
    const base =
        Cesium.Color.fromCssColorString(hex) ?? Cesium.Color.ORANGE;
    if (op === "delete") return base.withAlpha(0.4);
    if (op === "head") return base.withAlpha(0.55);
    return base.withAlpha(0.45);
}

function lineColor(Cesium: any, op: DiffOp, role: Role, tint?: string) {
    if (role === "before") {
        const grey = Cesium.Color.fromCssColorString("#94a3b8");
        return (grey ?? Cesium.Color.GRAY).withAlpha(0.95);
    }
    const hex = tint || DIFF_OP_FILL[op] || DIFF_OP_FILL.head;
    const base =
        Cesium.Color.fromCssColorString(hex) ?? Cesium.Color.ORANGE;
    if (op === "delete") return base.withAlpha(0.7);
    return base;
}

function dashed(op: DiffOp, role: Role) {
    return role === "before" || op === "delete";
}

function overlayStamp(
    table: string,
    entityId: string,
    role: Role,
): OverlayStamp {
    return {
        tinyowlTable: table,
        tinyowlEntityId: entityId,
        tinyowlRole: role,
    };
}

type PaintStyle = {
    tint?: string;
    pickable: boolean;
    outline?: boolean;
    emphasis?: boolean;
};

function addPoint(
    Cesium: any,
    ds: any,
    id: string,
    coords: unknown,
    op: DiffOp,
    role: Role,
    stamp: OverlayStamp,
    style: PaintStyle,
) {
    if (!Array.isArray(coords) || coords.length < 2) return;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    const h =
        coords.length > 2 && Number.isFinite(Number(coords[2]))
            ? Number(coords[2])
            : 0;
    const stroke = lineColor(Cesium, op, role, style.tint);
    const fill = style.outline
        ? Cesium.Color.TRANSPARENT
        : fillColor(Cesium, op, role, style.tint);
    ds.entities.add({
        id,
        properties: stamp,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, h),
        point: {
            pixelSize: style.emphasis ? 16 : role === "before" ? 8 : 12,
            color: fill,
            outlineColor: style.outline
                ? stroke
                : Cesium.Color.WHITE.withAlpha(
                      role === "before" ? 0.55 : 0.9,
                  ),
            outlineWidth: style.outline ? (style.emphasis ? 3 : 2) : 1,
            heightReference: coordsHaveMeaningfulZ(coords)
                ? Cesium.HeightReference.NONE
                : Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        allowPicking: style.pickable && role === "after",
    });
}

function addLine(
    Cesium: any,
    ds: any,
    id: string,
    coords: unknown,
    op: DiffOp,
    role: Role,
    stamp: OverlayStamp,
    style: PaintStyle,
) {
    const positions = ringToCartesians(Cesium, coords);
    if (positions.length < 2) return;
    const color = lineColor(Cesium, op, role, style.tint);
    const material = dashed(op, role)
        ? new Cesium.PolylineDashMaterialProperty({
              color,
              dashLength: 16,
          })
        : color;
    ds.entities.add({
        id,
        properties: stamp,
        polyline: {
            positions,
            width: style.emphasis ? 5 : role === "before" ? 2 : 3,
            material,
            clampToGround: !coordsHaveMeaningfulZ(coords),
        },
        allowPicking: style.pickable && role === "after",
    });
}

function closedPositions(pts: any[]): any[] {
    if (pts.length < 2) return pts.slice();
    const out = pts.slice();
    out.push(pts[0]);
    return out;
}

function addOutlineRings(
    Cesium: any,
    ds: any,
    id: string,
    rings: unknown[],
    op: DiffOp,
    role: Role,
    pickable: boolean,
    stamp: OverlayStamp,
    style: PaintStyle,
) {
    const clamp = !coordsHaveMeaningfulZ(rings);
    const color = lineColor(Cesium, op, role, style.tint);
    const material = dashed(op, role)
        ? new Cesium.PolylineDashMaterialProperty({
              color,
              dashLength: 16,
          })
        : color;
    const width = style.emphasis ? 5 : role === "before" ? 2 : 3;
    let ringIdx = 0;
    for (const raw of rings) {
        const pts = ringToCartesians(Cesium, raw);
        if (pts.length < (ringIdx === 0 ? 3 : 2)) continue;
        ds.entities.add({
            id: ringIdx === 0 ? id : `${id}:hole:${ringIdx}`,
            properties: stamp,
            polyline: {
                positions: closedPositions(pts),
                width,
                material,
                clampToGround: clamp,
            },
            allowPicking: pickable && ringIdx === 0,
        });
        ringIdx += 1;
    }
}

function addPolygon(
    Cesium: any,
    ds: any,
    id: string,
    coords: unknown,
    op: DiffOp,
    role: Role,
    stamp: OverlayStamp,
    style: PaintStyle,
) {
    const rings = asRings(coords);
    const outer = ringToCartesians(Cesium, rings[0]);
    if (outer.length < 3) return;
    if (role === "before" || style.outline) {
        addOutlineRings(Cesium, ds, id, rings, op, role, false, stamp, style);
        return;
    }
    const holes = rings
        .slice(1)
        .map((r) => ringToCartesians(Cesium, r))
        .filter((r) => r.length >= 3)
        .map((r) => new Cesium.PolygonHierarchy(r.slice()));
    const hierarchy = new Cesium.PolygonHierarchy(outer.slice(), holes);
    const fill = fillColor(Cesium, op, role, style.tint);
    const outline = lineColor(Cesium, op, role, style.tint);
    const withZ = coordsHaveMeaningfulZ(coords);
    ds.entities.add({
        id,
        properties: stamp,
        polygon: {
            hierarchy,
            material: fill,
            outline: true,
            outlineColor: outline,
            outlineWidth: 2,
            perPositionHeight: withZ,
            heightReference: withZ
                ? Cesium.HeightReference.NONE
                : Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        allowPicking: style.pickable,
    });
}

function paintGeometry(
    Cesium: any,
    ds: any,
    idBase: string,
    geom: GeoJsonGeometry,
    op: DiffOp,
    role: Role,
    stamp: OverlayStamp,
    style: PaintStyle,
) {
    let n = 0;
    const nextId = () => `${idBase}:${n++}`;

    const visit = (g: GeoJsonGeometry) => {
        switch (g.type) {
            case "Point":
                addPoint(Cesium, ds, nextId(), g.coordinates, op, role, stamp, style);
                break;
            case "MultiPoint":
                for (const c of asRings(g.coordinates)) {
                    addPoint(Cesium, ds, nextId(), c, op, role, stamp, style);
                }
                break;
            case "LineString":
                addLine(Cesium, ds, nextId(), g.coordinates, op, role, stamp, style);
                break;
            case "MultiLineString":
                for (const c of asRings(g.coordinates)) {
                    addLine(Cesium, ds, nextId(), c, op, role, stamp, style);
                }
                break;
            case "Polygon":
                addPolygon(Cesium, ds, nextId(), g.coordinates, op, role, stamp, style);
                break;
            case "MultiPolygon":
                for (const c of asRings(g.coordinates)) {
                    addPolygon(Cesium, ds, nextId(), c, op, role, stamp, style);
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
    const style: PaintStyle = {
        tint: f.color,
        pickable: f.pickable !== false,
        outline: Boolean(f.outline),
        emphasis: Boolean(f.emphasis),
    };
    if (f.oldGeometry) {
        paintGeometry(
            Cesium,
            ds,
            `${f.id}:before`,
            f.oldGeometry,
            op,
            "before",
            overlayStamp(f.table, f.entityId, "before"),
            style,
        );
    }
    if (f.geometry) {
        paintGeometry(
            Cesium,
            ds,
            `${f.id}:after`,
            f.geometry,
            op,
            "after",
            overlayStamp(f.table, f.entityId, "after"),
            style,
        );
    }
}

/** One in-flight `dataSources.add` per name so filter flips cannot double-push. */
const overlayAttach = new WeakMap<object, Map<string, Promise<any>>>();

export async function getOrAttachOverlayDs(
    Cesium: any,
    viewer: any,
    name: string,
): Promise<any> {
    const existing = findNamedDataSource(viewer, name);
    if (existing) return existing;
    let attachments = overlayAttach.get(viewer);
    if (!attachments) { attachments = new Map(); overlayAttach.set(viewer, attachments); }
    let pending = attachments.get(name);
    if (!pending) {
        const created = new Cesium.CustomDataSource(name);
        pending = Promise.resolve(viewer.dataSources.add(created)).then(
            () => created,
        );
        attachments.set(name, pending);
        const cleanup = () => { attachments!.delete(name); };
        void pending.then(cleanup, cleanup);
    }
    return pending;
}

/** Paint `DiffFeature[]` on Cesium. Empty list clears entities; the data source stays attached. */
export async function syncDiffOverlay(
    Cesium: any,
    viewer: any,
    features: DiffFeature[],
    name = GEO_DIFF_DS_NAME,
): Promise<any | null> {
    if (!Cesium || !viewer) return null;
    const ds = await getOrAttachOverlayDs(Cesium, viewer, name);
    ds.entities.removeAll();
    for (const f of features) addFeature(Cesium, ds, f);
    return ds;
}

export function overlayEntityInfo(
    entity: any,
): { table: string; entityId: string; role: Role } | null {
    if (!entity?.properties) return null;
    const read = (key: string): string => {
        try {
            const p = entity.properties[key];
            if (p == null) return "";
            const v = typeof p.getValue === "function" ? p.getValue() : p;
            return v == null ? "" : String(v);
        } catch {
            return "";
        }
    };
    const table = read("tinyowlTable");
    const entityId = read("tinyowlEntityId");
    const role = read("tinyowlRole");
    if (!table || !entityId || (role !== "after" && role !== "before")) {
        return null;
    }
    return { table, entityId, role: role as Role };
}

export function destroyDiffOverlay(viewer: any, ds?: any) {
    const target = ds ?? findNamedDataSource(viewer, GEO_DIFF_DS_NAME);
    if (!target) return;
    try {
        viewer?.dataSources?.remove?.(target, true);
    } catch {
        /* ignore */
    }
}
