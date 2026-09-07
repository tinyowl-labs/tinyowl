/**
 * Draw / vertex-edit session for LayerScene: draft paint, handler, vertex session.
 * Shared globe picks (mesh/terrain/ellipsoid) stay in the component.
 * Buffer → submitEditBuffer → required message is unchanged.
 */
import {
    asGeometry,
    geometriesEqual,
    overlayEntityInfo,
    submitEditBuffer,
    type GeoJsonGeometry,
    DIFF_OP_FILL,
} from "$lib/geoDiff";
import {
    draftFromGeometry,
    editBuffer,
    geometryFromDraft,
    isMultipartMode,
    type DrawGeomMode,
    type LonLatVertex,
} from "$lib/stores/editBuffer.svelte";
import { layerSelection, parseSelectionKey, toSelectionKey } from "$lib/stores/layerSelection.svelte";
import { SELECTION_PRIMARY } from "./selectionStyle";

const DRAW_COLOR = DIFF_OP_FILL.insert;
const DRAFT_MID_CROSS = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 11 11">
            <path fill="none" stroke="#000" stroke-width="1.8" stroke-linecap="square" d="M5.5 1v9M1 5.5h9"/>
        </svg>`,
)}`;

export type VertexSession = {
    table: string;
    entityId: string;
    bufferOp: "insert" | "update";
    oldGeometry: GeoJsonGeometry | null;
};

export type ScreenPt = { x: number; y: number };

export type DrawSession = {
    vertices: LonLatVertex[];
    cartesians: any[];
    parts: LonLatVertex[][];
    partCartesians: any[][];
    vertexCount: number;
    partCount: number;
    bindTable: string | null;
    dataSource: any | null;
    dsAdd: Promise<unknown> | null;
    handleDataSource: any | null;
    handleDsAdd: Promise<unknown> | null;
    dsEpoch: number;
    handler: any;
    vertexSession: VertexSession | null;
    vertexUndoStack: LonLatVertex[][];
    vertexDragIndex: number | null;
    midDragAfter: number | null;
    vertexDragMoved: boolean;
    vertexSuppressClick: boolean;
    selectedVertexIndices: Set<number>;
    vertexDragStartPositions: Map<number, LonLatVertex> | null;
    vertexMarqueeStart: ScreenPt | null;
    vertexMarqueeCurrent: ScreenPt | null;
    vertexMarqueeMoved: boolean;
    vertexMarqueeOp: "add" | "remove";
};

export type LayerSceneDrawCtx = {
    Cesium: any;
    viewer: any;
    session: DrawSession;
    dim: "2d" | "3d";
    drawMode: DrawGeomMode;
    drawUseHeight: boolean;
    editEnabled: boolean;
    editLayer: string;
    anyFormOpen: boolean;
    createFormOpen: boolean;
    drawNeed: number;
    drawCanFinish: boolean;
    bufferOverlayVisible: boolean;
    selectionTool: "click" | "box" | "lasso";
    canWrite: boolean;
    bumpRender: () => void;
    pickSnapCartesian: (position: any) => any | null;
    cartesianToVertex: (cartesian: any) => LonLatVertex;
    findEntityByKey: (key: string) => any | null;
    geometryFromCesiumEntity: (entity: any) => GeoJsonGeometry | null;
    applyHiddenVisibility: () => void;
    blockPeerEdit: (table: string, entityId: string) => boolean;
    closePickPager: (opts?: { suppressClick?: boolean }) => void;
    closeContextMenu: () => void;
    setDrawMode: (mode: DrawGeomMode) => void;
    setDrawUseHeight: (on: boolean) => void;
    setCreateFormOpen: (open: boolean) => void;
    setAttrEdit: (next: { table: string; entityId: string } | null) => void;
    getAttrEdit: () => { table: string; entityId: string } | null;
    getPendingGeometry: () => GeoJsonGeometry | null;
    setPendingGeometry: (geom: GeoJsonGeometry | null) => void;
    setBoxOverlay: (
        rect: { left: number; top: number; width: number; height: number } | null,
    ) => void;
    getLassoPoints: () => ScreenPt[];
    setLassoPoints: (pts: ScreenPt[]) => void;
    setLassoVisible: (on: boolean) => void;
    projectSlug: string;
    accessToken: string;
    getSessionBaseCommit: () => string;
    setSessionBaseCommit: (id: string) => void;
    getCommitMessage: () => string;
    setCommitMessage: (msg: string) => void;
    getCommitBusy: () => boolean;
    setCommitBusy: (busy: boolean) => void;
    setCommitError: (msg: string) => void;
    setCommitDoneId: (id: string) => void;
    setCommitDoneStatus: (status: "committed" | "conflicted" | "parked" | "") => void;
    setDevelopCommit: (id: string) => void;
    onCommitted?: () => void;
};

export function createDrawSession(): DrawSession {
    return {
        vertices: [],
        cartesians: [],
        parts: [],
        partCartesians: [],
        vertexCount: 0,
        partCount: 0,
        bindTable: null,
        dataSource: null,
        dsAdd: null,
        handleDataSource: null,
        handleDsAdd: null,
        dsEpoch: 0,
        handler: null,
        vertexSession: null,
        vertexUndoStack: [],
        vertexDragIndex: null,
        midDragAfter: null,
        vertexDragMoved: false,
        vertexSuppressClick: false,
        selectedVertexIndices: new Set(),
        vertexDragStartPositions: null,
        vertexMarqueeStart: null,
        vertexMarqueeCurrent: null,
        vertexMarqueeMoved: false,
        vertexMarqueeOp: "add",
    };
}

function drawColor(Cesium: any) {
    return Cesium.Color.fromCssColorString(DRAW_COLOR);
}

function handleEyeOffset(Cesium: any) {
    return new Cesium.Cartesian3(0, 0, 12);
}

function attachDrawNamedDs(
    ctx: LayerSceneDrawCtx,
    ds: any,
    gen: number,
    stillMine: () => boolean,
) {
    const { viewer } = ctx;
    const already = Boolean(viewer.dataSources.contains?.(ds));
    const attached = already
        ? Promise.resolve(ds)
        : Promise.resolve(viewer.dataSources.add(ds));
    return attached.then(
        (added) => {
            if (gen !== ctx.session.dsEpoch || !stillMine()) {
                try {
                    if (viewer.dataSources.contains?.(ds)) {
                        viewer.dataSources.remove(ds, true);
                    }
                } catch {
                    /* ignore */
                }
                return added;
            }
            ctx.bumpRender();
            return added;
        },
        () => ds,
    );
}

