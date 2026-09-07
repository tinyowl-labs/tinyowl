/**
 * Measure-tool session for LayerScene: draft paint, commit, Cesium handler.
 * Shared globe picks (mesh/terrain/ellipsoid) stay in the component.
 */
import { cesiumMapLabel } from "$lib/components/cesiumBoot";
import {
    computeMeasureValue,
    formatLengthSubtext,
    formatMeasureValue,
    measureHint,
    minVertices,
    newMeasureId,
    type MeasureMode,
    type MeasureRecord,
    type MeasureVertex,
} from "$lib/measure";

const MEASURE_COLOR = "#ca8a04";
const MEASURE_DS_NAME = "tinyowl-measure";

export type MeasureSession = {
    draftVertices: MeasureVertex[];
    draftCartesians: any[];
    dataSource: any | null;
    dsAdd: Promise<unknown> | null;
    handler: any;
};

export type LayerSceneMeasureCtx = {
    Cesium: any;
    viewer: any;
    session: MeasureSession;
    measureMode: MeasureMode;
    dim: "2d" | "3d";
    bumpRender: () => void;
    pickMeasureCartesian: (position: any) => any | null;
    cartesianToVertex: (cartesian: any) => MeasureVertex;
    getRecords: () => MeasureRecord[];
    setRecords: (next: MeasureRecord[]) => void;
    setStatus: (msg: string) => void;
};

export function createMeasureSession(): MeasureSession {
    return {
        draftVertices: [],
        draftCartesians: [],
        dataSource: null,
        dsAdd: null,
        handler: null,
    };
}

function measureColor(Cesium: any) {
    return Cesium.Color.fromCssColorString(MEASURE_COLOR);
}

function lengthValue(
    measureMode: MeasureMode,
    vertices: MeasureVertex[],
): number {
    return computeMeasureValue(measureMode, vertices);
}

function formatLengthStatus(
    measureMode: MeasureMode,
    vertices: MeasureVertex[],
): string {
    const value = lengthValue(measureMode, vertices);
    const hero = formatMeasureValue(measureMode, value, vertices);
    if (measureMode !== "length") return hero;
    const sub = formatLengthSubtext(vertices);
    return sub ? `${hero} · ${sub}` : hero;
}

function getOrCreateMeasureDs(ctx: LayerSceneMeasureCtx) {
    const { Cesium, viewer, session } = ctx;
    if (!viewer || !Cesium) return null;
    if (session.dataSource) return session.dataSource;
    session.dataSource = new Cesium.CustomDataSource(MEASURE_DS_NAME);
    session.dsAdd = viewer.dataSources.add(session.dataSource);
    void session.dsAdd?.then(() => ctx.bumpRender());
    return session.dataSource;
}

async function ensureMeasureDs(ctx: LayerSceneMeasureCtx) {
    const ds = getOrCreateMeasureDs(ctx);
    if (!ds) return null;
    if (ctx.session.dsAdd) await ctx.session.dsAdd;
    return ds;
}

function clearDraftEntitiesOnly(ctx: LayerSceneMeasureCtx) {
    const ds = ctx.session.dataSource;
    if (!ds) return;
    const ids = [
        "draft:line",
        "draft:poly",
        "draft:label",
        ...Array.from({ length: 32 }, (_, i) => `draft:pt:${i}`),
    ];
    for (const id of ids) {
        try {
            ds.entities.removeById(id);
        } catch {
            /* ignore */
        }
    }
}

export function clearDraftMeasure(ctx: LayerSceneMeasureCtx) {
    ctx.session.draftVertices = [];
    ctx.session.draftCartesians = [];
    clearDraftEntitiesOnly(ctx);
}

