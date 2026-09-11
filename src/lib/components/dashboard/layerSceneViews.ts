import { indexedMapRow, type LayerRowIndexes } from "./mapRowIndexes";
/**
 * Named-view paint + Cesium clustering for LayerScene CZML entities.
 */
import {
    activeView,
    contrastColor,
    defaultOpacityForPackets,
    DEFAULT_CLUSTER_PIXEL_RANGE,
    layerLegendColor,
    numericRange,
    POINT_OUTLINE_WIDTH,
    resolveFill,
    resolveHeight,
} from "./layerViews";
import type { LayerData } from "./layerTypes";
import type { SelectionKind } from "./selectionStyle";

export type ViewPaintMeta = {
    layerName: string;
    entityId: string;
    kind: "point" | "polyline" | "polygon";
    base: any;
    basePixelSize: number;
    baseWidth: number;
    baseOutlineWidth: number;
    baseOutline: any;
    baseAlpha: number;
    dash?: boolean;
    baseLon?: number;
    baseLat?: number;
    baseAlt?: number;
};

export type LayerViewPaintCtx = {
    rowIndexes: LayerRowIndexes;
    Cesium: any;
    viewer: any;
    layers: LayerData[];
    rows: Record<string, Record<string, unknown>[]>;
    entityMeta: {
        get(entity: object): ViewPaintMeta | undefined;
    };
    entityDataSources: () => any[];
    layerSources: Map<string, any>;
    clusteredSources: WeakSet<object>;
    paintSelection: (entity: any, kind: SelectionKind) => void;
};

function colorFromRgba(Cesium: any, rgba: number[], opacity: number) {
    const [r = 0, g = 0, b = 0, a = 255] = rgba;
    return new Cesium.Color(
        r / 255,
        g / 255,
        b / 255,
        (a / 255) * opacity,
    );
}

function applyEntityHeight(
    Cesium: any,
    entity: any,
    meta: ViewPaintMeta,
    meters: number | null,
) {
    if (meta.kind === "polygon" && entity.polygon) {
        if (meters == null) {
            entity.polygon.extrudedHeight = undefined;
            entity.polygon.height = undefined;
            return;
        }
        entity.polygon.height = 0;
        entity.polygon.extrudedHeight = Math.max(0, meters);
        if (Cesium.HeightReference) {
            entity.polygon.heightReference =
                Cesium.HeightReference.CLAMP_TO_GROUND;
            entity.polygon.extrudedHeightReference =
                Cesium.HeightReference.RELATIVE_TO_GROUND;
        }
        return;
    }
    if (
        meta.kind === "point" &&
        entity.position &&
        meta.baseLon != null &&
        meta.baseLat != null
    ) {
        const alt = (meta.baseAlt ?? 0) + (meters ?? 0);
        entity.position = Cesium.Cartesian3.fromDegrees(
            meta.baseLon,
            meta.baseLat,
            alt,
        );
    }
}

type ClusterApplied = {
    range: number;
    enabled: boolean;
    color: string;
};

const clusterApplied = new WeakMap<object, ClusterApplied>();
const clusterImages = new Map<string, string>();

function rgbaKey(rgba: number[]): string {
    return `${rgba[0] ?? 0},${rgba[1] ?? 0},${rgba[2] ?? 0}`;
}