function getOrCreateDrawDs(ctx: LayerSceneDrawCtx) {
    const { Cesium, viewer, session } = ctx;
    if (!viewer || !Cesium) return null;
    if (!session.dataSource) {
        const gen = ++session.dsEpoch;
        const ds = new Cesium.CustomDataSource("tinyowl-draw");
        session.dataSource = ds;
        session.dsAdd = attachDrawNamedDs(ctx, ds, gen, () => session.dataSource === ds);
    }
    if (!session.handleDataSource) {
        const gen = session.dsEpoch || ++session.dsEpoch;
        const ds = new Cesium.CustomDataSource("tinyowl-draw-handles");
        session.handleDataSource = ds;
        session.handleDsAdd = attachDrawNamedDs(
            ctx,
            ds,
            gen,
            () => session.handleDataSource === ds,
        );
    }
    return session.dataSource;
}

function getOrCreateHandleDs(ctx: LayerSceneDrawCtx) {
    getOrCreateDrawDs(ctx);
    return ctx.session.handleDataSource;
}

function raiseDrawHandles(ctx: LayerSceneDrawCtx) {
    try {
        if (ctx.session.handleDataSource) {
            ctx.viewer?.dataSources?.raiseToTop?.(ctx.session.handleDataSource);
        }
    } catch {
        /* ignore */
    }
}

function clearDraftDrawEntitiesOnly(ctx: LayerSceneDrawCtx) {
    for (const ds of [ctx.session.dataSource, ctx.session.handleDataSource]) {
        if (!ds) continue;
        try {
            ds.entities.removeAll();
        } catch {
            /* ignore */
        }
    }
}

export function clearDraftDraw(ctx: LayerSceneDrawCtx) {
    const { session } = ctx;
    session.vertices = [];
    session.cartesians = [];
    session.parts = [];
    session.partCartesians = [];
    session.vertexCount = 0;
    session.partCount = 0;
    session.bindTable = null;
    clearDraftDrawEntitiesOnly(ctx);
}

function addDraftPoints(
    ctx: LayerSceneDrawCtx,
    ds: any,
    color: any,
    cartesians: any[],
    prefix: string,
    selected?: Set<number>,
    selectedColor?: any,
) {
    const { Cesium } = ctx;
    for (let i = 0; i < cartesians.length; i++) {
        const isSel = selected?.has(i) ?? false;
        ds.entities.add({
            id: `${prefix}:pt:${i}`,
            position: cartesians[i],
            point: {
                pixelSize: isSel ? 12 : 8,
                color: isSel && selectedColor ? selectedColor : color,
                outlineColor: isSel ? Cesium.Color.WHITE : Cesium.Color.BLACK,
                outlineWidth: isSel ? 2 : 1,
                heightReference: Cesium.HeightReference.NONE,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                eyeOffset: handleEyeOffset(Cesium),
            },
        });
    }
}

function addDraftMids(
    ctx: LayerSceneDrawCtx,
    ds: any,
    cartesians: any[],
    prefix: string,
    closed: boolean,
) {
    const { Cesium } = ctx;
    if (!Cesium || cartesians.length < 2) return;
    const n = cartesians.length;
    const segs = closed && n >= 3 ? n : n - 1;
    for (let i = 0; i < segs; i++) {
        const a = cartesians[i];
        const b = cartesians[(i + 1) % n];
        if (!a || !b) continue;
        const pos = Cesium.Cartesian3.midpoint(a, b, new Cesium.Cartesian3());
        ds.entities.add({
            id: `${prefix}:mid:${i}`,
            position: pos,
            billboard: {
                image: DRAFT_MID_CROSS,
                width: 11,
                height: 11,
                verticalOrigin: Cesium.VerticalOrigin?.CENTER,
                heightReference: Cesium.HeightReference.NONE,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                eyeOffset: handleEyeOffset(Cesium),
            },
        });
    }
}

function addDraftLine(ctx: LayerSceneDrawCtx, ds: any, color: any, cartesians: any[], id: string) {
    if (cartesians.length < 2) return;
    ds.entities.add({
        id,
        polyline: {
            positions: cartesians.slice(),
            width: 3,
            material: new ctx.Cesium.PolylineDashMaterialProperty({ color }),
            clampToGround: false,
        },
    });
}

function addDraftPoly(ctx: LayerSceneDrawCtx, ds: any, color: any, cartesians: any[], id: string) {
    const { Cesium } = ctx;
    if (cartesians.length < 3 || !Cesium) return;
    ds.entities.add({
        id,
        polygon: {
            hierarchy: new Cesium.PolygonHierarchy(cartesians.slice()),
            material: color.withAlpha(0.18),
            outline: true,
            outlineColor: color,
            perPositionHeight: true,
            heightReference: Cesium.HeightReference.NONE,
        },
    });
}

function vertsToCartesians(ctx: LayerSceneDrawCtx, verts: LonLatVertex[]): any[] {
    if (!ctx.Cesium) return [];
    return verts.map((v) => ctx.Cesium.Cartesian3.fromDegrees(v.lon, v.lat, v.height ?? 0));
}

function rebuildDrawCartesians(ctx: LayerSceneDrawCtx) {
    const { session } = ctx;
    session.cartesians = vertsToCartesians(ctx, session.vertices);
    session.partCartesians = session.parts.map((p) => vertsToCartesians(ctx, p));
}

export function paintDraftDraw(ctx: LayerSceneDrawCtx) {
    const ds = getOrCreateDrawDs(ctx);
    const handles = getOrCreateHandleDs(ctx);
    const { Cesium, session, drawMode } = ctx;
    if (!ds || !handles || !Cesium) return;
    clearDraftDrawEntitiesOnly(ctx);
    const color = drawColor(Cesium);
    const lineLike =
        drawMode === "LineString" ||
        drawMode === "MultiLineString" ||
        drawMode === "Polygon" ||
        drawMode === "MultiPolygon";
    const polyLike = drawMode === "Polygon" || drawMode === "MultiPolygon";
    for (let p = 0; p < session.partCartesians.length; p++) {
        const part = session.partCartesians[p]!;
        if (lineLike) addDraftLine(ctx, ds, color, part, `draw:part${p}:line`);
        if (polyLike) addDraftPoly(ctx, ds, color, part, `draw:part${p}:poly`);
        addDraftPoints(ctx, handles, color, part, `draw:part${p}`);
    }
    if (lineLike) addDraftLine(ctx, ds, color, session.cartesians, "draw:line");
    if (polyLike) addDraftPoly(ctx, ds, color, session.cartesians, "draw:poly");
    addDraftPoints(
        ctx,
        handles,
        color,
        session.cartesians,
        "draw",
        session.vertexSession ? session.selectedVertexIndices : undefined,
        Cesium.Color.fromCssColorString(SELECTION_PRIMARY),
    );
    if (lineLike) {
        addDraftMids(ctx, handles, session.cartesians, "draw", polyLike);
    }
    raiseDrawHandles(ctx);
    ctx.bumpRender();
}