function paintDraftMeasure(ctx: LayerSceneMeasureCtx) {
    const { Cesium, session, measureMode } = ctx;
    const ds = getOrCreateMeasureDs(ctx);
    if (!ds || !Cesium) return;
    clearDraftEntitiesOnly(ctx);
    const color = measureColor(Cesium);
    const drafts = session.draftCartesians;
    for (let i = 0; i < drafts.length; i++) {
        ds.entities.add({
            id: `draft:pt:${i}`,
            position: drafts[i],
            point: {
                pixelSize: 8,
                color,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        });
    }
    if (drafts.length >= 2) {
        ds.entities.add({
            id: "draft:line",
            polyline: {
                positions: drafts.slice(),
                width: 3,
                material: new Cesium.PolylineDashMaterialProperty({
                    color,
                }),
                clampToGround: false,
            },
        });
    }
    if (measureMode === "area" && drafts.length >= 3) {
        ds.entities.add({
            id: "draft:poly",
            polygon: {
                hierarchy: new Cesium.PolygonHierarchy(drafts.slice()),
                material: color.withAlpha(0.18),
                outline: true,
                outlineColor: color,
                perPositionHeight: true,
            },
        });
    }
    if (drafts.length >= minVertices(measureMode)) {
        const value = lengthValue(measureMode, session.draftVertices);
        const mid = drafts[Math.floor(drafts.length / 2)];
        ds.entities.add({
            id: "draft:label",
            position: mid,
            label: {
                ...cesiumMapLabel(
                    Cesium,
                    formatMeasureValue(measureMode, value, session.draftVertices),
                    { pixelOffsetY: -12 },
                ),
            },
        });
    }
    ctx.bumpRender();
}

async function commitMeasure3d(ctx: LayerSceneMeasureCtx) {
    const { Cesium, session, measureMode } = ctx;
    const ds = await ensureMeasureDs(ctx);
    if (!ds || !Cesium) return;
    const need = minVertices(measureMode);
    if (session.draftCartesians.length < need) return;

    const value = lengthValue(measureMode, session.draftVertices);
    const id = newMeasureId();
    const label = formatMeasureValue(
        measureMode,
        value,
        session.draftVertices,
    );
    const color = measureColor(Cesium);
    const positions = [...session.draftCartesians];

    clearDraftEntitiesOnly(ctx);
    for (let i = 0; i < positions.length; i++) {
        ds.entities.add({
            id: `${id}:pt:${i}`,
            position: positions[i],
            point: {
                pixelSize: measureMode === "point" ? 10 : 7,
                color,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        });
    }
    if (measureMode === "area") {
        ds.entities.add({
            id: `${id}:poly`,
            polygon: {
                hierarchy: new Cesium.PolygonHierarchy(positions.slice()),
                material: color.withAlpha(0.22),
                outline: true,
                outlineColor: color,
                perPositionHeight: true,
            },
        });
    } else if (measureMode === "length") {
        ds.entities.add({
            id: `${id}:line`,
            polyline: {
                positions: positions.slice(),
                width: 3,
                material: color,
                clampToGround: false,
            },
        });
    }
    const mid = positions[Math.floor(positions.length / 2)];
    ds.entities.add({
        id: `${id}:label`,
        position: mid,
        label: {
            ...cesiumMapLabel(Cesium, label, { pixelOffsetY: -12 }),
        },
    });

    ctx.setRecords([
        ...ctx.getRecords(),
        {
            id,
            mode: measureMode,
            label,
            value,
            vertices: [...session.draftVertices],
        },
    ]);
    session.draftVertices = [];
    session.draftCartesians = [];
    ctx.setStatus(
        `${label} saved · ${measureHint(measureMode, ctx.dim === "2d" ? "2d" : "3d")}`,
    );
    ctx.bumpRender();
}

export async function removeMeasurement(
    ctx: LayerSceneMeasureCtx,
    id: string,
) {
    const ds = ctx.session.dataSource;
    if (ds) {
        const ents = [...ds.entities.values];
        for (const ent of ents) {
            const eid = String(ent.id ?? "");
            if (eid === id || eid.startsWith(`${id}:`)) {
                try {
                    ds.entities.remove(ent);
                } catch {
                    /* ignore */
                }
            }
        }
    }
    ctx.setRecords(ctx.getRecords().filter((r) => r.id !== id));
    ctx.bumpRender();
}

export function popLastMeasureVertex(
    ctx: LayerSceneMeasureCtx,
    repaint = true,
) {
    const { session } = ctx;
    if (session.draftCartesians.length === 0) return;
    session.draftCartesians = session.draftCartesians.slice(0, -1);
    session.draftVertices = session.draftVertices.slice(0, -1);
    if (repaint) paintDraftMeasure(ctx);
}

async function onMeasurePick(
    ctx: LayerSceneMeasureCtx,
    screenPos: any,
) {
    const { session, measureMode } = ctx;
    const cartesian = ctx.pickMeasureCartesian(screenPos);
    if (!cartesian) {
        ctx.setStatus("Could not pick a point — try the mesh or terrain");
        return;
    }
    session.draftCartesians = [...session.draftCartesians, cartesian];
    session.draftVertices = [
        ...session.draftVertices,
        ctx.cartesianToVertex(cartesian),
    ];
    if (measureMode === "point") {
        paintDraftMeasure(ctx);
        await commitMeasure3d(ctx);
        return;
    }
    paintDraftMeasure(ctx);
    const n = session.draftCartesians.length;
    ctx.setStatus(
        n < minVertices(measureMode)
            ? `${n} point${n === 1 ? "" : "s"} · ${measureHint(measureMode, ctx.dim === "2d" ? "2d" : "3d")}`
            : `${formatLengthStatus(measureMode, session.draftVertices)} · Finish, double-click, or Enter`,
    );
}

export async function clearMeasurements(ctx: LayerSceneMeasureCtx) {
    const { viewer, session, measureMode } = ctx;
    clearDraftMeasure(ctx);
    clearDraftEntitiesOnly(ctx);
    if (session.dataSource && viewer) {
        try {
            viewer.dataSources.remove(session.dataSource, true);
        } catch {
            /* ignore */
        }
    }
    session.dataSource = null;
    session.dsAdd = null;
    ctx.setRecords([]);
    ctx.setStatus(measureHint(measureMode, ctx.dim === "2d" ? "2d" : "3d"));
}

export function finishDraft3d(ctx: LayerSceneMeasureCtx): boolean {
    if (ctx.session.draftCartesians.length >= minVertices(ctx.measureMode)) {
        void commitMeasure3d(ctx);
        return true;
    }
    return false;
}

export function teardownMeasureHandler(ctx: LayerSceneMeasureCtx) {
    try {
        ctx.session.handler?.destroy?.();
    } catch {
        /* ignore */
    }
    ctx.session.handler = null;
}

export function setupMeasureHandler(getCtx: () => LayerSceneMeasureCtx) {
    const ctx = getCtx();
    const { Cesium, viewer, session } = ctx;
    if (!viewer || !Cesium) return;
    teardownMeasureHandler(ctx);
    session.handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    session.handler.setInputAction((click: { position: unknown }) => {
        void onMeasurePick(getCtx(), click.position);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    session.handler.setInputAction(() => {
        const live = getCtx();
        if (live.measureMode === "point") return;
        popLastMeasureVertex(live, false);
        if (!finishDraft3d(live)) paintDraftMeasure(live);
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    getOrCreateMeasureDs(ctx);
}