function clusterCountImage(n: number, rgba: number[], size: number): string {
    const key = `${n}:${size}:${rgbaKey(rgba)}`;
    const hit = clusterImages.get(key);
    if (hit) return hit;
    const canvas = document.createElement("canvas");
    const dim = Math.max(1, Math.round(size));
    canvas.width = dim;
    canvas.height = dim;
    const g = canvas.getContext("2d");
    if (!g) return "";
    const r = dim / 2;
    const cr = rgba[0] ?? 230;
    const cg = rgba[1] ?? 80;
    const cb = rgba[2] ?? 80;
    g.beginPath();
    g.arc(r, r, Math.max(1, r - 1.5), 0, Math.PI * 2);
    g.fillStyle = `rgb(${cr},${cg},${cb})`;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = "rgba(255,255,255,0.92)";
    g.stroke();
    const text = String(n);
    g.font = `600 ${n < 100 ? 12 : 10}px ui-sans-serif, system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    const m = g.measureText(text);
    const ascent = m.actualBoundingBoxAscent ?? 8;
    const descent = m.actualBoundingBoxDescent ?? 2;
    const ty = r + (ascent - descent) / 2;
    g.lineJoin = "round";
    g.lineWidth = 3;
    g.strokeStyle = "rgba(0,0,0,0.7)";
    g.strokeText(text, r, ty);
    g.fillStyle = "#fff";
    g.fillText(text, r, ty);
    const url = canvas.toDataURL("image/png");
    clusterImages.set(key, url);
    return url;
}

function forceRecluster(ds: any, range: number) {
    ds.clustering.pixelRange = 0;
    ds.clustering.pixelRange = range;
}

function paintClusterPrimitive(
    Cesium: any,
    layers: LayerData[],
    ds: any,
    clusteredEntities: unknown[],
    cluster: any,
) {
    const n = clusteredEntities?.length ?? 0;
    const size = n < 10 ? 28 : n < 100 ? 36 : 44;
    const live = layers.find((l) => l.name === ds.name);
    const liveFill = layerLegendColor(live?.views, live?.activeViewId ?? "");
    try {
        if (cluster.point) cluster.point.show = false;
        if (cluster.label) cluster.label.show = false;
        if (cluster.billboard) {
            cluster.billboard.show = true;
            cluster.billboard.image = clusterCountImage(n, liveFill, size);
            cluster.billboard.color = Cesium.Color.WHITE;
            cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER;
            cluster.billboard.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
            cluster.billboard.disableDepthTestDistance =
                Number.POSITIVE_INFINITY;
            if (cluster.label?.id != null) {
                cluster.billboard.id = cluster.label.id;
            }
        }
    } catch {
        /* ignore */
    }
}

function applyLayerClustering(
    ctx: LayerViewPaintCtx,
    ds: any,
    layerName: string,
) {
    const { Cesium, layers, clusteredSources } = ctx;
    if (!Cesium || !ds?.clustering) return;
    const layer = layers.find((l) => l.name === layerName);
    const view = activeView(layer?.views, layer?.activeViewId ?? "");
    const on = Boolean(view?.style.cluster);
    const range =
        view?.style.clusterPixelRange && view.style.clusterPixelRange > 0
            ? view.style.clusterPixelRange
            : DEFAULT_CLUSTER_PIXEL_RANGE;
    const fill = layerLegendColor(layer?.views, layer?.activeViewId ?? "");
    const color = rgbaKey(fill);

    ds.clustering.minimumClusterSize = 2;
    ds.clustering.clusterPoints = true;
    ds.clustering.clusterBillboards = true;
    ds.clustering.clusterLabels = false;
    ds.__echidnaPaintCluster = (
        clusteredEntities: unknown[],
        cluster: any,
    ) => paintClusterPrimitive(Cesium, layers, ds, clusteredEntities, cluster);

    if (!clusteredSources.has(ds)) {
        clusteredSources.add(ds);
        ds.clustering.clusterEvent.addEventListener(
            (clusteredEntities: unknown[], cluster: any) => {
                ds.__echidnaPaintCluster?.(clusteredEntities, cluster);
            },
        );
    }

    const prev = clusterApplied.get(ds);
    if (!on) {
        if (ds.clustering.enabled) ds.clustering.enabled = false;
        clusterApplied.set(ds, { range, enabled: false, color });
        return;
    }

    const needEnable = !ds.clustering.enabled;
    const needBounce =
        needEnable ||
        !prev ||
        !prev.enabled ||
        prev.range !== range ||
        prev.color !== color;

    ds.clustering.pixelRange = range;
    if (needEnable) ds.clustering.enabled = true;
    if (needBounce) forceRecluster(ds, range);
    clusterApplied.set(ds, { range, enabled: true, color });
}

/** Paint named-view fill / height / clustering onto CZML entities. */
export function paintLayerViews(ctx: LayerViewPaintCtx): boolean {
    const { Cesium, viewer, layers, rows } = ctx;
    if (!viewer || !Cesium) return false;
    const layersByName = new Map(layers.map(layer => [layer.name, layer]));
    const ranges = new Map<
        string,
        {
            color: { min: number; max: number } | null;
            height: { min: number; max: number } | null;
        }
    >();
    for (const layer of layers) {
        const view = activeView(layer.views, layer.activeViewId ?? "");
        if (!view) continue;
        const tableRows = rows[layer.name];
        ranges.set(layer.name, {
            color: view.style.colorField
                ? numericRange(tableRows, view.style.colorField)
                : null,
            height: view.style.heightField
                ? numericRange(tableRows, view.style.heightField)
                : null,
        });
    }
    for (const ds of ctx.entityDataSources()) {
        try {
            for (const entity of ds.entities.values) {
                const meta = ctx.entityMeta.get(entity);
                if (!meta) continue;
                const layer = layersByName.get(meta.layerName);
                const view = activeView(layer?.views, layer?.activeViewId ?? "");
                const op = Math.max(
                    0,
                    Math.min(
                        1,
                        layer?.opacity ??
                            defaultOpacityForPackets(layer?.packets),
                    ),
                );
                const span = ranges.get(meta.layerName);
                if (view) {
                    const row = indexedMapRow(ctx.rowIndexes, meta.layerName, meta.entityId);
                    const fill = resolveFill(view.style, row, span?.color);
                    const outline = contrastColor(fill);
                    meta.dash = Boolean(view.style.dash);
                    meta.basePixelSize =
                        view.style.pointSize || meta.basePixelSize;
                    meta.baseWidth = view.style.strokeWidth || meta.baseWidth;
                    if (meta.kind === "point") {
                        meta.baseOutlineWidth = POINT_OUTLINE_WIDTH;
                        meta.base = colorFromRgba(Cesium, fill, op);
                        meta.baseOutline = colorFromRgba(Cesium, outline, 1);
                        meta.baseAlpha = ((fill[3] ?? 255) / 255) * op;
                    } else if (meta.kind === "polyline") {
                        const line =
                            view.source === "sld" &&
                            view.style.strokeColor?.length
                                ? view.style.strokeColor
                                : fill;
                        meta.base = colorFromRgba(Cesium, line, op);
                        meta.baseOutline = colorFromRgba(Cesium, line, op);
                        meta.baseAlpha = ((line[3] ?? 255) / 255) * op;
                    } else {
                        meta.baseOutlineWidth = view.style.strokeWidth || 1;
                        meta.base = colorFromRgba(Cesium, fill, op);
                        meta.baseOutline = colorFromRgba(Cesium, outline, 1);
                        meta.baseAlpha = ((fill[3] ?? 255) / 255) * op;
                    }
                    applyEntityHeight(
                        Cesium,
                        entity,
                        meta,
                        resolveHeight(view.style, row, span?.height),
                    );
                } else {
                    applyEntityHeight(Cesium, entity, meta, null);
                }
                ctx.paintSelection(entity, null);
            }
        } catch {
            /* ignore */
        }
    }
    for (const [name, ds] of ctx.layerSources) {
        try {
            applyLayerClustering(ctx, ds, name);
        } catch {
            /* ignore */
        }
    }
    return true;
}