export function snapshotPendingGeometry(ctx: LayerSceneDrawCtx): GeoJsonGeometry | null {
    const { session } = ctx;
    if (!(session.bindTable ?? ctx.editLayer)) return null;
    return geometryFromDraft(ctx.drawMode, session.vertices, session.parts, ctx.drawUseHeight);
}

export function setDrawUseHeight(ctx: LayerSceneDrawCtx, on: boolean) {
    if (ctx.drawUseHeight === on) return;
    ctx.setDrawUseHeight(on);
    const live = { ...ctx, drawUseHeight: on };
    rebuildDrawCartesians(live);
    paintDraftDraw(live);
    if (live.createFormOpen) {
        ctx.setPendingGeometry(snapshotPendingGeometry(live));
    }
}

export function openCreateForm(ctx: LayerSceneDrawCtx) {
    if (ctx.createFormOpen) return;
    const geom = snapshotPendingGeometry(ctx);
    if (!geom) return;
    ctx.setPendingGeometry(geom);
    ctx.setCreateFormOpen(true);
    ctx.bumpRender();
}

export function confirmCreate(ctx: LayerSceneDrawCtx, attrs: Record<string, string>) {
    const geom = ctx.getPendingGeometry() ?? snapshotPendingGeometry(ctx);
    const table = ctx.session.bindTable ?? ctx.editLayer;
    if (!geom || !table) {
        ctx.setPendingGeometry(null);
        ctx.setCreateFormOpen(false);
        return;
    }
    const sourceId = attrs.source_id?.trim();
    editBuffer.push({
        op: "insert",
        table,
        entityId: sourceId || editBuffer.nextEntityId(),
        geometry: geom,
        attributes: attrs,
    });
    ctx.setPendingGeometry(null);
    ctx.setCreateFormOpen(false);
    clearDraftDraw(ctx);
    ctx.bumpRender();
}

export function cancelCreate(ctx: LayerSceneDrawCtx) {
    ctx.setPendingGeometry(null);
    ctx.setCreateFormOpen(false);
    clearDraftDraw(ctx);
    ctx.bumpRender();
}

export function dismissCreateFormKeepDraft(ctx: LayerSceneDrawCtx) {
    ctx.setPendingGeometry(null);
    ctx.setCreateFormOpen(false);
    paintDraftDraw(ctx);
}

export function openAttrEdit(ctx: LayerSceneDrawCtx, table: string, entityId: string) {
    if (!ctx.canWrite || !table || !entityId) return;
    if (ctx.blockPeerEdit(table, entityId)) return;
    ctx.setCreateFormOpen(false);
    ctx.setPendingGeometry(null);
    ctx.setAttrEdit({ table, entityId });
    editBuffer.setTargetLayer(table);
    ctx.closePickPager({ suppressClick: true });
    ctx.closeContextMenu();
    ctx.bumpRender();
}

export function confirmAttrEdit(ctx: LayerSceneDrawCtx, attrs: Record<string, string>) {
    const attrEdit = ctx.getAttrEdit();
    if (!attrEdit) return;
    editBuffer.upsertAttributes(attrEdit.table, attrEdit.entityId, attrs);
    ctx.setAttrEdit(null);
    ctx.applyHiddenVisibility();
    ctx.bumpRender();
}

export function cancelAttrEdit(ctx: LayerSceneDrawCtx) {
    ctx.setAttrEdit(null);
    ctx.bumpRender();
}

function geometryForDelete(
    ctx: LayerSceneDrawCtx,
    table: string,
    entityId: string,
): GeoJsonGeometry | null {
    const buf = editBuffer.entries.find((e) => e.table === table && e.entityId === entityId);
    const fromBuf = asGeometry(buf?.geometry) ?? asGeometry(buf?.oldGeometry);
    if (fromBuf) return fromBuf;
    const vs = ctx.session.vertexSession;
    if (vs?.table === table && vs.entityId === entityId) {
        return snapshotPendingGeometry(ctx) ?? asGeometry(vs.oldGeometry);
    }
    const entity = ctx.findEntityByKey(toSelectionKey(table, entityId));
    return ctx.geometryFromCesiumEntity(entity);
}

export function deleteBufferedFeature(ctx: LayerSceneDrawCtx, table: string, entityId: string) {
    if (!ctx.canWrite || !table || !entityId) return;
    const geom = geometryForDelete(ctx, table, entityId);
    const vs = ctx.session.vertexSession;
    if (vs?.table === table && vs.entityId === entityId) {
        cancelVertexEdit(ctx);
    }
    editBuffer.markDelete(table, entityId, geom);
    const attrEdit = ctx.getAttrEdit();
    if (attrEdit?.table === table && attrEdit.entityId === entityId) {
        ctx.setAttrEdit(null);
    }
    layerSelection.removeSelection(table, entityId);
    ctx.closePickPager({ suppressClick: true });
    ctx.applyHiddenVisibility();
    ctx.bumpRender();
}

export function deleteSelectedFeatures(
    ctx: LayerSceneDrawCtx,
    opts: { ctxOpen: boolean; ctxKind: string; ctxLayerName: string; ctxEntityId: string },
) {
    if (!ctx.canWrite) return;
    const targets: { table: string; entityId: string }[] = [];
    const add = (table: string, entityId: string) => {
        if (!table || !entityId) return;
        if (targets.some((t) => t.table === table && t.entityId === entityId)) return;
        targets.push({ table, entityId });
    };
    const vs = ctx.session.vertexSession;
    if (vs) add(vs.table, vs.entityId);
    for (const key of layerSelection.keys()) {
        const { layer: l, id } = parseSelectionKey(key);
        add(l, id);
    }
    if (targets.length === 0 && opts.ctxOpen && opts.ctxKind === "entity") {
        add(opts.ctxLayerName, opts.ctxEntityId);
    }
    for (const t of targets) deleteBufferedFeature(ctx, t.table, t.entityId);
    ctx.closeContextMenu();
    ctx.closePickPager({ suppressClick: true });
}

export function addDrawPart(ctx: LayerSceneDrawCtx) {
    const { session } = ctx;
    if (!isMultipartMode(ctx.drawMode)) return;
    if (session.vertices.length < ctx.drawNeed) return;
    session.parts = [...session.parts, session.vertices];
    session.partCartesians = [...session.partCartesians, vertsToCartesians(ctx, session.vertices)];
    session.partCount = session.parts.length;
    session.vertices = [];
    session.cartesians = [];
    session.vertexCount = 0;
    paintDraftDraw(ctx);
}

export function popLastDrawVertex(ctx: LayerSceneDrawCtx, repaint = true) {
    const { session } = ctx;
    if (session.vertices.length === 0) return;
    session.vertices = session.vertices.slice(0, -1);
    session.cartesians = vertsToCartesians(ctx, session.vertices);
    session.vertexCount = session.vertices.length;
    if (session.vertices.length === 0 && session.parts.length === 0) {
        session.bindTable = null;
    }
    if (repaint) paintDraftDraw(ctx);
}

export function restoreLastDrawPart(ctx: LayerSceneDrawCtx): boolean {
    const { session } = ctx;
    if (session.parts.length === 0) return false;
    const last = session.parts[session.parts.length - 1]!;
    session.parts = session.parts.slice(0, -1);
    session.partCartesians = session.partCartesians.slice(0, -1);
    session.partCount = session.parts.length;
    session.vertices = last;
    session.cartesians = vertsToCartesians(ctx, last);
    session.vertexCount = last.length;
    paintDraftDraw(ctx);
    return true;
}

export function undoLastBuffer(): boolean {
    if (editBuffer.size === 0) return false;
    editBuffer.pop();
    return true;
}

export async function commitEditBuffer(ctx: LayerSceneDrawCtx) {
    const message = ctx.getCommitMessage().trim();
    if (!message || editBuffer.size === 0 || ctx.getCommitBusy() || !ctx.canWrite) return;
    if (ctx.session.vertexSession) {
        if (!commitVertexEdit(ctx)) cancelVertexEdit(ctx);
    }
    ctx.setCommitBusy(true);
    ctx.setCommitError("");
    ctx.setCommitDoneId("");
    ctx.setCommitDoneStatus("");
    try {
        const res = await submitEditBuffer(
            ctx.projectSlug,
            ctx.accessToken,
            message,
            editBuffer.entries,
            ctx.getSessionBaseCommit(),
        );
        if (res.status === "conflicted") {
            ctx.setCommitDoneId(res.commit_id);
            ctx.setCommitDoneStatus("conflicted");
            ctx.setCommitError(
                res.error || "Conflicts with develop; unmerged commit kept. Refresh and re-commit.",
            );
            return;
        }
        editBuffer.clear();
        ctx.setSessionBaseCommit("");
        ctx.setCommitMessage("");
        ctx.setCommitDoneId(res.commit_id);
        if (res.status === "parked") {
            ctx.setCommitDoneStatus("parked");
            ctx.setCommitError(
                res.error || "Develop moved; parked on a personal ref. Integrate from Review.",
            );
            ctx.onCommitted?.();
            return;
        }
        ctx.setCommitDoneStatus("committed");
        if (res.develop) ctx.setDevelopCommit(res.develop);
        ctx.onCommitted?.();
    } catch (e) {
        ctx.setCommitError(e instanceof Error ? e.message : "Commit failed");
    } finally {
        ctx.setCommitBusy(false);
        ctx.bumpRender();
    }
}

function loadDraftFromGeom(
    ctx: LayerSceneDrawCtx,
    geom: GeoJsonGeometry,
    modeHint?: DrawGeomMode,
): boolean {
    const draft = draftFromGeometry(geom);
    if (!draft) return false;
    const nextMode = modeHint && draft.mode === modeHint ? modeHint : draft.mode;
    ctx.setDrawMode(nextMode);
    const live = { ...ctx, drawMode: nextMode };
    const { session } = live;
    session.parts = draft.parts;
    session.partCartesians = draft.parts.map((p) => vertsToCartesians(live, p));
    session.partCount = draft.parts.length;
    session.vertices = draft.vertices;
    session.cartesians = vertsToCartesians(live, draft.vertices);
    session.vertexCount = draft.vertices.length;
    paintDraftDraw(live);
    raiseDrawHandles(live);
    return true;
}

export function cancelVertexEdit(ctx: LayerSceneDrawCtx) {
    const { session } = ctx;
    session.vertexSession = null;
    session.vertexUndoStack = [];
    session.vertexDragIndex = null;
    session.midDragAfter = null;
    session.vertexDragStartPositions = null;
    session.selectedVertexIndices = new Set();
    clearDraftDraw(ctx);
    ctx.applyHiddenVisibility();
    paintDraftDraw(ctx);
}

export function beginVertexEdit(ctx: LayerSceneDrawCtx, table: string, entityId: string): boolean {
    if (ctx.anyFormOpen) return false;
    if (ctx.blockPeerEdit(table, entityId)) return false;
    const buf = editBuffer.entries.find((e) => e.table === table && e.entityId === entityId);
    let geom: GeoJsonGeometry | null = null;
    let oldGeometry: GeoJsonGeometry | null = null;
    let bufferOp: "insert" | "update" = "update";
    if (buf) {
        geom = asGeometry(buf.geometry);
        oldGeometry = asGeometry(buf.oldGeometry);
        if (buf.op === "delete") return false;
        bufferOp = buf.op === "insert" ? "insert" : "update";
    }
    if (!geom) {
        const entity = ctx.findEntityByKey(toSelectionKey(table, entityId));
        geom = ctx.geometryFromCesiumEntity(entity);
        oldGeometry = geom;
    }
    if (!geom || !loadDraftFromGeom(ctx, geom)) return false;
    if (editBuffer.targetLayer !== table) {
        editBuffer.setTargetLayer(table);
    }
    ctx.session.vertexSession = { table, entityId, bufferOp, oldGeometry };
    ctx.session.vertexUndoStack = [];
    ctx.session.selectedVertexIndices = new Set();
    ctx.session.vertexDragStartPositions = null;
    ctx.applyHiddenVisibility();
    return true;
}

export function commitVertexEdit(ctx: LayerSceneDrawCtx): boolean {
    const vs = ctx.session.vertexSession;
    if (!vs) return false;
    const geom = snapshotPendingGeometry(ctx);
    if (!geom) return false;
    editBuffer.upsert({
        op: vs.bufferOp,
        table: vs.table,
        entityId: vs.entityId,
        geometry: geom,
        oldGeometry: vs.bufferOp === "insert" ? null : vs.oldGeometry,
    });
    const { session } = ctx;
    session.vertexSession = null;
    session.vertexUndoStack = [];
    session.vertexDragIndex = null;
    session.midDragAfter = null;
    session.vertexDragStartPositions = null;
    session.selectedVertexIndices = new Set();
    clearDraftDraw(ctx);
    ctx.applyHiddenVisibility();
    ctx.bumpRender();
    return true;
}

export function settleVertexSessionOnExit(ctx: LayerSceneDrawCtx) {
    const vs = ctx.session.vertexSession;
    if (!vs) return;
    const geom = snapshotPendingGeometry(ctx);
    if (!geom) {
        cancelVertexEdit(ctx);
        return;
    }
    const buf = editBuffer.entries.find((e) => e.table === vs.table && e.entityId === vs.entityId);
    const baseline = buf ? asGeometry(buf.geometry) : vs.oldGeometry;
    if (geometriesEqual(geom, baseline)) {
        cancelVertexEdit(ctx);
        return;
    }
    commitVertexEdit(ctx);
}

export function undoVertexStep(ctx: LayerSceneDrawCtx): boolean {
    const { session } = ctx;
    if (session.vertexUndoStack.length === 0) return false;
    const prev = session.vertexUndoStack.pop()!;
    session.vertices = prev;
    session.cartesians = vertsToCartesians(ctx, prev);
    session.vertexCount = prev.length;
    session.selectedVertexIndices = new Set(
        [...session.selectedVertexIndices].filter((i) => i < prev.length),
    );
    paintDraftDraw(ctx);
    return true;
}

function vertexEditHandlesActive(ctx: LayerSceneDrawCtx): boolean {
    if (!ctx.session.vertexSession) return false;
    const { drawMode } = ctx;
    return (
        drawMode === "Polygon" ||
        drawMode === "LineString" ||
        drawMode === "MultiPolygon" ||
        drawMode === "MultiLineString" ||
        drawMode === "Point" ||
        drawMode === "MultiPoint"
    );
}

export function clearVertexSelection(ctx: LayerSceneDrawCtx, repaint = true) {
    if (ctx.session.selectedVertexIndices.size === 0) return;
    ctx.session.selectedVertexIndices = new Set();
    if (repaint) paintDraftDraw(ctx);
}

function applyVertexSelectionOp(
    ctx: LayerSceneDrawCtx,
    indices: number[],
    op: "replace" | "add" | "remove",
) {
    const { session } = ctx;
    const valid = indices.filter((i) => Number.isInteger(i) && i >= 0 && i < session.vertices.length);
    if (op === "replace") {
        session.selectedVertexIndices = new Set(valid);
    } else if (op === "add") {
        if (valid.length === 0) return;
        const next = new Set(session.selectedVertexIndices);
        for (const i of valid) next.add(i);
        session.selectedVertexIndices = next;
    } else {
        if (valid.length === 0) return;
        const next = new Set(session.selectedVertexIndices);
        for (const i of valid) next.delete(i);
        session.selectedVertexIndices = next;
    }
    paintDraftDraw(ctx);
}

function draftVertexScreenPositions(ctx: LayerSceneDrawCtx): Array<ScreenPt | null> {
    const { viewer, Cesium, session } = ctx;
    if (!viewer || !Cesium) return [];
    return session.cartesians.map((c) => {
        try {
            const win = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, c);
            if (!win || !Number.isFinite(win.x) || !Number.isFinite(win.y)) return null;
            return { x: win.x, y: win.y };
        } catch {
            return null;
        }
    });
}

function vertexIndicesInRect(
    ctx: LayerSceneDrawCtx,
    left: number,
    right: number,
    top: number,
    bottom: number,
): number[] {
    const pts = draftVertexScreenPositions(ctx);
    const out: number[] = [];
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (!p) continue;
        if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) out.push(i);
    }
    return out;
}

function vertexIndicesInPolygon(ctx: LayerSceneDrawCtx, path: ScreenPt[]): number[] {
    if (path.length < 3) return [];
    const pts = draftVertexScreenPositions(ctx);
    const out: number[] = [];
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (!p) continue;
        let inside = false;
        for (let a = 0, b = path.length - 1; a < path.length; b = a++) {
            const xi = path[a]!.x;
            const yi = path[a]!.y;
            const xj = path[b]!.x;
            const yj = path[b]!.y;
            if (
                yi > p.y !== yj > p.y &&
                p.x < ((xj - xi) * (p.y - yi)) / (yj - yi || Number.EPSILON) + xi
            ) {
                inside = !inside;
            }
        }
        if (inside) out.push(i);
    }
    return out;
}

function minVerticesForDraft(drawMode: DrawGeomMode): number {
    if (drawMode === "Polygon" || drawMode === "MultiPolygon") return 3;
    if (drawMode === "LineString" || drawMode === "MultiLineString") return 2;
    return 1;
}

export function deleteSelectedVertices(ctx: LayerSceneDrawCtx): boolean {
    const { session } = ctx;
    if (!session.vertexSession || session.selectedVertexIndices.size === 0) return false;
    const min = minVerticesForDraft(ctx.drawMode);
    const keep = session.vertices.filter((_, i) => !session.selectedVertexIndices.has(i));
    if (keep.length < min) return false;
    pushVertexUndo(ctx);
    session.vertices = keep;
    session.cartesians = vertsToCartesians(ctx, session.vertices);
    session.vertexCount = session.vertices.length;
    session.selectedVertexIndices = new Set();
    paintDraftDraw(ctx);
    return true;
}

function pickedDraftHandle(
    ctx: LayerSceneDrawCtx,
    screenPos: any,
): { kind: "vertex" | "mid"; index: number } | null {
    if (!ctx.viewer) return null;
    try {
        const picked = ctx.viewer.scene.pick(screenPos);
        const raw = picked?.id;
        const id =
            typeof raw === "string"
                ? raw
                : raw && typeof raw === "object" && "id" in raw
                    ? String((raw as { id?: unknown }).id ?? "")
                    : "";
        const vertex = /^draw:pt:(\d+)$/.exec(id);
        if (vertex) {
            const i = Number(vertex[1]);
            return Number.isInteger(i) ? { kind: "vertex", index: i } : null;
        }
        const mid = /^draw:mid:(\d+)$/.exec(id);
        if (mid) {
            const i = Number(mid[1]);
            return Number.isInteger(i) ? { kind: "mid", index: i } : null;
        }
    } catch {
        /* ignore */
    }
    return null;
}

function pickEditTarget(
    ctx: LayerSceneDrawCtx,
    screenPos: any,
): { table: string; entityId: string } | null {
    if (!ctx.viewer || !ctx.bufferOverlayVisible) return null;
    const overlayHit = (picked: any) => {
        const entity = picked?.id && typeof picked.id === "object" ? picked.id : picked;
        const info = overlayEntityInfo(entity);
        if (!info || info.role !== "after") return null;
        const buf = editBuffer.entryFor(info.table, info.entityId);
        if (buf && buf.op !== "delete") {
            return { table: buf.table, entityId: buf.entityId };
        }
        return null;
    };
    try {
        const top = overlayHit(ctx.viewer.scene.pick(screenPos));
        if (top) return top;
        for (const picked of ctx.viewer.scene.drillPick(screenPos, 8) ?? []) {
            const hit = overlayHit(picked);
            if (hit) return hit;
        }
    } catch {
        /* ignore */
    }
    return null;
}

function lockEditCamera(ctx: LayerSceneDrawCtx) {
    if (!ctx.viewer) return;
    const c = ctx.viewer.scene.screenSpaceCameraController;
    c.enableRotate = false;
    c.enableTranslate = false;
    c.enableLook = false;
    c.enableTilt = false;
    c.enableZoom = false;
}

function unlockEditCamera(ctx: LayerSceneDrawCtx) {
    if (!ctx.viewer) return;
    const is3d = ctx.dim === "3d";
    const c = ctx.viewer.scene.screenSpaceCameraController;
    c.enableRotate = is3d;
    c.enableTranslate = true;
    c.enableLook = is3d;
    c.enableTilt = is3d;
    c.enableZoom = true;
}

function startVertexDrag(ctx: LayerSceneDrawCtx, index: number) {
    const { session } = ctx;
    session.vertexDragIndex = index;
    session.midDragAfter = null;
    session.vertexDragMoved = false;
    if (session.selectedVertexIndices.has(index) && session.selectedVertexIndices.size > 1) {
        session.vertexDragStartPositions = new Map(
            [...session.selectedVertexIndices].map((i) => [i, { ...session.vertices[i]! }]),
        );
    } else {
        session.vertexDragStartPositions = null;
    }
    lockEditCamera(ctx);
}

function startMidDrag(ctx: LayerSceneDrawCtx, afterIndex: number) {
    const { session } = ctx;
    session.vertexDragIndex = null;
    session.midDragAfter = afterIndex;
    session.vertexDragMoved = false;
    lockEditCamera(ctx);
}

function pushVertexUndo(ctx: LayerSceneDrawCtx) {
    const { session } = ctx;
    session.vertexUndoStack = [...session.vertexUndoStack, session.vertices.map((v) => ({ ...v }))];
}

function moveVertexDrag(ctx: LayerSceneDrawCtx, screenPos: any) {
    const { session } = ctx;
    if (session.vertexDragIndex == null && session.midDragAfter == null) return;
    const cartesian = ctx.pickSnapCartesian(screenPos);
    if (!cartesian) return;
    const next = ctx.cartesianToVertex(cartesian);
    if (session.midDragAfter != null) {
        const insertAt = Math.min(session.midDragAfter + 1, session.vertices.length);
        pushVertexUndo(ctx);
        session.vertices = [
            ...session.vertices.slice(0, insertAt),
            next,
            ...session.vertices.slice(insertAt),
        ];
        session.cartesians = vertsToCartesians(ctx, session.vertices);
        session.vertexCount = session.vertices.length;
        session.vertexDragIndex = insertAt;
        session.midDragAfter = null;
        session.vertexDragMoved = true;
        session.selectedVertexIndices = new Set(
            [...session.selectedVertexIndices]
                .map((i) => (i >= insertAt ? i + 1 : i))
                .filter((i) => i < session.vertices.length),
        );
        session.selectedVertexIndices.add(insertAt);
        paintDraftDraw(ctx);
        return;
    }
    if (session.vertexDragIndex == null) return;
    if (!session.vertexDragMoved) pushVertexUndo(ctx);
    session.vertexDragMoved = true;
    if (
        session.vertexDragStartPositions !== null &&
        session.selectedVertexIndices.has(session.vertexDragIndex) &&
        session.selectedVertexIndices.size > 1
    ) {
        const anchorStart = session.vertexDragStartPositions.get(session.vertexDragIndex);
        if (anchorStart) {
            const dLon = next.lon - anchorStart.lon;
            const dLat = next.lat - anchorStart.lat;
            const dH = (next.height ?? 0) - (anchorStart.height ?? 0);
            session.vertices = session.vertices.map((v, i) => {
                const start = session.vertexDragStartPositions!.get(i);
                if (!start) return i === session.vertexDragIndex ? next : v;
                return {
                    lon: start.lon + dLon,
                    lat: start.lat + dLat,
                    height: (start.height ?? 0) + dH,
                };
            });
            session.cartesians = vertsToCartesians(ctx, session.vertices);
            paintDraftDraw(ctx);
            return;
        }
    }
    session.vertices = session.vertices.map((v, i) => (i === session.vertexDragIndex ? next : v));
    session.cartesians = vertsToCartesians(ctx, session.vertices);
    paintDraftDraw(ctx);
}

function endVertexDrag(ctx: LayerSceneDrawCtx) {
    const { session } = ctx;
    const dragging = session.vertexDragIndex != null || session.midDragAfter != null;
    session.vertexDragIndex = null;
    session.midDragAfter = null;
    session.vertexDragStartPositions = null;
    if (!dragging) return;
    unlockEditCamera(ctx);
    if (session.vertexDragMoved) session.vertexSuppressClick = true;
    session.vertexDragMoved = false;
}

function onDrawPick(ctx: LayerSceneDrawCtx, screenPos: any) {
    const { session } = ctx;
    if (!ctx.editEnabled) return;
    if (ctx.anyFormOpen) return;
    if (session.vertexSuppressClick) {
        session.vertexSuppressClick = false;
        return;
    }
    if (pickedDraftHandle(ctx, screenPos)) return;
    const target = pickEditTarget(ctx, screenPos);
    if (target) {
        if (
            session.vertexSession &&
            session.vertexSession.table === target.table &&
            session.vertexSession.entityId === target.entityId
        ) {
            return;
        }
        if (ctx.blockPeerEdit(target.table, target.entityId)) return;
        if (session.vertexSession) commitVertexEdit(ctx);
        else if (session.vertexCount > 0 || session.partCount > 0) return;
        if (editBuffer.targetLayer !== target.table) {
            editBuffer.setTargetLayer(target.table);
        }
        beginVertexEdit(ctx, target.table, target.entityId);
        return;
    }
    if (session.vertexSession) {
        if (vertexEditHandlesActive(ctx)) clearVertexSelection(ctx);
        return;
    }
    const cartesian = ctx.pickSnapCartesian(screenPos);
    if (!cartesian) return;
    if (!session.bindTable && ctx.editLayer) session.bindTable = ctx.editLayer;
    session.vertices = [...session.vertices, ctx.cartesianToVertex(cartesian)];
    session.cartesians = vertsToCartesians(ctx, session.vertices);
    session.vertexCount = session.vertices.length;
    paintDraftDraw(ctx);
    if (ctx.drawMode === "Point") {
        openCreateForm(ctx);
    }
}

export async function detachDrawDataSource(ctx: LayerSceneDrawCtx) {
    const { session, viewer } = ctx;
    session.dsEpoch += 1;
    const geom = session.dataSource;
    const handles = session.handleDataSource;
    const pending = [session.dsAdd, session.handleDsAdd];
    session.dataSource = null;
    session.handleDataSource = null;
    session.dsAdd = null;
    session.handleDsAdd = null;
    for (const p of pending) {
        if (!p) continue;
        try {
            await p;
        } catch {
            /* ignore */
        }
    }
    if (!viewer) return;
    for (const ds of [geom, handles]) {
        if (!ds) continue;
        try {
            if (viewer.dataSources.contains?.(ds)) {
                viewer.dataSources.remove(ds, true);
            }
        } catch {
            /* ignore */
        }
    }
}

export function finishDrawDraft(ctx: LayerSceneDrawCtx): boolean {
    if (ctx.session.vertexSession) return commitVertexEdit(ctx);
    if (!ctx.drawCanFinish) return false;
    openCreateForm(ctx);
    return true;
}

export function onEnterInEdit(ctx: LayerSceneDrawCtx) {
    if (ctx.session.vertexSession) {
        finishDrawDraft(ctx);
        return;
    }
    if (isMultipartMode(ctx.drawMode) && ctx.session.vertexCount >= ctx.drawNeed) {
        addDrawPart(ctx);
        return;
    }
    finishDrawDraft(ctx);
}

export function teardownDrawHandler(ctx: LayerSceneDrawCtx) {
    const { session } = ctx;
    session.vertexDragIndex = null;
    session.midDragAfter = null;
    session.vertexDragStartPositions = null;
    session.vertexMarqueeStart = null;
    session.vertexMarqueeCurrent = null;
    session.vertexMarqueeMoved = false;
    ctx.setBoxOverlay(null);
    ctx.setLassoVisible(false);
    ctx.setLassoPoints([]);
    unlockEditCamera(ctx);
    try {
        session.handler?.destroy?.();
    } catch {
        /* ignore */
    }
    session.handler = null;
}

function clearMarqueeOverlay(ctx: LayerSceneDrawCtx) {
    ctx.setBoxOverlay(null);
    ctx.setLassoVisible(false);
    ctx.setLassoPoints([]);
}

function startVertexMarquee(ctx: LayerSceneDrawCtx, screenPos: unknown, op: "add" | "remove") {
    const { session } = ctx;
    if (!session.vertexSession || !vertexEditHandlesActive(ctx)) return;
    const pos = screenPos as ScreenPt | undefined;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
    if (pickedDraftHandle(ctx, pos)) return;
    if (ctx.selectionTool !== "box" && ctx.selectionTool !== "lasso") return;
    lockEditCamera(ctx);
    session.vertexMarqueeStart = { x: pos.x, y: pos.y };
    session.vertexMarqueeCurrent = { x: pos.x, y: pos.y };
    session.vertexMarqueeMoved = false;
    session.vertexMarqueeOp = op;
    if (ctx.selectionTool === "box") {
        ctx.setBoxOverlay({ left: pos.x, top: pos.y, width: 0, height: 0 });
        ctx.setLassoVisible(false);
        ctx.setLassoPoints([]);
    } else {
        ctx.setBoxOverlay(null);
        ctx.setLassoVisible(true);
        ctx.setLassoPoints([{ x: pos.x, y: pos.y }]);
    }
}

function updateVertexMarquee(ctx: LayerSceneDrawCtx, endPos: unknown) {
    const { session } = ctx;
    if (!session.vertexMarqueeStart) return;
    const pos = endPos as ScreenPt | undefined;
    if (!pos) return;
    session.vertexMarqueeCurrent = { x: pos.x, y: pos.y };
    const dx = pos.x - session.vertexMarqueeStart.x;
    const dy = pos.y - session.vertexMarqueeStart.y;
    if (ctx.selectionTool === "box") {
        ctx.setBoxOverlay({
            left: Math.min(session.vertexMarqueeStart.x, pos.x),
            top: Math.min(session.vertexMarqueeStart.y, pos.y),
            width: Math.abs(dx),
            height: Math.abs(dy),
        });
    } else {
        const pts = ctx.getLassoPoints();
        const last = pts[pts.length - 1];
        if (!last) {
            ctx.setLassoPoints([{ x: pos.x, y: pos.y }]);
        } else if (Math.hypot(pos.x - last.x, pos.y - last.y) >= 4) {
            ctx.setLassoPoints([...pts, { x: pos.x, y: pos.y }]);
        }
    }
    if (!session.vertexMarqueeMoved && Math.hypot(dx, dy) >= 6) session.vertexMarqueeMoved = true;
}

function finishVertexMarquee(ctx: LayerSceneDrawCtx): boolean {
    const { session } = ctx;
    if (!session.vertexMarqueeStart) return false;
    const start = session.vertexMarqueeStart;
    const current = session.vertexMarqueeCurrent;
    const moved = session.vertexMarqueeMoved;
    const op = session.vertexMarqueeOp;
    session.vertexMarqueeStart = null;
    session.vertexMarqueeCurrent = null;
    session.vertexMarqueeMoved = false;
    const path = [...ctx.getLassoPoints()];
    clearMarqueeOverlay(ctx);
    unlockEditCamera(ctx);
    if (!moved || !start || !current) return true;
    let indices: number[] = [];
    if (ctx.selectionTool === "box") {
        indices = vertexIndicesInRect(
            ctx,
            Math.min(start.x, current.x),
            Math.max(start.x, current.x),
            Math.min(start.y, current.y),
            Math.max(start.y, current.y),
        );
    } else {
        indices = vertexIndicesInPolygon(ctx, [...path, { x: current.x, y: current.y }]);
    }
    applyVertexSelectionOp(ctx, indices, op);
    session.vertexSuppressClick = true;
    return true;
}

export function cancelVertexMarquee(ctx: LayerSceneDrawCtx): boolean {
    const { session } = ctx;
    if (!session.vertexMarqueeStart) return false;
    session.vertexMarqueeStart = null;
    session.vertexMarqueeCurrent = null;
    session.vertexMarqueeMoved = false;
    clearMarqueeOverlay(ctx);
    unlockEditCamera(ctx);
    return true;
}

export function setupDrawHandler(getCtx: () => LayerSceneDrawCtx) {
    const ctx = getCtx();
    const { Cesium, viewer, session } = ctx;
    if (!viewer || !Cesium) return;
    teardownDrawHandler(ctx);
    session.handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    session.handler.setInputAction((click: { position: unknown }) => {
        const live = getCtx();
        const handle = pickedDraftHandle(live, click.position);
        if (handle && (live.session.vertexSession || live.session.vertexCount > 0)) {
            if (handle.kind === "mid") startMidDrag(live, handle.index);
            else {
                if (
                    live.session.vertexSession &&
                    vertexEditHandlesActive(live) &&
                    handle.kind === "vertex"
                ) {
                    if (!live.session.selectedVertexIndices.has(handle.index)) {
                        applyVertexSelectionOp(live, [handle.index], "replace");
                    }
                }
                startVertexDrag(live, handle.index);
            }
        }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
    const shiftMod = Cesium.KeyboardEventModifier.SHIFT;
    const ctrlMod = Cesium.KeyboardEventModifier.CTRL;
    const metaMod = Cesium.KeyboardEventModifier?.META;
    const onModifiedDown = (op: "add" | "remove") => (click: { position: unknown }) => {
        const live = getCtx();
        const handle = click.position ? pickedDraftHandle(live, click.position) : null;
        if (
            handle &&
            live.session.vertexSession &&
            vertexEditHandlesActive(live) &&
            handle.kind === "vertex"
        ) {
            applyVertexSelectionOp(live, [handle.index], op);
            return;
        }
        if (click.position) startVertexMarquee(live, click.position, op);
    };
    if (shiftMod !== undefined) {
        session.handler.setInputAction(
            onModifiedDown("add"),
            Cesium.ScreenSpaceEventType.LEFT_DOWN,
            shiftMod,
        );
    }
    if (ctrlMod !== undefined) {
        session.handler.setInputAction(
            onModifiedDown("remove"),
            Cesium.ScreenSpaceEventType.LEFT_DOWN,
            ctrlMod,
        );
    }
    if (metaMod !== undefined) {
        session.handler.setInputAction(
            onModifiedDown("remove"),
            Cesium.ScreenSpaceEventType.LEFT_DOWN,
            metaMod,
        );
    }
    const onMove = (move: { endPosition?: unknown }) => {
        const live = getCtx();
        if (live.session.vertexMarqueeStart) {
            updateVertexMarquee(live, move.endPosition);
            return;
        }
        if (
            (live.session.vertexDragIndex == null && live.session.midDragAfter == null) ||
            !move.endPosition
        ) {
            return;
        }
        moveVertexDrag(live, move.endPosition);
    };
    session.handler.setInputAction(onMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    const onModifiedMove = (move: { endPosition?: unknown }) => {
        updateVertexMarquee(getCtx(), move.endPosition);
    };
    if (shiftMod !== undefined) {
        session.handler.setInputAction(onModifiedMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE, shiftMod);
    }
    if (ctrlMod !== undefined) {
        session.handler.setInputAction(onModifiedMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE, ctrlMod);
    }
    if (metaMod !== undefined) {
        session.handler.setInputAction(onModifiedMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE, metaMod);
    }
    const onUp = () => {
        const live = getCtx();
        if (finishVertexMarquee(live)) return;
        endVertexDrag(live);
    };
    session.handler.setInputAction(onUp, Cesium.ScreenSpaceEventType.LEFT_UP);
    if (shiftMod !== undefined) {
        session.handler.setInputAction(onUp, Cesium.ScreenSpaceEventType.LEFT_UP, shiftMod);
    }
    if (ctrlMod !== undefined) {
        session.handler.setInputAction(onUp, Cesium.ScreenSpaceEventType.LEFT_UP, ctrlMod);
    }
    if (metaMod !== undefined) {
        session.handler.setInputAction(onUp, Cesium.ScreenSpaceEventType.LEFT_UP, metaMod);
    }
    session.handler.setInputAction((click: { position: unknown }) => {
        onDrawPick(getCtx(), click.position);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    session.handler.setInputAction(() => {
        const live = getCtx();
        if (live.session.vertexSession) {
            finishDrawDraft(live);
            return;
        }
        if (live.drawMode === "Point") return;
        popLastDrawVertex(live, false);
        if (!finishDrawDraft(live)) paintDraftDraw(live);
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    getOrCreateDrawDs(ctx);
}

export function setDrawMode(ctx: LayerSceneDrawCtx, next: DrawGeomMode) {
    if (ctx.drawMode === next || ctx.anyFormOpen) return;
    if (ctx.session.vertexSession) cancelVertexEdit(ctx);
    ctx.session.selectedVertexIndices = new Set();
    ctx.setDrawMode(next);
    const live = { ...ctx, drawMode: next };
    clearDraftDraw(live);
    paintDraftDraw(live);
}
