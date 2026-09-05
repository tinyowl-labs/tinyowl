<script lang="ts">
    import { browser } from "$app/environment";
    import { page } from "$app/stores";
    import { env as publicEnv } from "$env/dynamic/public";
    import { onDestroy, onMount } from "svelte";
    import CheckIcon from "@lucide/svelte/icons/check";
    import BoxIcon from "@lucide/svelte/icons/box";
    import EyeIcon from "@lucide/svelte/icons/eye";
    import EyeOffIcon from "@lucide/svelte/icons/eye-off";
    import XIcon from "@lucide/svelte/icons/x";
    import CesiumLoading from "$lib/components/CesiumLoading.svelte";
    import CesiumAttribution from "$lib/components/CesiumAttribution.svelte";
    import EnuCornerWidget from "./EnuCornerWidget.svelte";
    import { isDark, mapColors, mapLayerPalette, themePrefs } from "$lib/stores/theme.svelte";
    import {
        layerSelection,
        parseSelectionKey,
        toSelectionKey,
        type SelectionOp,
        type SelectionToolMode,
    } from "$lib/stores/layerSelection.svelte";
    import MapToolsRail from "./MapToolsRail.svelte";
    import MapViewChrome from "./MapViewChrome.svelte";
    import EntityContextMenu from "./EntityContextMenu.svelte";
    import SceneGraphPanel from "./SceneGraphPanel.svelte";
    import LayerStylePanel from "./LayerStylePanel.svelte";
    import PickPager from "./PickPager.svelte";
    import EditModeBar from "./EditModeBar.svelte";
    import FeatureCreateForm from "./FeatureCreateForm.svelte";
    import { SELECTION_PRIMARY, SELECTION_SECONDARY } from "./selectionStyle";
    import {
        collectKeysInScreenPolygon,
        collectKeysInScreenRect,
        type SelectableEntity,
    } from "./mapSelection";
    import { mapToolShortcut } from "./mapShortcuts";
    import {
        dedupePickCandidates,
        pickCandidateLabel,
        attrsFromEntity,
        attrsFromRecord,
        type PickCandidate,
    } from "./pickCandidates";
    import type { LayerData } from "./layerTypes";
    import {
        activeView,
        POINT_OUTLINE_WIDTH,
        contrastColor,
        defaultOpacityForPackets,
        DEFAULT_CLUSTER_PIXEL_RANGE,
        layerLegendColor,
        numericRange,
        resolveFill,
        resolveHeight,
        rowByEntityId,
        rowMatchesFilter,
        type LayerView,
    } from "./layerViews";
    import type { ProjectTileset } from "./tilesetTypes";
    import { isLocalTileset } from "./tilesetTypes";
    import type { ProjectCoverage } from "./coverageTypes";
    import {
        loadableRasters,
    } from "./coverageTypes";
    import {
        applyTilesetHeightOffset as applyTilesetHeightOffsetImpl,
        destroyTileset as destroyTilesetPrim,
        loadTilesetPrimitive,
    } from "./layerSceneTilesets";
    import {
        destroyCoverageLayer as destroyCoverageLayerImpl,
        syncCoverageImagery as syncCoverageImageryImpl,
    } from "./layerSceneCoverage";
    import {
        cesiumPropValue,
        collectPacketLonLats,
        entityIdFromPacketId,
        preferRealLonLats,
        type PacketLonLat,
    } from "./czmlLoad";
    import {
        computeMeasureValue,
        formatMeasureValue,
        measureHint,
        minVertices,
        newMeasureId,
        type MeasureMode,
        type MeasureRecord,
        type MeasureVertex,
    } from "$lib/measure";
    import { cesiumMapLabel } from "$lib/components/cesiumBoot";
    import {
        createImageryProvider,
        createOsmImageryProvider,
        createTerrainProvider,
        creditsFor,
        imageryOption,
        persistImageryId,
        persistTerrainId,
        readStoredImageryId,
        readStoredTerrainId,
        replaceBasemapLayer,
        resolveImageryId,
        resolveTerrainId,
        usesIon,
        type ImageryId,
        type TerrainId,
    } from "$lib/components/cesiumProviders";
    import {
        destroyDiffOverlay,
        overlayEntityInfo,
        submitEditBuffer,
        syncDiffOverlay,
        type DiffFeature,
        type GeoJsonGeometry,
        DIFF_OP_FILL,
        asGeometry,
        geometriesEqual,
    } from "$lib/geoDiff";
    import {
        editBuffer,
        attrFieldsForTable,
        geometryFromDraft,
        draftFromGeometry,
        isMultipartMode,
        minVerticesForMode,
        type DrawGeomMode,
        type LonLatVertex,
        type SnapMode,
    } from "$lib/stores/editBuffer.svelte";
    import PresenceDock from "./PresenceDock.svelte";
    import PresenceCursors from "./PresenceCursors.svelte";
    import CommentPanel from "./CommentPanel.svelte";
    import CommentBalloons from "./CommentBalloons.svelte";
    import {
        connectMapPresence,
        type MapPresenceHandle,
        type PresencePeer,
    } from "$lib/map-presence";
    import {
        createPresenceLayer,
        type PresenceLayer,
        type PresenceRosterCursor,
    } from "./layerScenePresence";
    import {
        createComment,
        deleteComment,
        fetchComments,
        patchComment,
        subscribeComments,
        type CommentDraft,
        type CommentFilter,
        type CommentsRealtimeHandle,
        type MapComment,
    } from "$lib/map-comments";
    import {
        getOrCreateCommentDs,
        pickCommentId,
        syncCommentPins,
        clampLonLatToScene,
        commentClampNeedsRetry,
        clearCommentHeightCache,
        firstHeightFromGeometry,
    } from "./layerSceneComments";

    type EntityMeta = {
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

    type Props = {
        projectSlug: string;
        accessToken?: string;
        tilesets?: ProjectTileset[];
        /** Raster + tileset coverage rows from GET …/coverages */
        coverages?: ProjectCoverage[];
        selectedHash?: string;
        loading?: boolean;
        layers?: LayerData[];
        rows?: Record<string, Record<string, unknown>[]>;
        /** Scene mode: 2d = SCENE2D, 3d = SCENE3D. Does not reload CZML. */
        dim?: "2d" | "3d";
        onSelectTileset?: (hash: string) => void;
        fullscreen?: boolean;
        onToggleFullscreen?: () => void;
        onDimChange?: (dim: "2d" | "3d") => void;
        /** False when map tab is hidden — resize on show, never destroy. */
        active?: boolean;
        canEditViews?: boolean;
        onPersistViews?: (layerName: string, views: LayerView[]) => void;
        /**
         * Op-colored geo overlay (pending/history/CRUD buffer). Empty = none.
         * Same DiffFeature model as ReviewMap — not a second changeset store.
         */
        diffFeatures?: DiffFeature[];
        /** FK-joined keys to highlight as secondary (attribute tables → map). */
        joinedKeys?: string[];
        /** owner / admin / collaborator — edit mode chrome. */
        canWrite?: boolean;
        /** Table name → column names (create form). */
        tables?: Record<string, string[]>;
        /** Value search from `/layers?q=` — map isolate only, not the scene tree. */
        searchQ?: string;
        onClearSearchQ?: () => void;
        /** Gazetteer camera target from `/layers?bbox=` or `?lat=&lng=&radius=`. */
        placeBBox?: { west: number; south: number; east: number; north: number } | null;
        placeLat?: number | null;
        placeLng?: number | null;
        placeRadius?: number | null;
        /** Fly to this layer's extent when there is no isolate / highlight. */
        focusLayer?: string;
    };

    let {
        projectSlug,
        accessToken = "",
        tilesets = [],
        coverages = [],
        selectedHash = "",
        loading = false,
        layers = [],
        rows = {},
        dim = "3d",
        onSelectTileset,
        fullscreen = false,
        onToggleFullscreen,
        onDimChange,
        active = true,
        canEditViews = false,
        onPersistViews,
        diffFeatures = [],
        joinedKeys = [],
        canWrite = false,
        tables = {},
        searchQ = "",
        onClearSearchQ,
        placeBBox = null,
        placeLat = null,
        placeLng = null,
        placeRadius = null,
        focusLayer = "",
    }: Props = $props();

    let el = $state<HTMLDivElement>();
    let creditSink = $state<HTMLDivElement>();
    let error = $state("");
    let ready = $state(false);
    /** True when an Ion imagery or terrain provider is active. */
    let hasIonTerrain = $state(false);
    let imageryId = $state<ImageryId>("osm");
    let terrainId = $state<TerrainId>("ellipsoid");
    let imageryBusy = $state(false);
    let terrainBusy = $state(false);
    let providerError = $state("");
    let ionAvailable = $state(false);
    let basemapLayer: any = null;
    let imageryGen = 0;
    let terrainGen = 0;
    let modelVis = $state<Record<string, boolean>>({});
    let coverageVis = $state<Record<string, boolean>>({});
    let coverageError = $state("");
    let popupHtml = $state("");
    let popupX = $state(0);
    let popupY = $state(0);
    let popupVisible = $state(false);
    let pickCandidates = $state<PickCandidate[]>([]);
    let pickIndex = $state(0);
    let pickOpen = $state(false);
    let pickPanelX = $state(16);
    let pickPanelY = $state(56);
    let pickFlipBelow = $state(false);
    /** World-space anchor for the pick panel — fixed for the open session (not per candidate). */
    let pickAnchorCartesian: any | null = null;

    const selectionCount = $derived(layerSelection.size);
    const hiddenCount = $derived(layerSelection.hiddenCount);
    const isolating = $derived(layerSelection.isIsolating);
    const appliedHighlight = $derived(layerSelection.primaryKey ?? "");
    const selectionSig = $derived(
        `${layerSelection.primaryKey ?? ""}|${[...layerSelection.selected].sort().join(",")}|${joinedKeys.slice().sort().join(",")}`,
    );

    let measureEnabled = $state(false);
    let measureMode = $state<MeasureMode>("length");
    let measureStatus = $state("");
    let measureRecords = $state<MeasureRecord[]>([]);
    let draftVertices: MeasureVertex[] = [];
    let draftCartesians: any[] = [];
    let measureDataSource: any = null;
    let measureDsAdd: Promise<unknown> | null = null;
    let diffDataSource: any = null;
    const MEASURE_COLOR = "#ca8a04";

    let editEnabled = $state(false);
    let bufferOverlayVisible = $state(true);
    let commitMessage = $state("");
    let commitBusy = $state(false);
    let commitError = $state("");
    let commitDoneId = $state("");
    let drawMode = $state<DrawGeomMode>("Polygon");
    let drawUseHeight = $state(true);
    let snapMode = $state<SnapMode>("mesh");
    let vertexSession = $state<{
        table: string;
        entityId: string;
        bufferOp: "insert" | "update";
        oldGeometry: GeoJsonGeometry | null;
    } | null>(null);
    let vertexUndoStack: LonLatVertex[][] = [];
    let vertexDragIndex: number | null = null;
    let midDragAfter: number | null = null;
    let vertexDragMoved = false;
    let vertexSuppressClick = false;
    /** Multi-vertex selection within the active vertex session (indices into drawVertices). */
    let selectedVertexIndices = $state<Set<number>>(new Set());
    /** Drag-start snapshot for bulk moves: index → original vertex. */
    let vertexDragStartPositions: Map<number, LonLatVertex> | null = null;
    /** Vertex marquee state (Shift/Ctrl drag in edit mode; reuses box/lasso overlay). */
    let vertexMarqueeStart: { x: number; y: number } | null = null;
    let vertexMarqueeCurrent: { x: number; y: number } | null = null;
    let vertexMarqueeMoved = false;
    let vertexMarqueeOp: "add" | "remove" = "add";
    let drawVertices: LonLatVertex[] = [];
    let drawCartesians: any[] = [];
    let drawParts: LonLatVertex[][] = [];
    let drawPartCartesians: any[][] = [];
    let drawVertexCount = $state(0);
    let drawPartCount = $state(0);
    let drawDataSource: any = null;
    let drawDsAdd: Promise<unknown> | null = null;
    let drawHandleDataSource: any = null;
    let drawHandleDsAdd: Promise<unknown> | null = null;
    let drawDsEpoch = 0;
    let drawHandler: any;
    let createFormOpen = $state(false);
    let attrEdit = $state<{ table: string; entityId: string } | null>(null);
    let pendingGeometry = $state<GeoJsonGeometry | null>(null);
    const anyFormOpen = $derived(createFormOpen || attrEdit != null);
    const canFinish = $derived(
        measureEnabled &&
            measureMode !== "point" &&
            draftCartesians.length >= minVertices(measureMode),
    );
    const DRAW_COLOR = DIFF_OP_FILL.insert;
    const DRAFT_MID_CROSS = `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 11 11">
			<path fill="none" stroke="#000" stroke-width="1.8" stroke-linecap="square" d="M5.5 1v9M1 5.5h9"/>
		</svg>`,
    )}`;

    const editLayer = $derived(editBuffer.targetLayer);
    const canEdit = $derived(
        Boolean(
            canWrite &&
                active &&
                (editLayer || layerSelection.primaryKey),
        ),
    );
    const createFields = $derived(
        attrFieldsForTable(tables[editLayer ?? ""] ?? []),
    );
    const attrEditFields = $derived(
        attrFieldsForTable(tables[attrEdit?.table ?? ""] ?? []).filter(
            (c) => c !== "source_id" && c !== "entity_type",
        ),
    );
    const attrEditInitial = $derived.by(() => {
        if (!attrEdit) return {} as Record<string, string>;
        const row = rowByEntityId(rows[attrEdit.table], attrEdit.entityId);
        const buf = editBuffer.entries.find(
            (e) => e.table === attrEdit!.table && e.entityId === attrEdit!.entityId,
        );
        return {
            ...attrsFromRecord(row),
            ...attrsFromRecord(buf?.attributes),
        };
    });
    const drawNeed = $derived(minVerticesForMode(drawMode));
    const drawCanAddPart = $derived(
        editEnabled && isMultipartMode(drawMode) && drawVertexCount >= drawNeed,
    );
    const drawCanFinish = $derived(
        editEnabled &&
            (isMultipartMode(drawMode)
                ? drawPartCount >= 1 || drawVertexCount >= drawNeed
                : drawVertexCount >= drawNeed),
    );
    const bufferEntries = $derived(
        editBuffer.entries.map((e) => ({
            entityId: e.entityId,
            table: e.table,
            op: e.op,
        })),
    );

    let Cesium: any;
    let viewer: any;
    let clickHandler: any;
    let measureHandler: any;
    let postRenderRemover: (() => void) | null = null;
    let renderRequestRemovers: Array<() => void> = [];
    let presencePeers = $state<PresencePeer[]>([]);
    let presenceRoster = $state<PresenceRosterCursor[]>([]);
    const presenceCursorNodes = new Map<string, HTMLElement>();
    let presenceHidden = $state(false);
    let presenceConnected = $state(false);
    let presenceHandle: MapPresenceHandle | null = null;

    const presenceMember = $derived(
        Boolean(($page.data as { isMember?: boolean } | undefined)?.isMember),
    );
    const presenceUserId = $derived(
        ($page.data?.user as { id?: string } | undefined)?.id ?? "",
    );
    const commentRole = $derived(
        (($page.data as { role?: string } | undefined)?.role ?? "viewer") as string,
    );
    const commentIsAdmin = $derived(
        commentRole === "owner" || commentRole === "admin",
    );

    let comments = $state<MapComment[]>([]);
    let commentsEnabled = $state(false);
    let commentAdding = $state(false);
    let commentFilter = $state<CommentFilter>("open");
    let selectedCommentId = $state<string | null>(null);
    let pendingComment = $state<CommentDraft | null>(null);
    let commentsBusy = $state(false);
    let commentsError = $state("");
    let commentDataSource: any = null;
    let commentsLoadGen = 0;
    let ctxLon = 0;
    let ctxLat = 0;
    let ctxHeight = 0;
    let commentDrawMode = $state<DrawGeomMode>("Point");
    let commentSketchVerts: LonLatVertex[] = [];
    let commentSketchCount = $state(0);
    let commentBalloonX = $state(16);
    let commentBalloonY = $state(16);
    let commentBalloonOnScreen = $state(false);
    /** World-space balloon anchor — pickPosition / entity sphere, not lon/lat at h=0. */
    let commentBalloonAnchor: any | null = null;
    let commentBalloonAnchorId: string | null = null;
    let lastCommentClampMs = 0;
    let commentsRealtime: CommentsRealtimeHandle | null = null;
    const commentSketchNeed = $derived(minVerticesForMode(commentDrawMode));
    const commentCanFinishSketch = $derived(
        commentAdding &&
            canWrite &&
            commentDrawMode !== "Point" &&
            commentSketchCount >= commentSketchNeed,
    );

    function bumpRender() {
        try {
            viewer?.scene?.requestRender?.();
        } catch {
            /* ignore */
        }
    }
    const tilesetPrims = new Map<string, any>();
    const coverageLayers = new Map<string, any[]>();
    const coverageCogDestroy = new Map<string, () => void>();
    const layerSources = new Map<string, any>();
    const clusteredSources = new WeakSet<object>();
    const entityMeta = new WeakMap<object, EntityMeta>();
    let selectedEntity: any = null;
    let layerLoadGen = 0;
    let modelLoadGen = 0;
    let coverageLoadGen = 0;
    let started = false;
    /** Frame the project/tileset extent once on boot. Reactive — gates loading overlay. */
    let hasFramed = $state(false);
    let homeFlyStarted = false;
    let lastFlownKey = "";
    let lastInteropFlyKey = "";
    let filterToView = $state(false);
    let styleLayerIdx = $state<number | null>(null);
    let inViewEntityKeys = $state<string[]>([]);
    let inViewModelHashes = $state<string[]>([]);
    let inViewThrottle: ReturnType<typeof setTimeout> | null = null;
    let homeView: {
        destination: any;
        orientation: { heading: number; pitch: number; roll: number };
    } | null = null;
    /** Project extent used by Home — preferred over a one-shot camera pose. */
    let homeSphere: any | null = null;
    let scratchSphere: any;
    /** Keys that currently have selection styling applied. */
    let styledSelectionKeys = new Set<string>();
    /** Modifier keys captured on pointerdown (Cesium click has no modifiers). */
    let lastPointerMods = { shift: false, ctrl: false, meta: false };

    let selectionToolLocal = $state<SelectionToolMode>(layerSelection.toolMode);
    let dragRectVisible = $state(false);
    let dragRectLeft = $state(0);
    let dragRectTop = $state(0);
    let dragRectWidth = $state(0);
    let dragRectHeight = $state(0);
    let lassoVisible = $state(false);
    let lassoPoints = $state<Array<{ x: number; y: number }>>([]);
    let suppressNextClick = false;
    let dragHandler: any = null;
    /** Primary key whose pick popup the user dismissed (do not reopen until selection changes). */
    let pickDismissedKey = "";

    let ctxOpen = $state(false);
    let ctxX = $state(0);
    let ctxY = $state(0);
    let ctxKind = $state<"entity" | "tileset">("entity");
    let ctxLayerName = $state("");
    let ctxEntityId = $state("");
    let ctxTilesetHash = $state("");
    let ctxEntity: any = null;

    const models = $derived(
        tilesets.filter((t) => t.ingest_status === "ready" && t.root_url),
    );
    const rasters = $derived(loadableRasters(coverages));
    const coverageRows = $derived(
        coverages.filter((c) => c.role !== "tileset"),
    );
    const selected = $derived(
        models.find((t) => t.hash === selectedHash) ?? models[0] ?? null,
    );
    const pending = $derived(
        tilesets.filter((t) => t.ingest_status === "pending").length,
    );
    const failed = $derived(
        tilesets.find((t) => t.ingest_status === "failed"),
    );
    const palette = $derived(mapLayerPalette(8));

    function isModelVisible(hash: string) {
        if (hash in modelVis) return modelVis[hash]!;
        return selected?.hash === hash;
    }

    function isCoverageVisible(hash: string) {
        if (hash in coverageVis) return coverageVis[hash]!;
        return true;
    }

    async function loadCesium() {
        const { loadCesiumGlobal } = await import("$lib/components/cesiumBoot");
        return loadCesiumGlobal();
    }

    async function applyImagery(id: ImageryId) {
        if (!viewer || !Cesium) return;
        const next = resolveImageryId(id, ionAvailable);
        const gen = ++imageryGen;
        imageryBusy = true;
        providerError = "";
        try {
            const provider = await createImageryProvider(Cesium, next);
            if (gen !== imageryGen) return;
            basemapLayer = replaceBasemapLayer(viewer, basemapLayer, provider);
            imageryId = next;
            persistImageryId(next);
            hasIonTerrain = usesIon(next, terrainId);
            if (basemapLayer) {
                tuneBasemapLayer(
                    basemapLayer,
                    isDark() && Boolean(imageryOption(next).themeAdjust),
                );
            }
            bumpRender();
        } catch (e) {
            if (gen !== imageryGen) return;
            console.warn("[LayerScene] imagery provider failed", e);
            providerError =
                e instanceof Error ? e.message : "Imagery provider failed";
        } finally {
            if (gen === imageryGen) imageryBusy = false;
        }
    }

    async function applyTerrain(id: TerrainId) {
        if (!viewer || !Cesium) return;
        const next = resolveTerrainId(id, ionAvailable);
        const gen = ++terrainGen;
        terrainBusy = true;
        providerError = "";
        try {
            const provider = await createTerrainProvider(Cesium, next);
            if (gen !== terrainGen) return;
            viewer.terrainProvider = provider;
            terrainId = next;
            persistTerrainId(next);
            hasIonTerrain = usesIon(imageryId, next);
            bumpRender();
        } catch (e) {
            if (gen !== terrainGen) return;
            console.warn("[LayerScene] terrain provider failed", e);
            providerError =
                e instanceof Error ? e.message : "Terrain provider failed";
            try {
                viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
                terrainId = "ellipsoid";
                persistTerrainId("ellipsoid");
                hasIonTerrain = usesIon(imageryId, "ellipsoid");
            } catch {
                hasIonTerrain = usesIon(imageryId, terrainId);
            }
        } finally {
            if (gen === terrainGen) terrainBusy = false;
        }
    }

    function cesiumColorFromCss(css: string | undefined, fallbackHex = "#3b82f6") {
        const tryOne = (raw: string) => {
            if (!raw || !Cesium) return null;
            const via = Cesium.Color.fromCssColorString(raw);
            if (via) return via;
            const m = raw.match(
                /rgba?\(\s*([\d.]+)[%]?\s*[, ]\s*([\d.]+)[%]?\s*[, ]\s*([\d.]+)[%]?(?:\s*[,/]\s*([\d.]+%?))?\s*\)/i,
            );
            if (!m) return null;
            const to01 = (v: string, isAlpha = false) => {
                const n = parseFloat(v);
                if (isAlpha) return v.endsWith("%") ? n / 100 : n > 1 ? n / 255 : n;
                return n > 1 ? n / 255 : n;
            };
            return new Cesium.Color(
                to01(m[1]!),
                to01(m[2]!),
                to01(m[3]!),
                m[4] != null ? to01(m[4], true) : 1,
            );
        };
        return (
            tryOne((css ?? "").trim()) ??
            tryOne(fallbackHex) ??
            Cesium?.Color?.fromCssColorString?.(fallbackHex) ??
            Cesium?.Color?.DODGERBLUE ??
            null
        );
    }

    function destroyTileset(hash: string) {
        destroyTilesetPrim(viewer, tilesetPrims, hash);
    }

    function applyTilesetHeightOffset(
        prim: any,
        offsetM: number | null | undefined,
    ) {
        applyTilesetHeightOffsetImpl(Cesium, prim, offsetM);
    }

    function sphereFromBboxWgs84(
        bbox: number[],
        heightM: number,
    ): any | null {
        if (
            bbox.length !== 4 ||
            !bbox.every((n) => Number.isFinite(n)) ||
            !Cesium
        ) {
            return null;
        }
        const [west, south, east, north] = bbox;
        if (!(west < east && south < north)) return null;
        const rect = Cesium.Rectangle.fromDegrees(west, south, east, north);
        const sphere = Cesium.BoundingSphere.fromRectangle3D(
            rect,
            Cesium.Ellipsoid.WGS84,
            heightM,
        );
        // Site-scale meshes need a floor so the camera doesn't bury the trench.
        sphere.radius = Math.max(sphere.radius * 1.5, 30);
        return sphere;
    }

    /** Home from packet lon/lat — not Cesium getBoundingSphere (often 0,0). */
    function sphereFromLonLats(pts: PacketLonLat[]): any | null {
        if (!Cesium || pts.length === 0) return null;
        const cartesians = pts.map((p) =>
            Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 0),
        );
        const sphere = Cesium.BoundingSphere.fromPoints(cartesians);
        if (!sphere?.center || !(sphere.radius >= 0)) return null;
        sphere.radius = Math.max(sphere.radius * 1.5, 30);
        return sphere;
    }

    function sphereFromPackets(
        packets: Record<string, unknown>[] | undefined,
    ): any | null {
        return sphereFromLonLats(
            preferRealLonLats(collectPacketLonLats(packets)),
        );
    }

    function sphereFromVisibleLayerPackets(): any | null {
        const pts: PacketLonLat[] = [];
        for (const layer of layers) {
            if (!layer.visible) continue;
            pts.push(...collectPacketLonLats(layer.packets));
        }
        return sphereFromLonLats(preferRealLonLats(pts));
    }

    function frameHeightM(prim: any | undefined): number {
        const c = prim?.boundingSphere?.center;
        if (c && Cesium) {
            const h = Cesium.Cartographic.fromCartesian(c).height;
            if (Number.isFinite(h)) return h;
        }
        return 100;
    }

    function poseForSphere(
        sphere: any,
    ): { destination: any; orientation: any } | null {
        if (!viewer || !Cesium || !sphere?.center) return null;
        const mag = Cesium.Cartesian3.magnitude(sphere.center);
        if (!Number.isFinite(mag) || mag < 1_000_000) return null;
        try {
            const c = Cesium.Cartographic.fromCartesian(sphere.center);
            const lon = Cesium.Math.toDegrees(c.longitude);
            const lat = Cesium.Math.toDegrees(c.latitude);
            if (Math.abs(lon) < 1e-4 && Math.abs(lat) < 1e-4) return null;
        } catch {
            return null;
        }
        const is3d = viewer.scene.mode === Cesium.SceneMode.SCENE3D;
        const pitch = is3d
            ? Cesium.Math.toRadians(-45)
            : Cesium.Math.toRadians(-90);
        const range = Math.max(
            sphere.radius * (is3d ? 2.5 : 2.2),
            is3d ? 40 : 800,
        );
        const a = Math.abs(pitch);
        const local = new Cesium.Cartesian3(
            0,
            -range * Math.cos(a),
            range * Math.sin(a),
        );
        const enu = Cesium.Transforms.eastNorthUpToFixedFrame(sphere.center);
        const destination = Cesium.Matrix4.multiplyByPoint(
            enu,
            local,
            new Cesium.Cartesian3(),
        );
        return {
            destination,
            orientation: { heading: 0, pitch, roll: 0 },
        };
    }

    /** World-frame fly/setView — never lookAt / flyToBoundingSphere (those snap to 0,0). */
    async function flyCameraToSphere(sphere: any, duration = 1.0) {
        if (!viewer || !Cesium || !sphere) return;
        const pose = poseForSphere(sphere);
        if (!pose) return;
        try {
            viewer.camera.cancelFlight();
        } catch {
            /* ignore */
        }
        try {
            viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
        } catch {
            /* ignore */
        }
        if (duration <= 0) {
            viewer.camera.setView(pose);
            bumpRender();
            return;
        }
        const restoreRR = viewer.scene.requestRenderMode;
        viewer.scene.requestRenderMode = false;
        await new Promise<void>((resolve) => {
            viewer.camera.flyTo({
                ...pose,
            duration,
                complete: () => resolve(),
                cancel: () => resolve(),
            });
        });
        viewer.scene.requestRenderMode = restoreRR;
        bumpRender();
    }

    /** After 2D↔3D morph, reset camera frame and reframe to project data. */
    async function refocusAfterMorph(is3d: boolean) {
        if (!viewer || !Cesium) return;
        try {
            viewer.camera.cancelFlight();
        } catch {
            /* ignore */
        }
        // Morph from SCENE2D can leave a non-identity transform; 3D flies then miss.
        try {
            viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
        } catch {
            /* ignore */
        }
        // Let the scene settle one frame after morphComplete.
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        if (!viewer || viewer.isDestroyed?.()) return;
        await flyHome(is3d ? 0.85 : 0.5);
    }

    function captureHomeView() {
        if (!viewer || !Cesium) return;
        try {
            homeView = {
                destination: Cesium.Cartesian3.clone(viewer.camera.positionWC),
                orientation: {
                    heading: viewer.camera.heading,
                    pitch: viewer.camera.pitch,
                    roll: viewer.camera.roll,
                },
            };
        } catch {
            homeView = null;
        }
    }

    /** Entity-layer extent for Home. Tilesets are backdrop only — not part of home. */
    function computeHomeSphere(): any | null {
        if (!viewer || !Cesium) return null;
        const fromPackets = sphereFromVisibleLayerPackets();
        if (fromPackets) return fromPackets;
        // Visualizer spheres are not used — clamp-to-ground reports 0,0.
        // Tileset-only projects: fall back to mesh / bbox.
        const hasEntityLayers = layers.some(
            (l) =>
                (l.packets?.length ?? 0) > 0 ||
                (l.entityIds?.length ?? 0) > 0,
        );
        if (hasEntityLayers) return null;
        for (const [hash, prim] of tilesetPrims) {
            if (!prim?.show) continue;
            try {
                if (prim.boundingSphere?.radius > 0) {
                    return Cesium.BoundingSphere.clone(prim.boundingSphere);
                }
            } catch {
                /* ignore */
            }
            const m = models.find((x) => x.hash === hash);
            const bbox = m?.bbox_wgs84;
            if (Array.isArray(bbox)) {
                const s = sphereFromBboxWgs84(bbox, frameHeightM(prim));
                if (s) return s;
            }
        }
        return null;
    }

    async function flyHome(duration = 1.0) {
        if (!viewer || !Cesium) return;
        const sphere = computeHomeSphere() ?? homeSphere;
        if (sphere) {
            homeSphere = Cesium.BoundingSphere.clone(sphere);
            await flyCameraToSphere(sphere, duration);
            captureHomeView();
            return;
        }
        if (homeView) {
            viewer.camera.flyTo({
                destination: homeView.destination,
                orientation: homeView.orientation,
                duration,
            });
        }
    }

    async function flyToLayerExtent(layerName: string) {
        if (!viewer || !Cesium) return;
        const layer = layers.find((l) => l.name === layerName);
        const fromPackets = sphereFromPackets(layer?.packets);
        if (fromPackets) {
            await flyCameraToSphere(fromPackets, 1.0);
            return;
        }
        const ds = layerSources.get(layerName);
        if (!ds) return;
        const spheres: any[] = [];
        for (const entity of ds.entities.values) {
            pushExtentSphere(spheres, entity);
        }
        if (spheres.length === 0) return;
        const combined =
            spheres.length === 1
                ? spheres[0]
                : Cesium.BoundingSphere.fromBoundingSpheres(spheres);
        await flyCameraToSphere(combined, 1.0);
    }

    function searchInteropFlyKey(): string {
        if (searchQ.trim()) return "";
        if (placeBBox) {
            return `bbox:${placeBBox.west},${placeBBox.south},${placeBBox.east},${placeBBox.north}`;
        }
        if (placeLat != null && placeLng != null) {
            return `pt:${placeLat},${placeLng},${placeRadius ?? 0}`;
        }
        if (focusLayer) return `layer:${focusLayer}`;
        return "";
    }

    async function flyToSearchPlace(duration = 1.0) {
        if (!viewer || !Cesium) return;
        if (placeBBox) {
            const sphere = sphereFromBboxWgs84(
                [
                    placeBBox.west,
                    placeBBox.south,
                    placeBBox.east,
                    placeBBox.north,
                ],
                0,
            );
            if (sphere) await flyCameraToSphere(sphere, duration);
            return;
        }
        if (placeLat == null || placeLng == null) return;
        const center = Cesium.Cartesian3.fromDegrees(placeLng, placeLat);
        const radiusM = Math.max(placeRadius ?? 5000, 80);
        await flyCameraToSphere(
            new Cesium.BoundingSphere(center, radiusM),
            duration,
        );
    }

    async function flySearchInterop(force = false) {
        if (searchQ.trim()) return;
        const key = searchInteropFlyKey();
        // Layer extent is scene-graph / user only — never an automatic follow-up fly.
        if (!key || key.startsWith("layer:")) return;
        if (!force && key === lastInteropFlyKey) return;
        lastInteropFlyKey = key;
        await flyToSearchPlace();
    }

    function flyTopDown() {
        if (!viewer || !Cesium) return;
        viewer.camera.flyTo({
            destination: viewer.camera.position,
            orientation: {
                heading: 0,
                pitch: Cesium.Math.toRadians(-90),
                roll: 0,
            },
            duration: 1.0,
        });
    }

    function lockNorthUp() {
        if (!viewer || !Cesium) return;
        viewer.camera.flyTo({
            destination: viewer.camera.position,
            orientation: {
                heading: 0,
                pitch: viewer.camera.pitch,
                roll: 0,
            },
            duration: 1.0,
        });
    }

    function selectionFlyKey(): string {
        return [...layerSelection.selected, ...joinedKeys].sort().join("|");
    }

    function allSelectableEntities(): SelectableEntity[] {
        const out: SelectableEntity[] = [];
        const seen = new Set<string>();
        for (const ds of entityDataSources()) {
            for (const entity of ds.entities.values) {
                const meta = entityMeta.get(entity);
                if (!meta) continue;
                try {
                    if (entity.show === false) continue;
                } catch {
                    /* ignore */
                }
                if (layerSelection.isHidden(meta.layerName, meta.entityId)) continue;
                if (isViewFiltered(meta.layerName, meta.entityId)) continue;
                const key = toSelectionKey(meta.layerName, meta.entityId);
                if (seen.has(key)) continue;
                seen.add(key);
                out.push({ key, entity });
            }
        }
        return out;
    }

    function entityDataSources(): any[] {
        const out: any[] = [...layerSources.values()];
        if (diffDataSource) out.push(diffDataSource);
        return out;
    }

    function findEntitiesByKey(key: string): any[] {
        if (!key) return [];
        const { layer, id } = parseSelectionKey(key);
        if (!id) return [];
        const out: any[] = [];
        for (const ds of entityDataSources()) {
            try {
                for (const entity of ds.entities.values) {
                    const meta = entityMeta.get(entity);
                    if (!meta) continue;
                    if (
                        meta.entityId === id &&
                        (!layer || meta.layerName === layer)
                    ) {
                        out.push(entity);
                    }
                }
            } catch {
                /* ignore */
            }
        }
        const visible = out.filter((e) => {
            try {
                return e.show !== false;
            } catch {
                return true;
            }
        });
        return visible.length > 0 ? visible : out;
    }

    function findEntityByKey(key: string): any | null {
        return findEntitiesByKey(key)[0] ?? null;
    }

    async function flyToSelection(force = true) {
        const keys = [...layerSelection.selected, ...joinedKeys].sort();
        if (keys.length === 0) return;
        const flyKey = keys.join("|");
        if (!force && flyKey && flyKey === lastFlownKey) return;

        const spheres: any[] = [];
        for (const key of keys) {
            for (const entity of findEntitiesByKey(key)) {
                pushExtentSphere(spheres, entity);
            }
        }
        if (spheres.length === 0) return;
        const combined =
            spheres.length === 1
                ? spheres[0]
                : Cesium.BoundingSphere.fromBoundingSpheres(spheres);
        lastFlownKey = flyKey;
        await flyCameraToSphere(combined, 1.0);
    }

    /** Once after load: same flyHome() as the toolbar button. */
    function flyHomeOnce() {
        if (homeFlyStarted || !viewer || !Cesium || loading) return;
        if (computeHomeSphere()) {
            homeFlyStarted = true;
            lastFlownKey = selectionFlyKey();
            void flyHome(1.0).then(() => {
            hasFramed = true;
            });
            return;
        }
        const expect =
            layers.some((l) => (l.packets?.length ?? 0) > 0) ||
            models.length > 0;
        if (!expect) {
            homeFlyStarted = true;
            hasFramed = true;
        }
    }

    function destroyLayerSource(name: string) {
        const ds = layerSources.get(name);
        if (!ds) return;
        layerSources.delete(name);
        try {
            viewer?.dataSources?.remove(ds, true);
        } catch {
            /* ignore */
        }
    }

    function clearSelectionUi() {
        selectedEntity = null;
        popupVisible = false;
        popupHtml = "";
        pickOpen = false;
        pickCandidates = [];
        pickIndex = 0;
        pickAnchorCartesian = null;
        ctxOpen = false;
        ctxEntity = null;
    }

    function clearSelection() {
        layerSelection.clearSelection();
        clearSelectionUi();
        lastFlownKey = "";
        clearCommentSelection();
        if (started) syncAllSelectionStyles();
    }

    /** Exit isolate; if this isolate came from `/layers?q=`, drop the query and selection. */
    function exitIsolateUi() {
        const fromSearch = Boolean(searchQ.trim());
        layerSelection.exitIsolate();
        if (fromSearch) {
            clearSelection();
            onClearSearchQ?.();
        }
        applyHiddenVisibility();
    }

    function clearCommentSelection() {
        if (selectedCommentId == null) return;
        selectedCommentId = null;
        commentBalloonAnchor = null;
        commentBalloonAnchorId = null;
        bumpRender();
    }

    function closeContextMenu() {
        const wasOpen = ctxOpen;
        const wasEntity = ctxKind === "entity";
        ctxOpen = false;
        ctxEntity = null;
        ctxKind = "entity";
        ctxTilesetHash = "";
        // Restore selection styles after context preview highlight.
        if (wasOpen && wasEntity && started) syncAllSelectionStyles();
    }

    function hideEntity(entity: any, layerName: string, entityId: string) {
        layerSelection.hideEntity(layerName, entityId);
        try {
            entity.show = false;
        } catch {
            /* ignore */
        }
        closeContextMenu();
    }

    function applyHiddenVisibility() {
        const bufHide = new Set<string>();
        if (bufferOverlayVisible) {
            for (const e of editBuffer.entries) {
                // Hide canonical only when the overlay will paint a
                // replacement (geom update / delete). Attr-only updates
                // have no overlay geom — hiding would make the feature vanish.
                if (e.op === "delete") {
                    bufHide.add(toSelectionKey(e.table, e.entityId));
                } else if (e.op === "update" && asGeometry(e.geometry)) {
                    bufHide.add(toSelectionKey(e.table, e.entityId));
                }
            }
        }
        if (vertexSession && vertexSession.bufferOp !== "insert") {
            bufHide.add(
                toSelectionKey(vertexSession.table, vertexSession.entityId),
            );
        }
        const layerOff = new Set(
            layers.filter((l) => !l.visible).map((l) => l.name),
        );
        for (const ds of entityDataSources()) {
            try {
                for (const entity of ds.entities.values) {
                    const info = overlayEntityInfo(entity);
                    if (info?.role === "before") {
                        const wantShow =
                            !layerOff.has(info.table) &&
                            !layerSelection.isHidden(
                                info.table,
                                info.entityId,
                            ) &&
                            !isViewFiltered(info.table, info.entityId);
                        try {
                            entity.show = wantShow;
                        } catch {
                            /* ignore */
                        }
                        continue;
                    }
                    const meta = entityMeta.get(entity);
                    if (!meta) continue;
                    const key = toSelectionKey(meta.layerName, meta.entityId);
                    const overlayAfter = info?.role === "after";
                    const wantShow =
                        !layerOff.has(meta.layerName) &&
                        !layerSelection.isHidden(meta.layerName, meta.entityId) &&
                        !isViewFiltered(meta.layerName, meta.entityId) &&
                        (overlayAfter || !bufHide.has(key));
                    try {
                        entity.show = wantShow;
                    } catch {
                        /* ignore */
                    }
                }
            } catch {
                /* ignore */
            }
        }
        bumpRender();
    }

    function isViewFiltered(layerName: string, entityId: string): boolean {
        const layer = layers.find((l) => l.name === layerName);
        const view = activeView(layer?.views, layer?.activeViewId ?? "");
        if (!view?.filter?.field) return false;
        const row = rowByEntityId(rows[layerName], entityId);
        if (!row) {
            const buf = editBuffer.entries.find(
                (e) => e.table === layerName && e.entityId === entityId,
            );
            if (buf?.op === "insert") return false;
        }
        return !rowMatchesFilter(row, view.filter);
    }

    function showAllHiddenEntities() {
        layerSelection.showAllHidden();
        applyHiddenVisibility();
    }

    /** Soft highlight for context menu — no popup, no store mutation. */
    function previewContextEntity(entity: any) {
        applyEntitySelectionStyle(entity, "primary");
        popupVisible = false;
        popupHtml = "";
    }

    function openEntityContextMenu(
        screenPos: { x: number; y: number },
        entity: any,
        layerName: string,
        entityId: string,
    ) {
        const pos = contextMenuScreenPos(screenPos);
        ctxKind = "entity";
        ctxTilesetHash = "";
        ctxLayerName = layerName;
        ctxEntityId = entityId;
        ctxEntity = entity;
        ctxX = pos.x;
        ctxY = pos.y;
        ctxOpen = true;
        previewContextEntity(entity);
        const cart = pickMeasureCartesian(screenPos);
        if (cart) {
            const v = cartesianToVertex(cart);
            ctxLon = v.lon;
            ctxLat = v.lat;
            ctxHeight = v.height ?? 0;
        }
    }

    function contextMenuScreenPos(screenPos: { x: number; y: number }) {
        const canvas = viewer?.scene?.canvas as HTMLCanvasElement | undefined;
        const rect = canvas?.getBoundingClientRect();
        return {
            x: Math.min(
                (rect?.left ?? 0) + screenPos.x,
                window.innerWidth - 220,
            ),
            y: Math.min(
                (rect?.top ?? 0) + screenPos.y,
                window.innerHeight - 160,
            ),
        };
    }

    function resolvePickedTilesetHash(picked: any): string | null {
        if (!picked) return null;
        const hits: unknown[] = [];
        if (picked.tileset) hits.push(picked.tileset);
        if (picked.content?.tileset) hits.push(picked.content.tileset);
        if (picked.primitive) hits.push(picked.primitive);
        if (picked.primitive?.tileset) hits.push(picked.primitive.tileset);
        for (const [hash, prim] of tilesetPrims) {
            if (hits.includes(prim) || picked === prim) return hash;
        }
        return null;
    }

    function openTilesetContextMenu(
        screenPos: { x: number; y: number },
        hash: string,
    ) {
        const m = models.find((t) => t.hash === hash);
        const pos = contextMenuScreenPos(screenPos);
        ctxKind = "tileset";
        ctxTilesetHash = hash;
        ctxLayerName = m?.label || "3D model";
        ctxEntityId = hash.length > 12 ? `${hash.slice(0, 12)}…` : hash;
        ctxEntity = null;
        ctxX = pos.x;
        ctxY = pos.y;
        ctxOpen = true;
    }

    function measureColor() {
        return Cesium.Color.fromCssColorString(MEASURE_COLOR);
    }

    function getOrCreateMeasureDs() {
        if (!viewer || !Cesium) return null;
        if (measureDataSource) return measureDataSource;
        measureDataSource = new Cesium.CustomDataSource("tinyowl-measure");
        measureDsAdd = viewer.dataSources.add(measureDataSource);
        void measureDsAdd?.then(() => bumpRender());
        return measureDataSource;
    }

    async function ensureMeasureDs() {
        const ds = getOrCreateMeasureDs();
        if (!ds) return null;
        if (measureDsAdd) await measureDsAdd;
        return ds;
    }

    function cartesianToVertex(cartesian: any): MeasureVertex {
        const c = Cesium.Cartographic.fromCartesian(cartesian);
        return {
            lon: Cesium.Math.toDegrees(c.longitude),
            lat: Cesium.Math.toDegrees(c.latitude),
            height: c.height ?? 0,
        };
    }

    function pickMeasureCartesian(position: any): any | null {
        if (!viewer || !Cesium) return null;
        try {
            if (viewer.scene.pickPositionSupported) {
                const hit = viewer.scene.pickPosition(position);
                if (Cesium.defined(hit)) return hit;
            }
        } catch {
            /* fall through */
        }
        try {
            const ray = viewer.camera.getPickRay(position);
            if (ray) {
                const globeHit = viewer.scene.globe.pick(ray, viewer.scene);
                if (Cesium.defined(globeHit)) return globeHit;
            }
        } catch {
            /* ignore */
        }
        return null;
    }

    function pickEllipsoidCartesian(position: any): any | null {
        if (!viewer || !Cesium) return null;
        try {
            const hit = viewer.camera.pickEllipsoid(
                position,
                viewer.scene.globe.ellipsoid,
            );
            if (Cesium.defined(hit)) return hit;
        } catch {
            /* ignore */
        }
        return null;
    }

    function pickGlobeCartesian(position: any): any | null {
        if (!viewer || !Cesium) return null;
        try {
            const ray = viewer.camera.getPickRay(position);
            if (ray) {
                const globeHit = viewer.scene.globe.pick(ray, viewer.scene);
                if (Cesium.defined(globeHit)) return globeHit;
            }
        } catch {
            /* ignore */
        }
        return null;
    }

    function pickMeshCartesian(position: any): any | null {
        if (!viewer || !Cesium) return null;
        try {
            if (viewer.scene.pickPositionSupported) {
                const hit = viewer.scene.pickPosition(position);
                if (Cesium.defined(hit)) return hit;
            }
        } catch {
            /* ignore */
        }
        return null;
    }

    function pickSnapCartesian(position: any): any | null {
        if (snapMode === "ellipsoid") {
            return pickEllipsoidCartesian(position) ?? pickGlobeCartesian(position);
        }
        if (snapMode === "terrain") {
            return (
                pickGlobeCartesian(position) ??
                pickEllipsoidCartesian(position)
            );
        }
        return (
            pickMeshCartesian(position) ??
            pickGlobeCartesian(position) ??
            pickEllipsoidCartesian(position)
        );
    }

    function pathLength3d(cartesians: any[]): number {
        let sum = 0;
        for (let i = 1; i < cartesians.length; i++) {
            sum += Cesium.Cartesian3.distance(cartesians[i - 1], cartesians[i]);
        }
        return sum;
    }

    function clearDraftMeasure() {
        draftVertices = [];
        draftCartesians = [];
        clearDraftEntitiesOnly();
    }

    function clearDraftEntitiesOnly() {
        if (!measureDataSource) return;
        const ids = [
            "draft:line",
            "draft:poly",
            "draft:label",
            ...Array.from({ length: 32 }, (_, i) => `draft:pt:${i}`),
        ];
        for (const id of ids) {
            try {
                measureDataSource.entities.removeById(id);
            } catch {
                /* ignore */
            }
        }
    }

    function paintDraftMeasure() {
        const ds = getOrCreateMeasureDs();
        if (!ds || !Cesium) return;
        clearDraftEntitiesOnly();
        const color = measureColor();
        for (let i = 0; i < draftCartesians.length; i++) {
            ds.entities.add({
                id: `draft:pt:${i}`,
                position: draftCartesians[i],
                point: {
                    pixelSize: 8,
                    color,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 1,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
            });
        }
        if (draftCartesians.length >= 2) {
            ds.entities.add({
                id: "draft:line",
                polyline: {
                    positions: draftCartesians.slice(),
                    width: 3,
                    material: new Cesium.PolylineDashMaterialProperty({
                        color,
                    }),
                    clampToGround: false,
                },
            });
        }
        if (measureMode === "area" && draftCartesians.length >= 3) {
            ds.entities.add({
                id: "draft:poly",
                polygon: {
                    hierarchy: new Cesium.PolygonHierarchy(
                        draftCartesians.slice(),
                    ),
                    material: color.withAlpha(0.18),
                    outline: true,
                    outlineColor: color,
                    perPositionHeight: true,
                },
            });
        }
        if (draftCartesians.length >= minVertices(measureMode)) {
            const value =
                measureMode === "point"
                    ? 0
                    : measureMode === "area"
                      ? computeMeasureValue(measureMode, draftVertices)
                      : pathLength3d(draftCartesians);
            const mid = draftCartesians[Math.floor(draftCartesians.length / 2)];
            ds.entities.add({
                id: "draft:label",
                position: mid,
                label: {
                    ...cesiumMapLabel(
                        Cesium,
                        formatMeasureValue(measureMode, value, draftVertices),
                        { pixelOffsetY: -12 },
                    ),
                },
            });
        }
        bumpRender();
    }

    async function commitMeasure3d() {
        const ds = await ensureMeasureDs();
        if (!ds || !Cesium) return;
        const need = minVertices(measureMode);
        if (draftCartesians.length < need) return;

        const value =
            measureMode === "point"
                ? 0
                : measureMode === "area"
                  ? computeMeasureValue(measureMode, draftVertices)
                  : pathLength3d(draftCartesians);
        const id = newMeasureId();
        const label = formatMeasureValue(measureMode, value, draftVertices);
        const color = measureColor();
        const positions = [...draftCartesians];

        clearDraftEntitiesOnly();
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

        measureRecords = [
            ...measureRecords,
            {
                id,
                mode: measureMode,
                label,
                value,
                vertices: [...draftVertices],
            },
        ];
        draftVertices = [];
        draftCartesians = [];
        measureStatus = `${label} saved · ${measureHint(measureMode, dim === "2d" ? "2d" : "3d")}`;
        bumpRender();
    }

    async function removeMeasurement(id: string) {
        if (measureDataSource) {
            const ents = [...measureDataSource.entities.values];
            for (const ent of ents) {
                const eid = String(ent.id ?? "");
                if (eid === id || eid.startsWith(`${id}:`)) {
                    try {
                        measureDataSource.entities.remove(ent);
                    } catch {
                        /* ignore */
                    }
                }
            }
        }
        measureRecords = measureRecords.filter((r) => r.id !== id);
        bumpRender();
    }

    function popLastMeasureVertex(repaint = true) {
        if (draftCartesians.length === 0) return;
        draftCartesians = draftCartesians.slice(0, -1);
        draftVertices = draftVertices.slice(0, -1);
        if (repaint) paintDraftMeasure();
    }

    async function onMeasurePick(screenPos: any) {
        const cartesian = pickMeasureCartesian(screenPos);
        if (!cartesian) {
            measureStatus = "Could not pick a point — try the mesh or terrain";
            return;
        }
        draftCartesians = [...draftCartesians, cartesian];
        draftVertices = [...draftVertices, cartesianToVertex(cartesian)];
        if (measureMode === "point") {
            paintDraftMeasure();
            await commitMeasure3d();
            return;
        }
        paintDraftMeasure();
        const n = draftCartesians.length;
        measureStatus =
            n < minVertices(measureMode)
                ? `${n} point${n === 1 ? "" : "s"} · ${measureHint(measureMode, dim === "2d" ? "2d" : "3d")}`
                : `${formatMeasureValue(
                      measureMode,
                      measureMode === "area"
                          ? computeMeasureValue(measureMode, draftVertices)
                          : pathLength3d(draftCartesians),
                      draftVertices,
                  )} · Finish, double-click, or Enter`;
    }

    async function clearMeasurements() {
        clearDraftMeasure();
        clearDraftEntitiesOnly();
        if (measureDataSource && viewer) {
            try {
                viewer.dataSources.remove(measureDataSource, true);
            } catch {
                /* ignore */
            }
        }
        measureDataSource = null;
        measureDsAdd = null;
        measureRecords = [];
        measureStatus = measureHint(measureMode, dim === "2d" ? "2d" : "3d");
    }

    function finishDraft3d(): boolean {
        if (draftCartesians.length >= minVertices(measureMode)) {
            void commitMeasure3d();
            return true;
        }
        return false;
    }

    function zoomIn3d() {
        if (!viewer || !Cesium) return;
        const h = viewer.camera.positionCartographic?.height;
        const amount =
            typeof h === "number" && h > 0 ? Math.max(h * 0.35, 1) : 100;
        viewer.camera.zoomIn(amount);
    }

    function zoomOut3d() {
        if (!viewer || !Cesium) return;
        const h = viewer.camera.positionCartographic?.height;
        const amount =
            typeof h === "number" && h > 0 ? Math.max(h * 0.35, 1) : 100;
        viewer.camera.zoomOut(amount);
    }

    function teardownMeasureHandler() {
        try {
            measureHandler?.destroy?.();
        } catch {
            /* ignore */
        }
        measureHandler = null;
    }

    function setupMeasureHandler() {
        if (!viewer || !Cesium) return;
        teardownMeasureHandler();
        measureHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        measureHandler.setInputAction((click: { position: unknown }) => {
            void onMeasurePick(click.position);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        measureHandler.setInputAction(() => {
            if (measureMode === "point") return;
            popLastMeasureVertex(false);
            if (!finishDraft3d()) paintDraftMeasure();
        }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
        getOrCreateMeasureDs();
    }

    function drawColor() {
        return Cesium.Color.fromCssColorString(DRAW_COLOR);
    }

    function attachDrawNamedDs(ds: any, gen: number, stillMine: () => boolean) {
        const already = Boolean(viewer.dataSources.contains?.(ds));
        const attached = already
            ? Promise.resolve(ds)
            : Promise.resolve(viewer.dataSources.add(ds));
        return attached.then(
            (added) => {
                if (gen !== drawDsEpoch || !stillMine()) {
                    try {
                        if (viewer.dataSources.contains?.(ds)) {
                            viewer.dataSources.remove(ds, true);
                        }
                    } catch {
                        /* ignore */
                    }
                    return added;
                }
                bumpRender();
                return added;
            },
            () => ds,
        );
    }

    function getOrCreateDrawDs() {
        if (!viewer || !Cesium) return null;
        if (!drawDataSource) {
            const gen = ++drawDsEpoch;
            const ds = new Cesium.CustomDataSource("tinyowl-draw");
            drawDataSource = ds;
            drawDsAdd = attachDrawNamedDs(
                ds,
                gen,
                () => drawDataSource === ds,
            );
        }
        if (!drawHandleDataSource) {
            const gen = drawDsEpoch || ++drawDsEpoch;
            const ds = new Cesium.CustomDataSource("tinyowl-draw-handles");
            drawHandleDataSource = ds;
            drawHandleDsAdd = attachDrawNamedDs(
                ds,
                gen,
                () => drawHandleDataSource === ds,
            );
        }
        return drawDataSource;
    }

    function getOrCreateHandleDs() {
        getOrCreateDrawDs();
        return drawHandleDataSource;
    }

    function raiseDrawHandles() {
        try {
            if (drawHandleDataSource) {
                viewer?.dataSources?.raiseToTop?.(drawHandleDataSource);
            }
        } catch {
            /* ignore */
        }
    }

    function clearDraftDraw() {
        drawVertices = [];
        drawCartesians = [];
        drawParts = [];
        drawPartCartesians = [];
        drawVertexCount = 0;
        drawPartCount = 0;
        clearDraftDrawEntitiesOnly();
    }

    function clearDraftDrawEntitiesOnly() {
        for (const ds of [drawDataSource, drawHandleDataSource]) {
            if (!ds) continue;
            try {
                ds.entities.removeAll();
            } catch {
                /* ignore */
            }
        }
    }

    function handleEyeOffset() {
        return new Cesium.Cartesian3(0, 0, 12);
    }

    function addDraftPoints(
        ds: any,
        color: any,
        cartesians: any[],
        prefix: string,
        selected?: Set<number>,
        selectedColor?: any,
    ) {
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
                    eyeOffset: handleEyeOffset(),
                },
            });
        }
    }

    function addDraftMids(
        ds: any,
        cartesians: any[],
        prefix: string,
        closed: boolean,
    ) {
        if (!Cesium || cartesians.length < 2) return;
        const n = cartesians.length;
        const segs = closed && n >= 3 ? n : n - 1;
        for (let i = 0; i < segs; i++) {
            const a = cartesians[i];
            const b = cartesians[(i + 1) % n];
            if (!a || !b) continue;
            const pos = Cesium.Cartesian3.midpoint(
                a,
                b,
                new Cesium.Cartesian3(),
            );
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
                    eyeOffset: handleEyeOffset(),
                },
            });
        }
    }

    function addDraftLine(ds: any, color: any, cartesians: any[], id: string) {
        if (cartesians.length < 2) return;
        ds.entities.add({
            id,
            polyline: {
                positions: cartesians.slice(),
                width: 3,
                material: new Cesium.PolylineDashMaterialProperty({ color }),
                clampToGround: false,
            },
        });
    }

    function addDraftPoly(ds: any, color: any, cartesians: any[], id: string) {
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

    function vertsToCartesians(verts: LonLatVertex[]): any[] {
        if (!Cesium) return [];
        return verts.map((v) =>
            Cesium.Cartesian3.fromDegrees(v.lon, v.lat, v.height ?? 0),
        );
    }

    function rebuildDrawCartesians() {
        drawCartesians = vertsToCartesians(drawVertices);
        drawPartCartesians = drawParts.map((p) => vertsToCartesians(p));
    }

    function setDrawUseHeight(on: boolean) {
        if (drawUseHeight === on) return;
        drawUseHeight = on;
        rebuildDrawCartesians();
        paintDraftDraw();
        if (createFormOpen) {
            pendingGeometry = snapshotPendingGeometry();
        }
    }

    function paintDraftDraw() {
        const ds = getOrCreateDrawDs();
        const handles = getOrCreateHandleDs();
        if (!ds || !handles || !Cesium) return;
        clearDraftDrawEntitiesOnly();
        const color = drawColor();
        const lineLike =
            drawMode === "LineString" ||
            drawMode === "MultiLineString" ||
            drawMode === "Polygon" ||
            drawMode === "MultiPolygon";
        const polyLike = drawMode === "Polygon" || drawMode === "MultiPolygon";
        for (let p = 0; p < drawPartCartesians.length; p++) {
            const part = drawPartCartesians[p]!;
            if (lineLike) addDraftLine(ds, color, part, `draw:part${p}:line`);
            if (polyLike) addDraftPoly(ds, color, part, `draw:part${p}:poly`);
            addDraftPoints(handles, color, part, `draw:part${p}`);
        }
        if (lineLike) addDraftLine(ds, color, drawCartesians, "draw:line");
        if (polyLike) addDraftPoly(ds, color, drawCartesians, "draw:poly");
        addDraftPoints(
            handles,
            color,
            drawCartesians,
            "draw",
            vertexSession ? selectedVertexIndices : undefined,
            Cesium.Color.fromCssColorString(SELECTION_PRIMARY),
        );
        if (lineLike) {
            addDraftMids(handles, drawCartesians, "draw", polyLike);
        }
        raiseDrawHandles();
        bumpRender();
    }

    function snapshotPendingGeometry(): GeoJsonGeometry | null {
        if (!editLayer) return null;
        return geometryFromDraft(
            drawMode,
            drawVertices,
            drawParts,
            drawUseHeight,
        );
    }

    function openCreateForm() {
        if (createFormOpen) return;
        const geom = snapshotPendingGeometry();
        if (!geom) return;
        pendingGeometry = geom;
        createFormOpen = true;
        bumpRender();
    }

    function confirmCreate(attrs: Record<string, string>) {
        const geom = pendingGeometry ?? snapshotPendingGeometry();
        if (!geom || !editLayer) {
            pendingGeometry = null;
            createFormOpen = false;
            return;
        }
        const sourceId = attrs.source_id?.trim();
        editBuffer.push({
            op: "insert",
            table: editLayer,
            entityId: sourceId || editBuffer.nextEntityId(),
            geometry: geom,
            attributes: attrs,
        });
        pendingGeometry = null;
        createFormOpen = false;
        clearDraftDraw();
        bumpRender();
    }

    function cancelCreate() {
        pendingGeometry = null;
        createFormOpen = false;
        clearDraftDraw();
        bumpRender();
    }

    function openAttrEdit(table: string, entityId: string) {
        if (!canWrite || !table || !entityId) return;
        createFormOpen = false;
        pendingGeometry = null;
        attrEdit = { table, entityId };
        editBuffer.setTargetLayer(table);
        closePickPager({ suppressClick: true });
        closeContextMenu();
        bumpRender();
    }

    function confirmAttrEdit(attrs: Record<string, string>) {
        if (!attrEdit) return;
        editBuffer.upsertAttributes(attrEdit.table, attrEdit.entityId, attrs);
        attrEdit = null;
        applyHiddenVisibility();
        bumpRender();
    }

    function cancelAttrEdit() {
        attrEdit = null;
        bumpRender();
    }

    function geometryForDelete(
        table: string,
        entityId: string,
    ): GeoJsonGeometry | null {
        const buf = editBuffer.entries.find(
            (e) => e.table === table && e.entityId === entityId,
        );
        const fromBuf =
            asGeometry(buf?.geometry) ?? asGeometry(buf?.oldGeometry);
        if (fromBuf) return fromBuf;
        if (vertexSession?.table === table && vertexSession.entityId === entityId) {
            return (
                snapshotPendingGeometry() ??
                asGeometry(vertexSession.oldGeometry)
            );
        }
        const entity = findEntityByKey(toSelectionKey(table, entityId));
        return geometryFromCesiumEntity(entity);
    }

    function deleteBufferedFeature(table: string, entityId: string) {
        if (!canWrite || !table || !entityId) return;
        const geom = geometryForDelete(table, entityId);
        if (
            vertexSession?.table === table &&
            vertexSession.entityId === entityId
        ) {
            cancelVertexEdit();
        }
        editBuffer.markDelete(table, entityId, geom);
        if (attrEdit?.table === table && attrEdit.entityId === entityId) {
            attrEdit = null;
        }
        layerSelection.removeSelection(table, entityId);
        closePickPager({ suppressClick: true });
        applyHiddenVisibility();
        bumpRender();
    }

    function deleteSelectedFeatures() {
        if (!canWrite) return;
        const targets: { table: string; entityId: string }[] = [];
        const add = (table: string, entityId: string) => {
            if (!table || !entityId) return;
            if (targets.some((t) => t.table === table && t.entityId === entityId))
                return;
            targets.push({ table, entityId });
        };
        if (vertexSession) {
            add(vertexSession.table, vertexSession.entityId);
        }
        const layer = editLayer ?? layerFromSelection();
        for (const key of layerSelection.keys()) {
            const { layer: l, id } = parseSelectionKey(key);
            if (layer && l !== layer) continue;
            add(l, id);
        }
        if (targets.length === 0 && ctxOpen && ctxKind === "entity") {
            add(ctxLayerName, ctxEntityId);
        }
        for (const t of targets) deleteBufferedFeature(t.table, t.entityId);
        closeContextMenu();
        closePickPager({ suppressClick: true });
    }

    function addDrawPart() {
        if (!isMultipartMode(drawMode)) return;
        if (drawVertices.length < drawNeed) return;
        drawParts = [...drawParts, drawVertices];
        drawPartCartesians = [
            ...drawPartCartesians,
            vertsToCartesians(drawVertices),
        ];
        drawPartCount = drawParts.length;
        drawVertices = [];
        drawCartesians = [];
        drawVertexCount = 0;
        paintDraftDraw();
    }

    function popLastDrawVertex(repaint = true) {
        if (drawVertices.length === 0) return;
        drawVertices = drawVertices.slice(0, -1);
        drawCartesians = vertsToCartesians(drawVertices);
        drawVertexCount = drawVertices.length;
        if (repaint) paintDraftDraw();
    }

    function restoreLastDrawPart(): boolean {
        if (drawParts.length === 0) return false;
        const last = drawParts[drawParts.length - 1]!;
        drawParts = drawParts.slice(0, -1);
        drawPartCartesians = drawPartCartesians.slice(0, -1);
        drawPartCount = drawParts.length;
        drawVertices = last;
        drawCartesians = vertsToCartesians(last);
        drawVertexCount = last.length;
        paintDraftDraw();
        return true;
    }

    function undoLastBuffer(): boolean {
        if (editBuffer.size === 0) return false;
        editBuffer.pop();
        bumpRender();
        return true;
    }

    async function commitEditBuffer() {
        const message = commitMessage.trim();
        if (!message || editBuffer.size === 0 || commitBusy || !canWrite) return;
        if (vertexSession) {
            if (!commitVertexEdit()) cancelVertexEdit();
        }
        commitBusy = true;
        commitError = "";
        commitDoneId = "";
        try {
            const res = await submitEditBuffer(
                projectSlug,
                accessToken,
                message,
                editBuffer.entries,
            );
            editBuffer.clear();
            commitMessage = "";
            commitDoneId = res.changeset_id;
        } catch (e) {
            commitError = e instanceof Error ? e.message : "Commit failed";
        } finally {
            commitBusy = false;
            bumpRender();
        }
    }

    function undoDrawOrMeasure() {
        if (attrEdit) {
            cancelAttrEdit();
            return;
        }
        if (createFormOpen) {
            pendingGeometry = null;
            createFormOpen = false;
            paintDraftDraw();
            return;
        }
        if (vertexSession) {
            if (vertexUndoStack.length > 0) {
                const prev = vertexUndoStack.pop()!;
                drawVertices = prev;
                drawCartesians = vertsToCartesians(prev);
                drawVertexCount = prev.length;
                // Drop out-of-range selections after undo.
                selectedVertexIndices = new Set(
                    [...selectedVertexIndices].filter((i) => i < prev.length),
                );
                paintDraftDraw();
                return;
            }
            cancelVertexEdit();
            return;
        }
        if (editEnabled) {
            if (drawVertices.length > 0) {
                popLastDrawVertex();
                return;
            }
            if (restoreLastDrawPart()) return;
            undoLastBuffer();
            return;
        }
        if (measureEnabled) {
            if (draftCartesians.length > 0) {
                popLastMeasureVertex();
                return;
            }
            if (measureRecords.length > 0) {
                void removeMeasurement(
                    measureRecords[measureRecords.length - 1]!.id,
                );
                return;
            }
        }
        undoLastBuffer();
    }

    function dropClosingVertex(verts: LonLatVertex[]): LonLatVertex[] {
        if (verts.length < 2) return verts;
        const a = verts[0]!;
        const b = verts[verts.length - 1]!;
        if (
            Math.abs(a.lon - b.lon) < 1e-12 &&
            Math.abs(a.lat - b.lat) < 1e-12
        ) {
            return verts.slice(0, -1);
        }
        return verts;
    }

    function cartesiansToVertices(pts: any[]): LonLatVertex[] {
        const verts: LonLatVertex[] = [];
        for (const p of pts) {
            try {
                verts.push(cartesianToVertex(p));
            } catch {
                /* skip */
            }
        }
        return dropClosingVertex(verts);
    }

    function geometryFromCesiumEntity(entity: any): GeoJsonGeometry | null {
        if (!entity || !Cesium || !viewer) return null;
        const time = viewer.clock.currentTime;
        try {
            if (entity.polygon?.hierarchy) {
                const h = entity.polygon.hierarchy.getValue(time);
                const pts = h?.positions ?? h;
                if (!Array.isArray(pts) || pts.length < 3) return null;
                return geometryFromDraft(
                    "Polygon",
                    cartesiansToVertices(pts),
                    [],
                    drawUseHeight,
                );
            }
            if (entity.polyline?.positions) {
                const pts = entity.polyline.positions.getValue(time);
                if (!Array.isArray(pts) || pts.length < 2) return null;
                return geometryFromDraft(
                    "LineString",
                    cartesiansToVertices(pts),
                    [],
                    drawUseHeight,
                );
            }
            if (entity.position) {
                const pos = entity.position.getValue(time);
                if (!pos) return null;
                return geometryFromDraft(
                    "Point",
                    [cartesianToVertex(pos)],
                    [],
                    drawUseHeight,
                );
            }
        } catch {
            return null;
        }
        return null;
    }

    function loadDraftFromGeom(
        geom: GeoJsonGeometry,
        modeHint?: DrawGeomMode,
    ): boolean {
        const draft = draftFromGeometry(geom);
        if (!draft) return false;
        drawMode = modeHint && draft.mode === modeHint ? modeHint : draft.mode;
        drawParts = draft.parts;
        drawPartCartesians = draft.parts.map((p) => vertsToCartesians(p));
        drawPartCount = draft.parts.length;
        drawVertices = draft.vertices;
        drawCartesians = vertsToCartesians(draft.vertices);
        drawVertexCount = draft.vertices.length;
        paintDraftDraw();
        raiseDrawHandles();
        return true;
    }

    function cancelVertexEdit() {
        vertexSession = null;
        vertexUndoStack = [];
        vertexDragIndex = null;
        midDragAfter = null;
        vertexDragStartPositions = null;
        selectedVertexIndices = new Set();
        clearDraftDraw();
        applyHiddenVisibility();
        paintDraftDraw();
    }

    function beginVertexEdit(table: string, entityId: string): boolean {
        if (anyFormOpen) return false;
        const buf = editBuffer.entries.find(
            (e) => e.table === table && e.entityId === entityId,
        );
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
            const entity = findEntityByKey(toSelectionKey(table, entityId));
            geom = geometryFromCesiumEntity(entity);
            oldGeometry = geom;
        }
        if (!geom || !loadDraftFromGeom(geom)) return false;
        vertexSession = { table, entityId, bufferOp, oldGeometry };
        vertexUndoStack = [];
        selectedVertexIndices = new Set();
        vertexDragStartPositions = null;
        applyHiddenVisibility();
        return true;
    }

    function commitVertexEdit(): boolean {
        if (!vertexSession) return false;
        const geom = snapshotPendingGeometry();
        if (!geom) return false;
        editBuffer.upsert({
            op: vertexSession.bufferOp,
            table: vertexSession.table,
            entityId: vertexSession.entityId,
            geometry: geom,
            oldGeometry:
                vertexSession.bufferOp === "insert"
                    ? null
                    : vertexSession.oldGeometry,
        });
        vertexSession = null;
        vertexUndoStack = [];
        vertexDragIndex = null;
        midDragAfter = null;
        vertexDragStartPositions = null;
        selectedVertexIndices = new Set();
        clearDraftDraw();
        applyHiddenVisibility();
        bumpRender();
        return true;
    }

    /** Vertex multi-select (06): only the active draft line/polygon has selectable vertices. */
    function vertexEditHandlesActive(): boolean {
        if (!vertexSession) return false;
        return (
            drawMode === "Polygon" ||
            drawMode === "LineString" ||
            drawMode === "MultiPolygon" ||
            drawMode === "MultiLineString" ||
            drawMode === "Point" ||
            drawMode === "MultiPoint"
        );
    }

    function clearVertexSelection(repaint = true) {
        if (selectedVertexIndices.size === 0) return;
        selectedVertexIndices = new Set();
        if (repaint) paintDraftDraw();
    }

    function applyVertexSelectionOp(indices: number[], op: "replace" | "add" | "remove") {
        const valid = indices.filter(
            (i) => Number.isInteger(i) && i >= 0 && i < drawVertices.length,
        );
        if (op === "replace") {
            selectedVertexIndices = new Set(valid);
        } else if (op === "add") {
            if (valid.length === 0) return;
            const next = new Set(selectedVertexIndices);
            for (const i of valid) next.add(i);
            selectedVertexIndices = next;
        } else {
            if (valid.length === 0) return;
            const next = new Set(selectedVertexIndices);
            for (const i of valid) next.delete(i);
            selectedVertexIndices = next;
        }
        paintDraftDraw();
    }

    /** Screen positions of draft vertices (null when behind camera). */
    function draftVertexScreenPositions(): Array<{ x: number; y: number } | null> {
        if (!viewer || !Cesium) return [];
        return drawCartesians.map((c) => {
            try {
                const win = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, c);
                if (!win || !Number.isFinite(win.x) || !Number.isFinite(win.y)) return null;
                return { x: win.x, y: win.y };
            } catch {
                return null;
            }
        });
    }

    function vertexIndicesInRect(left: number, right: number, top: number, bottom: number): number[] {
        const pts = draftVertexScreenPositions();
        const out: number[] = [];
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            if (!p) continue;
            if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) out.push(i);
        }
        return out;
    }

    function vertexIndicesInPolygon(path: Array<{ x: number; y: number }>): number[] {
        if (path.length < 3) return [];
        const pts = draftVertexScreenPositions();
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
                if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi || Number.EPSILON) + xi) {
                    inside = !inside;
                }
            }
            if (inside) out.push(i);
        }
        return out;
    }

    function minVerticesForDraft(): number {
        if (drawMode === "Polygon" || drawMode === "MultiPolygon") return 3;
        if (drawMode === "LineString" || drawMode === "MultiLineString") return 2;
        return 1;
    }

    function deleteSelectedVertices(): boolean {
        if (!vertexSession || selectedVertexIndices.size === 0) return false;
        const min = minVerticesForDraft();
        const keep = drawVertices.filter((_, i) => !selectedVertexIndices.has(i));
        if (keep.length < min) return false;
        pushVertexUndo();
        drawVertices = keep;
        drawCartesians = vertsToCartesians(drawVertices);
        drawVertexCount = drawVertices.length;
        selectedVertexIndices = new Set();
        paintDraftDraw();
        return true;
    }

    function pickedDraftHandle(
        screenPos: any,
    ): { kind: "vertex" | "mid"; index: number } | null {
        if (!viewer) return null;
        try {
            const picked = viewer.scene.pick(screenPos);
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
        screenPos: any,
    ): { table: string; entityId: string } | null {
        if (!viewer || !editLayer || !bufferOverlayVisible) return null;
        try {
            const picks = viewer.scene.drillPick(screenPos, 24) ?? [];
            for (const picked of picks) {
                const entity =
                    picked?.id && typeof picked.id === "object"
                        ? picked.id
                        : picked;
                const info = overlayEntityInfo(entity);
                if (!info || info.role !== "after") continue;
                if (info.table !== editLayer) continue;
                const buf = editBuffer.entries.find(
                    (e) =>
                        e.table === info.table && e.entityId === info.entityId,
                );
                if (buf) {
                    if (buf.op === "delete") continue;
                    return { table: buf.table, entityId: buf.entityId };
                }
            }
        } catch {
            /* ignore */
        }
        return null;
    }

    function lockEditCamera() {
        if (!viewer) return;
        const c = viewer.scene.screenSpaceCameraController;
        c.enableRotate = false;
        c.enableTranslate = false;
        c.enableLook = false;
        c.enableTilt = false;
        c.enableZoom = false;
    }

    function unlockEditCamera() {
        if (!viewer) return;
        const is3d = dim === "3d";
        const c = viewer.scene.screenSpaceCameraController;
        c.enableRotate = is3d;
        c.enableTranslate = true;
        c.enableLook = is3d;
        c.enableTilt = is3d;
        c.enableZoom = true;
    }

    function startVertexDrag(index: number) {
        vertexDragIndex = index;
        midDragAfter = null;
        vertexDragMoved = false;
        // Bulk move (06): dragging a selected vertex moves the whole selection.
        // Snapshot originals so the delta applies cleanly per mousemove.
        if (selectedVertexIndices.has(index) && selectedVertexIndices.size > 1) {
            vertexDragStartPositions = new Map(
                [...selectedVertexIndices].map((i) => [i, { ...drawVertices[i]! }]),
            );
        } else {
            vertexDragStartPositions = null;
        }
        lockEditCamera();
    }

    function startMidDrag(afterIndex: number) {
        vertexDragIndex = null;
        midDragAfter = afterIndex;
        vertexDragMoved = false;
        lockEditCamera();
    }

    function pushVertexUndo() {
        vertexUndoStack = [
            ...vertexUndoStack,
            drawVertices.map((v) => ({ ...v })),
        ];
    }

    function moveVertexDrag(screenPos: any) {
        if (vertexDragIndex == null && midDragAfter == null) return;
        const cartesian = pickSnapCartesian(screenPos);
        if (!cartesian) return;
        const next = cartesianToVertex(cartesian);
        if (midDragAfter != null) {
            const insertAt = Math.min(midDragAfter + 1, drawVertices.length);
            pushVertexUndo();
            drawVertices = [
                ...drawVertices.slice(0, insertAt),
                next,
                ...drawVertices.slice(insertAt),
            ];
            drawCartesians = vertsToCartesians(drawVertices);
            drawVertexCount = drawVertices.length;
            vertexDragIndex = insertAt;
            midDragAfter = null;
            vertexDragMoved = true;
            // Midpoint insert shifts later indices: remap selection, select the new vertex.
            selectedVertexIndices = new Set(
                [...selectedVertexIndices]
                    .map((i) => (i >= insertAt ? i + 1 : i))
                    .filter((i) => i < drawVertices.length),
            );
            selectedVertexIndices.add(insertAt);
            paintDraftDraw();
            return;
        }
        if (vertexDragIndex == null) return;
        if (!vertexDragMoved) pushVertexUndo();
        vertexDragMoved = true;
        // Bulk move: shift every selected vertex by the anchor delta.
        if (
            vertexDragStartPositions !== null &&
            selectedVertexIndices.has(vertexDragIndex) &&
            selectedVertexIndices.size > 1
        ) {
            const anchorStart = vertexDragStartPositions.get(vertexDragIndex);
            if (anchorStart) {
                const dLon = next.lon - anchorStart.lon;
                const dLat = next.lat - anchorStart.lat;
                const dH = (next.height ?? 0) - (anchorStart.height ?? 0);
                drawVertices = drawVertices.map((v, i) => {
                    const start = vertexDragStartPositions!.get(i);
                    if (!start) return i === vertexDragIndex ? next : v;
                    return {
                        lon: start.lon + dLon,
                        lat: start.lat + dLat,
                        height: (start.height ?? 0) + dH,
                    };
                });
                drawCartesians = vertsToCartesians(drawVertices);
                paintDraftDraw();
                return;
            }
        }
        drawVertices = drawVertices.map((v, i) =>
            i === vertexDragIndex ? next : v,
        );
        drawCartesians = vertsToCartesians(drawVertices);
        paintDraftDraw();
    }

    function endVertexDrag() {
        const dragging = vertexDragIndex != null || midDragAfter != null;
        vertexDragIndex = null;
        midDragAfter = null;
        vertexDragStartPositions = null;
        if (!dragging) return;
        unlockEditCamera();
        if (vertexDragMoved) vertexSuppressClick = true;
        vertexDragMoved = false;
    }

    function onDrawPick(screenPos: any) {
        if (anyFormOpen) return;
        if (vertexSuppressClick) {
            vertexSuppressClick = false;
            return;
        }
        if (pickedDraftHandle(screenPos)) return;
        const target = pickEditTarget(screenPos);
        if (target) {
            if (
                vertexSession &&
                vertexSession.table === target.table &&
                vertexSession.entityId === target.entityId
            ) {
                return;
            }
            if (vertexSession) commitVertexEdit();
            else if (drawVertexCount > 0 || drawPartCount > 0) return;
            beginVertexEdit(target.table, target.entityId);
            return;
        }
        if (vertexSession) {
            // Plain click on empty canvas clears the vertex selection.
            if (vertexEditHandlesActive()) clearVertexSelection();
            return;
        }
        const cartesian = pickSnapCartesian(screenPos);
        if (!cartesian) return;
        drawVertices = [...drawVertices, cartesianToVertex(cartesian)];
        drawCartesians = vertsToCartesians(drawVertices);
        drawVertexCount = drawVertices.length;
        paintDraftDraw();
        if (drawMode === "Point") {
            openCreateForm();
        }
    }

    async function detachDrawDataSource() {
        drawDsEpoch += 1;
        const geom = drawDataSource;
        const handles = drawHandleDataSource;
        const pending = [drawDsAdd, drawHandleDsAdd];
        drawDataSource = null;
        drawHandleDataSource = null;
        drawDsAdd = null;
        drawHandleDsAdd = null;
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

    function finishDrawDraft(): boolean {
        if (vertexSession) return commitVertexEdit();
        if (!drawCanFinish) return false;
        openCreateForm();
        return true;
    }

    function onEnterInEdit() {
        if (vertexSession) {
            finishDrawDraft();
            return;
        }
        if (isMultipartMode(drawMode) && drawVertexCount >= drawNeed) {
            addDrawPart();
            return;
        }
        finishDrawDraft();
    }

    function teardownDrawHandler() {
        vertexDragIndex = null;
        midDragAfter = null;
        vertexDragStartPositions = null;
        vertexMarqueeStart = null;
        vertexMarqueeCurrent = null;
        vertexMarqueeMoved = false;
        dragRectVisible = false;
        lassoVisible = false;
        lassoPoints = [];
        unlockEditCamera();
        try {
            drawHandler?.destroy?.();
        } catch {
            /* ignore */
        }
        drawHandler = null;
    }

    function startVertexMarquee(screenPos: unknown, op: "add" | "remove") {
        if (!vertexSession || !vertexEditHandlesActive()) return;
        const pos = screenPos as { x: number; y: number } | undefined;
        if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
        // A modified click on a handle is a selection op, not a marquee.
        if (pickedDraftHandle(pos)) return;
        // Marquee follows the entity selection tool: box → rect, lasso → path.
        // In click mode there is no marquee (modified clicks still work).
        if (selectionToolLocal !== "box" && selectionToolLocal !== "lasso") return;
        // Freeze the globe so Shift/Ctrl-drag selects instead of rotating.
        lockEditCamera();
        vertexMarqueeStart = { x: pos.x, y: pos.y };
        vertexMarqueeCurrent = { x: pos.x, y: pos.y };
        vertexMarqueeMoved = false;
        vertexMarqueeOp = op;
        if (selectionToolLocal === "box") {
            dragRectVisible = true;
            dragRectLeft = pos.x;
            dragRectTop = pos.y;
            dragRectWidth = 0;
            dragRectHeight = 0;
            lassoVisible = false;
            lassoPoints = [];
        } else {
            dragRectVisible = false;
            lassoVisible = true;
            lassoPoints = [{ x: pos.x, y: pos.y }];
        }
    }

    function updateVertexMarquee(endPos: unknown) {
        if (!vertexMarqueeStart) return;
        const pos = endPos as { x: number; y: number } | undefined;
        if (!pos) return;
        vertexMarqueeCurrent = { x: pos.x, y: pos.y };
        const dx = pos.x - vertexMarqueeStart.x;
        const dy = pos.y - vertexMarqueeStart.y;
        if (selectionToolLocal === "box") {
            dragRectLeft = Math.min(vertexMarqueeStart.x, pos.x);
            dragRectTop = Math.min(vertexMarqueeStart.y, pos.y);
            dragRectWidth = Math.abs(dx);
            dragRectHeight = Math.abs(dy);
        } else {
            const last = lassoPoints[lassoPoints.length - 1];
            if (!last) {
                lassoPoints = [{ x: pos.x, y: pos.y }];
            } else if (Math.hypot(pos.x - last.x, pos.y - last.y) >= 4) {
                lassoPoints = [...lassoPoints, { x: pos.x, y: pos.y }];
            }
        }
        if (!vertexMarqueeMoved && Math.hypot(dx, dy) >= 6) vertexMarqueeMoved = true;
    }

    /** Returns true when a marquee was consumed (caller should skip endVertexDrag). */
    function finishVertexMarquee(): boolean {
        if (!vertexMarqueeStart) return false;
        const start = vertexMarqueeStart;
        const current = vertexMarqueeCurrent;
        const moved = vertexMarqueeMoved;
        const op = vertexMarqueeOp;
        vertexMarqueeStart = null;
        vertexMarqueeCurrent = null;
        vertexMarqueeMoved = false;
        dragRectVisible = false;
        lassoVisible = false;
        const path = [...lassoPoints];
        lassoPoints = [];
        unlockEditCamera();
        if (!moved || !start || !current) return true;
        let indices: number[] = [];
        if (selectionToolLocal === "box") {
            indices = vertexIndicesInRect(
                Math.min(start.x, current.x),
                Math.max(start.x, current.x),
                Math.min(start.y, current.y),
                Math.max(start.y, current.y),
            );
        } else {
            indices = vertexIndicesInPolygon([...path, { x: current.x, y: current.y }]);
        }
        applyVertexSelectionOp(indices, op);
        vertexSuppressClick = true;
        return true;
    }

    /** Drop an in-progress marquee without applying (Escape). */
    function cancelVertexMarquee(): boolean {
        if (!vertexMarqueeStart) return false;
        vertexMarqueeStart = null;
        vertexMarqueeCurrent = null;
        vertexMarqueeMoved = false;
        dragRectVisible = false;
        lassoVisible = false;
        lassoPoints = [];
        unlockEditCamera();
        return true;
    }

    function setupDrawHandler() {
        if (!viewer || !Cesium) return;
        teardownDrawHandler();
        drawHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        drawHandler.setInputAction((click: { position: unknown }) => {
            const handle = pickedDraftHandle(click.position);
            if (handle && (vertexSession || drawVertexCount > 0)) {
                if (handle.kind === "mid") startMidDrag(handle.index);
                else {
                    // Plain grab selects the vertex, then drags (bulk when selected).
                    // Keep an existing multi-selection when grabbing one of its own.
                    if (vertexSession && vertexEditHandlesActive() && handle.kind === "vertex") {
                        if (!selectedVertexIndices.has(handle.index)) {
                            applyVertexSelectionOp([handle.index], "replace");
                        }
                    }
                    startVertexDrag(handle.index);
                }
            }
        }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
        // NOTE: Cesium keeps one action per (event, modifier) — a second
        // setInputAction for the same pair overwrites the first. So each pair
        // below gets exactly one combined callback.
        const shiftMod = Cesium.KeyboardEventModifier.SHIFT;
        const ctrlMod = Cesium.KeyboardEventModifier.CTRL;
        const metaMod = Cesium.KeyboardEventModifier?.META;
        // Modified press: handle click-op first, else vertex marquee.
        // (Entity box/lasso convention: Shift = add, Ctrl/Cmd = remove.)
        const onModifiedDown =
            (op: "add" | "remove") => (click: { position: unknown }) => {
                const handle = click.position ? pickedDraftHandle(click.position) : null;
                if (
                    handle &&
                    vertexSession &&
                    vertexEditHandlesActive() &&
                    handle.kind === "vertex"
                ) {
                    // No click-suppress needed: the follow-up pick hits the
                    // same handle and returns early in onDrawPick.
                    applyVertexSelectionOp([handle.index], op);
                    return;
                }
                if (click.position) startVertexMarquee(click.position, op);
            };
        if (shiftMod !== undefined) {
            drawHandler.setInputAction(
                onModifiedDown("add"),
                Cesium.ScreenSpaceEventType.LEFT_DOWN,
                shiftMod,
            );
        }
        if (ctrlMod !== undefined) {
            drawHandler.setInputAction(
                onModifiedDown("remove"),
                Cesium.ScreenSpaceEventType.LEFT_DOWN,
                ctrlMod,
            );
        }
        if (metaMod !== undefined) {
            drawHandler.setInputAction(
                onModifiedDown("remove"),
                Cesium.ScreenSpaceEventType.LEFT_DOWN,
                metaMod,
            );
        }
        // Plain move serves both gestures: marquee when one is active,
        // otherwise the in-progress vertex/mid drag.
        const onMove = (move: { endPosition?: unknown }) => {
            if (vertexMarqueeStart) {
                updateVertexMarquee(move.endPosition);
                return;
            }
            if (
                (vertexDragIndex == null && midDragAfter == null) ||
                !move.endPosition
            ) {
                return;
            }
            moveVertexDrag(move.endPosition);
        };
        drawHandler.setInputAction(onMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
        // Modified moves only ever feed an active marquee (drags start plain).
        const onModifiedMove = (move: { endPosition?: unknown }) => {
            updateVertexMarquee(move.endPosition);
        };
        if (shiftMod !== undefined) {
            drawHandler.setInputAction(onModifiedMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE, shiftMod);
        }
        if (ctrlMod !== undefined) {
            drawHandler.setInputAction(onModifiedMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE, ctrlMod);
        }
        if (metaMod !== undefined) {
            drawHandler.setInputAction(onModifiedMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE, metaMod);
        }
        const onUp = () => {
            if (finishVertexMarquee()) return;
            endVertexDrag();
        };
        drawHandler.setInputAction(onUp, Cesium.ScreenSpaceEventType.LEFT_UP);
        if (shiftMod !== undefined) {
            drawHandler.setInputAction(onUp, Cesium.ScreenSpaceEventType.LEFT_UP, shiftMod);
        }
        if (ctrlMod !== undefined) {
            drawHandler.setInputAction(onUp, Cesium.ScreenSpaceEventType.LEFT_UP, ctrlMod);
        }
        if (metaMod !== undefined) {
            drawHandler.setInputAction(onUp, Cesium.ScreenSpaceEventType.LEFT_UP, metaMod);
        }
        drawHandler.setInputAction((click: { position: unknown }) => {
            onDrawPick(click.position);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        drawHandler.setInputAction(() => {
            if (vertexSession) {
                finishDrawDraft();
                return;
            }
            if (drawMode === "Point") return;
            popLastDrawVertex(false);
            if (!finishDrawDraft()) paintDraftDraw();
        }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
        getOrCreateDrawDs();
    }

    function setDrawMode(next: DrawGeomMode) {
        if (drawMode === next || anyFormOpen) return;
        if (vertexSession) cancelVertexEdit();
        selectedVertexIndices = new Set();
        drawMode = next;
        clearDraftDraw();
        paintDraftDraw();
    }

    function layerFromSelection(): string | null {
        const key = layerSelection.primaryKey;
        if (!key) return null;
        const { layer } = parseSelectionKey(key);
        return layer || null;
    }

    function dismissEntityPopup() {
        hideEntityPopup();
        pickDismissedKey = layerSelection.primaryKey ?? "";
    }

    function settleVertexSessionOnExit() {
        if (!vertexSession) return;
        const geom = snapshotPendingGeometry();
        if (!geom) {
            cancelVertexEdit();
            return;
        }
        const buf = editBuffer.entries.find((e) => {
            const vs = vertexSession;
            return (
                vs !== null &&
                e.table === vs.table &&
                e.entityId === vs.entityId
            );
        });
        const baseline = buf
            ? asGeometry(buf.geometry)
            : vertexSession.oldGeometry;
        if (geometriesEqual(geom, baseline)) {
            cancelVertexEdit();
            return;
        }
        commitVertexEdit();
    }

    function enterEditMode() {
        if (!canWrite || !active) return;
        const layer = editLayer ?? layerFromSelection();
        if (!layer) return;
        if (editBuffer.targetLayer !== layer) {
            editBuffer.setTargetLayer(layer);
        }
        dismissEntityPopup();
        closeContextMenu();
        editEnabled = true;
        measureEnabled = false;
        commentsEnabled = false;
        commentAdding = false;
        pendingComment = null;
        clearCommentSketch();
        queueMicrotask(() => {
            if (!editEnabled || vertexSession) return;
            if (layerSelection.size === 0) return;
            const key = layerSelection.primaryKey;
            if (!key) return;
            const { layer: l, id } = parseSelectionKey(key);
            if (!id || l !== editBuffer.targetLayer) return;
            beginVertexEdit(l, id);
        });
    }

    function exitEditMode() {
        dismissEntityPopup();
        editEnabled = false;
        createFormOpen = false;
        attrEdit = null;
        pendingGeometry = null;
        settleVertexSessionOnExit();
        clearDraftDraw();
    }

    function arraysEqual(a: string[], b: string[]): boolean {
        return a.length === b.length && a.every((v, i) => v === b[i]);
    }

    /** Keys / model hashes whose geometry intersects the current camera frustum. */
    function computeInView(): void {
        if (!viewer || !Cesium) return;
        const canvas = viewer.scene?.canvas;
        const width = canvas?.clientWidth ?? canvas?.width ?? 0;
        const height = canvas?.clientHeight ?? canvas?.height ?? 0;
        if (width === 0 || height === 0) return;

        const entityKeys: string[] = [];
        const time = viewer.clock.currentTime;
        for (const ds of entityDataSources()) {
            for (const entity of ds.entities.values) {
                const meta = entityMeta.get(entity);
                if (!meta) continue;
                try {
                    if (entity.show === false) continue;
                } catch {
                    /* ignore */
                }
                const key = toSelectionKey(meta.layerName, meta.entityId);
                let matched = false;
                const positionSets: any[][] = [];
                try {
                    if (entity.polygon?.hierarchy) {
                        const h = entity.polygon.hierarchy.getValue(time);
                        const pts = h?.positions ?? h;
                        if (Array.isArray(pts)) positionSets.push(pts);
                    }
                } catch {
                    /* ignore */
                }
                try {
                    if (entity.polyline?.positions) {
                        const pts = entity.polyline.positions.getValue(time);
                        if (Array.isArray(pts)) positionSets.push(pts);
                    }
                } catch {
                    /* ignore */
                }
                try {
                    if (entity.position) {
                        const pos = entity.position.getValue(time);
                        if (pos) positionSets.push([pos]);
                    }
                } catch {
                    /* ignore */
                }
                if (positionSets.length === 0) {
                    const sphere = entityBoundingSphere(entity);
                    if (sphere?.center) positionSets.push([sphere.center]);
                }
                outer: for (const pts of positionSets) {
                    for (const pos of pts) {
                        try {
                            const screenPos =
                                Cesium.SceneTransforms.worldToWindowCoordinates(
                                    viewer.scene,
                                    pos,
                                );
                            if (
                                screenPos &&
                                screenPos.x >= 0 &&
                                screenPos.x <= width &&
                                screenPos.y >= 0 &&
                                screenPos.y <= height
                            ) {
                                matched = true;
                                break outer;
                            }
                        } catch {
                            /* ignore */
                        }
                    }
                }
                if (matched) entityKeys.push(key);
            }
        }

        const modelHashes: string[] = [];
        try {
            const camera = viewer.camera;
            const cullingVolume = camera.frustum.computeCullingVolume(
                camera.position,
                camera.direction,
                camera.up,
            );
            for (const [hash, tileset] of tilesetPrims) {
                if (!tileset?.show) continue;
                const bs = tileset.boundingSphere;
                if (!bs) continue;
                if (
                    cullingVolume.computeVisibility(bs) !==
                    Cesium.Intersect.OUTSIDE
                ) {
                    modelHashes.push(hash);
                }
            }
        } catch {
            /* ignore */
        }

        const uniqueEntityKeys = [...new Set(entityKeys)].sort();
        modelHashes.sort();
        if (!arraysEqual(uniqueEntityKeys, inViewEntityKeys)) {
            inViewEntityKeys = uniqueEntityKeys;
        }
        if (!arraysEqual(modelHashes, inViewModelHashes)) {
            inViewModelHashes = modelHashes;
        }
    }

    function scheduleInViewUpdate(): void {
        if (inViewThrottle != null) return;
        inViewThrottle = setTimeout(() => {
            inViewThrottle = null;
            if (filterToView) computeInView();
        }, 200);
    }

    /**
     * Cesium GeometryVisualizer crashes if getBoundingSphere runs before its
     * first update() after entities are added (_updaterSets missing). Guard it.
     * With enableCollision, DONE spheres include clamp-to-ground height.
     */
    function entityBoundingSphere(entity: any): any | null {
        if (!viewer || !Cesium || !scratchSphere || !entity) return null;
        try {
            const state = viewer.dataSourceDisplay.getBoundingSphere(
                entity,
                true,
                scratchSphere,
            );
            if (state !== Cesium.BoundingSphereState.DONE) return null;
            if (!scratchSphere.center) return null;
            return Cesium.BoundingSphere.clone(scratchSphere);
        } catch {
            return null;
        }
    }

    /**
     * Skip unready visualizer spheres: ECEF origin, or lon/lat 0,0
     * (ground primitives often report DONE at the Gulf of Guinea).
     */
    function isUsableExtentSphere(s: any): boolean {
        if (!s?.center || !(s.radius >= 0) || !Cesium) return false;
        const mag = Cesium.Cartesian3.magnitude(s.center);
        if (!Number.isFinite(mag) || mag < 1_000_000) return false;
        try {
            const c = Cesium.Cartographic.fromCartesian(s.center);
            const lon = Cesium.Math.toDegrees(c.longitude);
            const lat = Cesium.Math.toDegrees(c.latitude);
            if (Math.abs(lon) < 1e-4 && Math.abs(lat) < 1e-4) return false;
        } catch {
            return false;
        }
        return true;
    }

    function pushExtentSphere(spheres: any[], entity: any) {
        try {
            if (entity?.show === false) return;
        } catch {
            /* ignore */
        }
        const s = entityBoundingSphere(entity);
        if (!isUsableExtentSphere(s)) return;
        spheres.push(
            new Cesium.BoundingSphere(s.center, Math.max(s.radius, 2)),
        );
    }

    function collectExtentSpheres(ds: any, spheres: any[]) {
        if (!ds) return;
        for (const entity of ds.entities.values) {
            pushExtentSphere(spheres, entity);
        }
    }

    function entityScreenPos(entity: any) {
        const sphere = entityBoundingSphere(entity);
        if (!sphere || !viewer || !Cesium) return null;
        return (
            Cesium.SceneTransforms.worldToWindowCoordinates(
                viewer.scene,
                sphere.center,
            ) ?? null
        );
    }

    function makePickCandidate(
        entity: any,
        layerName: string,
        entityId: string,
    ): PickCandidate {
        const time = Cesium?.JulianDate?.now?.();
        const row = rowByEntityId(rows[layerName], entityId);
        const buf = editBuffer.entries.find(
            (e) => e.table === layerName && e.entityId === entityId,
        );
        const fromRow = attrsFromRecord(row);
        const fromBuf = attrsFromRecord(buf?.attributes);
        const fromEntity = attrsFromEntity(entity?.properties, time);
        const attributes =
            Object.keys(fromRow).length > 0
                ? fromRow
                : Object.keys(fromBuf).length > 0
                  ? fromBuf
                  : fromEntity;
        return {
            key: toSelectionKey(layerName, entityId),
            layerName,
            entityId,
            label: pickCandidateLabel(entityId, attributes),
            attributes,
        };
    }

    /** Show pick pager for an entity (store selection already updated). */
    function selectEntity(
        entity: any,
        layerName: string,
        entityId: string,
    ) {
        selectedEntity = entity;
        const key = toSelectionKey(layerName, entityId);
        if (
            pickCandidates.length === 0 ||
            !pickCandidates.some((c) => c.key === key)
        ) {
            pickCandidates = [makePickCandidate(entity, layerName, entityId)];
            pickIndex = 0;
        }
        pickOpen = true;
        // Only set a world anchor if we don't already have one (e.g. table→map).
        if (!pickAnchorCartesian) {
            setPickAnchorFromEntity(entity);
        }
        updatePickPanelFromAnchor();
    }

    function hideEntityPopup() {
        selectedEntity = null;
        popupVisible = false;
        popupHtml = "";
        pickOpen = false;
        pickCandidates = [];
        pickIndex = 0;
        pickAnchorCartesian = null;
    }

    function closePickPager(opts?: { suppressClick?: boolean }) {
        pickDismissedKey = layerSelection.primaryKey ?? "";
        if (opts?.suppressClick) suppressNextClick = true;
        pickOpen = false;
        pickCandidates = [];
        pickIndex = 0;
        selectedEntity = null;
        popupVisible = false;
        popupHtml = "";
        pickAnchorCartesian = null;
    }

    function setPickAnchorFromScreen(position: { x: number; y: number }) {
        if (!viewer || !Cesium) return;
        // Prefer mesh/terrain pick so the panel sticks in 3D space under the cursor.
        const world = pickMeasureCartesian(position);
        if (world) {
            pickAnchorCartesian = Cesium.Cartesian3.clone(world);
            return;
        }
        // Fallback: first candidate's bounding sphere center.
        const top = pickCandidates[0];
        if (top) setPickAnchorFromEntity(findEntityByKey(top.key));
    }

    function setPickAnchorFromEntity(entity: any) {
        if (!viewer || !Cesium || !entity) return;
        const sphere = entityBoundingSphere(entity);
        if (sphere?.center) {
            pickAnchorCartesian = Cesium.Cartesian3.clone(sphere.center);
        }
    }

    function updatePickPanelFromAnchor() {
        if (!viewer || !Cesium || !pickAnchorCartesian) return;
        const win = Cesium.SceneTransforms.worldToWindowCoordinates(
            viewer.scene,
            pickAnchorCartesian,
        );
        const canvas = viewer.scene?.canvas;
        const w = canvas?.clientWidth ?? 400;
        const h = canvas?.clientHeight ?? 300;
        if (!win) return;
        const onScreen =
            win.x >= -40 &&
            win.y >= -40 &&
            win.x <= w + 40 &&
            win.y <= h + 40;
        if (!onScreen) return;

        // Anchor at the click; PickPager translates fully above (or below if clipped).
        pickPanelX = Math.max(8, Math.min(win.x, w - 8));
        pickPanelY = Math.max(8, Math.min(win.y, h - 8));
        pickFlipBelow = win.y < 200;
    }

    function applyPickIndex(i: number) {
        const c = pickCandidates[i];
        if (!c) return;
        pickIndex = i;
        layerSelection.selectSingle(c.layerName, c.entityId);
        lastFlownKey = selectionFlyKey();
        syncAllSelectionStyles();
        selectedEntity = findEntityByKey(c.key);
        // Do not retarget pickAnchorCartesian — panel stays pinned to the click in 3D.
    }

    function collectDrillCandidates(position: unknown): PickCandidate[] {
        if (!viewer || !Cesium) return [];
        const picks = viewer.scene.drillPick(position, 32) ?? [];
        const out: PickCandidate[] = [];
        for (const picked of picks) {
            const entity = resolvePickedEntity(picked);
            if (!entity) continue;
            try {
                if (entity.show === false) continue;
            } catch {
                /* ignore */
            }
            const meta = entityMeta.get(entity);
            if (!meta) continue;
            if (layerSelection.isHidden(meta.layerName, meta.entityId)) continue;
            if (isViewFiltered(meta.layerName, meta.entityId)) continue;
            out.push(makePickCandidate(entity, meta.layerName, meta.entityId));
        }
        return dedupePickCandidates(out);
    }

    function applyEntitySelectionStyle(
        entity: any,
        kind: "primary" | "secondary" | null,
    ) {
        const meta = entityMeta.get(entity);
        if (!meta || !Cesium) return;
        const base = meta.base;
        const accentCss =
            kind === "primary"
                ? SELECTION_PRIMARY
                : kind === "secondary"
                  ? SELECTION_SECONDARY
                  : null;
        const accent = accentCss
            ? (cesiumColorFromCss(accentCss, accentCss) ??
              Cesium.Color.fromCssColorString(accentCss))
            : null;
        const selected = kind != null;
        if (meta.kind === "point" && entity.point) {
            entity.point.pixelSize = kind === "primary"
                ? Math.max(meta.basePixelSize + 6, 14)
                : selected
                  ? Math.max(meta.basePixelSize + 3, 11)
                  : meta.basePixelSize;
            entity.point.color = accent ?? base;
            entity.point.outlineColor = selected
                ? Cesium.Color.WHITE
                : (meta.baseOutline ?? Cesium.Color.WHITE);
            entity.point.outlineWidth = 1;
        } else if (meta.kind === "polyline" && entity.polyline) {
            entity.polyline.width = kind === "primary"
                ? Math.max(meta.baseWidth + 3, 5)
                : selected
                  ? Math.max(meta.baseWidth + 1.5, 3.5)
                  : meta.baseWidth;
            const color = accent ?? base;
            if (!selected && meta.dash && Cesium.PolylineDashMaterialProperty) {
                entity.polyline.material = new Cesium.PolylineDashMaterialProperty({
                    color,
                });
            } else {
                entity.polyline.material = color;
            }
        } else if (meta.kind === "polygon" && entity.polygon) {
            const fill = accent ?? base;
            const a = selected
                ? kind === "primary"
                    ? Math.min(meta.baseAlpha + 0.1, 0.55)
                    : Math.min(meta.baseAlpha + 0.05, 0.5)
                : meta.baseAlpha;
            entity.polygon.material =
                fill && typeof fill.withAlpha === "function"
                    ? fill.withAlpha(a)
                    : fill;
            if (entity.polygon.outlineColor !== undefined) {
                entity.polygon.outlineColor = selected
                    ? Cesium.Color.WHITE
                    : (meta.baseOutline ?? base);
            }
            if (entity.polygon.outlineWidth !== undefined) {
                entity.polygon.outlineWidth = kind === "primary"
                    ? Math.max(meta.baseOutlineWidth + 1, 3)
                    : selected
                      ? Math.max(meta.baseOutlineWidth + 0.5, 2.5)
                      : meta.baseOutlineWidth;
            }
        }
    }

    function syncAllSelectionStyles() {
        for (const key of styledSelectionKeys) {
            for (const entity of findEntitiesByKey(key)) {
                applyEntitySelectionStyle(entity, null);
            }
        }
        styledSelectionKeys = new Set();

        const primary = layerSelection.primaryKey;
        for (const key of layerSelection.selected) {
            const entities = findEntitiesByKey(key);
            if (entities.length === 0) continue;
            const kind = key === primary ? "primary" : "secondary";
            for (const entity of entities) {
                applyEntitySelectionStyle(entity, kind);
            }
            styledSelectionKeys.add(key);
        }
        for (const key of joinedKeys) {
            if (styledSelectionKeys.has(key)) continue;
            const entities = findEntitiesByKey(key);
            if (entities.length === 0) continue;
            for (const entity of entities) {
                applyEntitySelectionStyle(entity, "secondary");
            }
            styledSelectionKeys.add(key);
        }

        bumpRender();

        if (editEnabled) {
            hideEntityPopup();
            return;
        }

        if (layerSelection.size === 0) {
            pickDismissedKey = "";
            hideEntityPopup();
            return;
        }

        // Single selection: show popup. Multi: no popup (primary still styled).
        if (layerSelection.size === 1 && primary) {
            if (pickDismissedKey === primary) return;
            const entity = findEntityByKey(primary);
            if (entity) {
                const { layer, id } = parseSelectionKey(primary);
                selectEntity(entity, layer, id);
                return;
            }
        }
        hideEntityPopup();
    }

    function trackEntity(
        entity: any,
        layerName: string,
        entityId: string,
        kind: EntityMeta["kind"],
        base: any,
        extras: Partial<
            Pick<
                EntityMeta,
                | "basePixelSize"
                | "baseWidth"
                | "baseOutlineWidth"
                | "baseOutline"
                | "baseAlpha"
                | "dash"
            >
        > = {},
    ) {
        if (!entityId) return;
        entityMeta.set(entity, {
            layerName,
            entityId,
            kind,
            base,
            basePixelSize: extras.basePixelSize ?? 8,
            baseWidth: extras.baseWidth ?? 2,
            baseOutlineWidth: extras.baseOutlineWidth ?? 1,
            baseOutline: extras.baseOutline ?? null,
            baseAlpha: extras.baseAlpha ?? 0.35,
            dash: extras.dash ?? false,
            ...captureBasePosition(entity),
        });
        entity.name = toSelectionKey(layerName, entityId);
        if (layerSelection.isHidden(layerName, entityId)) {
            try {
                entity.show = false;
            } catch {
                /* ignore */
            }
        }
    }

    function captureBasePosition(entity: any): {
        baseLon?: number;
        baseLat?: number;
        baseAlt?: number;
    } {
        if (!Cesium || !entity?.position) return {};
        try {
            const time = Cesium.JulianDate?.now?.() ?? undefined;
            const cart = cesiumPropValue(entity.position, time) ?? entity.position;
            if (!cart) return {};
            const c = Cesium.Cartographic.fromCartesian(cart);
            if (!c) return {};
            return {
                baseLon: Cesium.Math.toDegrees(c.longitude),
                baseLat: Cesium.Math.toDegrees(c.latitude),
                baseAlt: c.height ?? 0,
            };
        } catch {
            return {};
        }
    }

    function applyEntityHeight(
        entity: any,
        meta: EntityMeta,
        meters: number | null,
    ) {
        if (!Cesium) return;
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
        if (meta.kind === "point" && entity.position && meta.baseLon != null && meta.baseLat != null) {
            const alt = (meta.baseAlt ?? 0) + (meters ?? 0);
            entity.position = Cesium.Cartesian3.fromDegrees(
                meta.baseLon,
                meta.baseLat,
                alt,
            );
        }
    }

    function resolveEntityIdFromCzml(entity: any, layerName: string): string {
        const time = Cesium?.JulianDate?.now?.() ?? undefined;
        const props = entity.properties;
        if (props) {
            // Only TinyOwl ids — not import natural keys named id/fid.
            for (const key of ["source_id", "entity_id"]) {
                try {
                    const p = props[key] ?? props.get?.(key);
                    const v = cesiumPropValue(p, time);
                    if (v != null && String(v).trim() !== "") return String(v);
                } catch {
                    /* ignore */
                }
            }
        }
        const packetId = String(entity.id ?? "");
        if (!packetId || packetId === "document") return "";
        return entityIdFromPacketId(packetId, layerName);
    }

    function snapshotEntityStyle(
        entity: any,
        kind: EntityMeta["kind"],
    ): {
        base: any;
        basePixelSize: number;
        baseWidth: number;
        baseOutlineWidth: number;
        baseOutline: any;
        baseAlpha: number;
    } {
        const time = Cesium.JulianDate.now();
        const fallback = Cesium.Color.DODGERBLUE;
        if (kind === "point" && entity.point) {
            const color =
                cesiumPropValue(entity.point.color, time) ?? fallback;
            const pixelSize =
                Number(cesiumPropValue(entity.point.pixelSize, time)) || 8;
            const outlineWidth = 1;
            const outline =
                cesiumPropValue(entity.point.outlineColor, time) ??
                Cesium.Color.WHITE;
            return {
                base: color,
                basePixelSize: pixelSize,
                baseWidth: 2,
                baseOutlineWidth: outlineWidth,
                baseOutline: outline,
                baseAlpha: 1,
            };
        }
        if (kind === "polyline" && entity.polyline) {
            const mat = cesiumPropValue(entity.polyline.material, time) as any;
            let color = fallback;
            if (mat?.color) {
                color = cesiumPropValue(mat.color, time) ?? mat.color ?? fallback;
            } else if (mat && typeof mat.red === "number") {
                color = mat;
            }
            const width =
                Number(cesiumPropValue(entity.polyline.width, time)) || 2;
            return {
                base: color,
                basePixelSize: 8,
                baseWidth: width,
                baseOutlineWidth: 1,
                baseOutline: null,
                baseAlpha: 1,
            };
        }
        // polygon
        const mat = cesiumPropValue(entity.polygon?.material, time) as any;
        let color = fallback;
        let alpha = 0.35;
        if (mat?.color) {
            color = cesiumPropValue(mat.color, time) ?? mat.color ?? fallback;
        } else if (mat && typeof mat.red === "number") {
            color = mat;
        }
        if (color && typeof color.alpha === "number") alpha = color.alpha;
        const outline =
            cesiumPropValue(entity.polygon?.outlineColor, time) ?? color;
        const outlineWidth =
            Number(cesiumPropValue(entity.polygon?.outlineWidth, time)) || 2;
        return {
            base: color,
            basePixelSize: 8,
            baseWidth: 2,
            baseOutlineWidth: outlineWidth,
            baseOutline: outline,
            baseAlpha: alpha,
        };
    }

    function indexCzmlEntities(ds: any, layerName: string) {
        for (const entity of ds.entities.values) {
            const packetId = String(entity.id ?? "");
            if (!packetId || packetId === "document") continue;
            let kind: EntityMeta["kind"] | null = null;
            if (entity.point) kind = "point";
            else if (entity.polyline) kind = "polyline";
            else if (entity.polygon) kind = "polygon";
            if (!kind) continue;
            const entityId = resolveEntityIdFromCzml(entity, layerName);
            if (!entityId) continue;
            const style = snapshotEntityStyle(entity, kind);
            trackEntity(entity, layerName, entityId, kind, style.base, style);
        }
    }

    function indexOverlayEntities(ds: any) {
        if (!ds) return;
        for (const entity of ds.entities.values) {
            const info = overlayEntityInfo(entity);
            if (!info || info.role !== "after") continue;
            let kind: EntityMeta["kind"] | null = null;
            if (entity.point) kind = "point";
            else if (entity.polygon) kind = "polygon";
            else if (entity.polyline) kind = "polyline";
            if (!kind) continue;
            const style = snapshotEntityStyle(entity, kind);
            trackEntity(
                entity,
                info.table,
                info.entityId,
                kind,
                style.base,
                style,
            );
        }
    }

    function resolvePickedEntity(picked: any): any {
        if (!picked) return null;
        if (picked.id && entityMeta.has(picked.id)) return picked.id;
        if (entityMeta.has(picked)) return picked;
        // Classification / ground primitive pick may nest id
        if (picked.id && typeof picked.id === "object") return picked.id;
        return null;
    }

    function applyBasemapTheme() {
        if (!viewer || !Cesium) return;
        const dark = isDark();
        const is3d =
            appliedDim === "3d" ||
            viewer.scene.mode === Cesium.SceneMode.SCENE3D;
        const colors = mapColors();
        const bg =
            cesiumColorFromCss(colors.card, dark ? "#1a1a1a" : "#f5f5f5") ??
            (dark ? Cesium.Color.BLACK : Cesium.Color.WHITE);
        viewer.scene.backgroundColor = bg;
        viewer.scene.globe.baseColor = bg;
        if (viewer.scene.skyAtmosphere) {
            viewer.scene.skyAtmosphere.show = is3d && !dark;
        }
        if (viewer.scene.sun) viewer.scene.sun.show = is3d && !dark;
        if (viewer.scene.moon) viewer.scene.moon.show = is3d && !dark;
        if (viewer.scene.skyBox) viewer.scene.skyBox.show = is3d && !dark;
        if (viewer.scene.globe) {
            viewer.scene.globe.showGroundAtmosphere = is3d;
        }

        if (basemapLayer) {
            tuneBasemapLayer(
                basemapLayer,
                dark && Boolean(imageryOption(imageryId).themeAdjust),
            );
        }
    }

    function tuneBasemapLayer(layer: { brightness: number; saturation: number; contrast: number; gamma: number; minificationFilter?: unknown; magnificationFilter?: unknown }, dark: boolean) {
        // LINEAR (no mipmaps) avoids WebGL generateMipmap lazy-init jank on zoom.
        if (Cesium?.TextureMinificationFilter) {
            layer.minificationFilter = Cesium.TextureMinificationFilter.LINEAR;
            layer.magnificationFilter = Cesium.TextureMagnificationFilter.LINEAR;
        }
        if (dark) {
            layer.brightness = 0.84;
            layer.saturation = 0.92;
            layer.contrast = 1.04;
            layer.gamma = 0.96;
        } else {
            layer.brightness = 1;
            layer.saturation = 1;
            layer.contrast = 1;
            layer.gamma = 1;
        }
    }

    let morphRemover: (() => void) | null = null;
    /** Bumped on each applySceneMode so stale morphComplete handlers no-op. */
    let sceneMorphGen = 0;
    /** Last dim applied — skip redundant morph. */
    let appliedDim: "2d" | "3d" | null = null;

    function finishSceneMode(is3d: boolean, opts: { refocus?: boolean } = {}) {
        if (!viewer || !Cesium) return;
        const ctrl = viewer.scene.screenSpaceCameraController;
        ctrl.enableTilt = is3d;
        ctrl.enableLook = is3d;
        ctrl.enableRotate = is3d;
        ctrl.enableTranslate = true;
        ctrl.enableZoom = true;
        ctrl.minimumZoomDistance = is3d ? 0.5 : 50;
        ctrl.maximumZoomDistance = 40_000_000;

        if (viewer.scene.skyAtmosphere) {
            viewer.scene.skyAtmosphere.show = is3d && !isDark();
        }
        if (viewer.scene.sun) viewer.scene.sun.show = is3d && !isDark();
        if (viewer.scene.moon) viewer.scene.moon.show = is3d && !isDark();
        if (viewer.scene.skyBox) viewer.scene.skyBox.show = is3d && !isDark();
        if (viewer.scene.globe) {
            viewer.scene.globe.showGroundAtmosphere = is3d;
        }

        // Hide 3D tilesets in 2D — vectors keep baked absolute heights (NONE).
        for (const [hash, prim] of tilesetPrims) {
            try {
                prim.show = is3d && isModelVisible(hash);
            } catch {
                /* ignore */
            }
        }

        applyBasemapTheme();
        try {
            viewer.resize();
            viewer.scene.requestRender();
        } catch {
            /* ignore */
        }

        // Morph drops / skews the camera — reframe after the scene settles.
        if (opts.refocus) {
            if (pendingFlyModelHash) {
                const hash = pendingFlyModelHash;
                pendingFlyModelHash = "";
                void (async () => {
                    await new Promise<void>((r) =>
                        requestAnimationFrame(() => r()),
                    );
                    await flyToModelSphere(hash);
                })();
            } else {
                void refocusAfterMorph(is3d);
            }
        }
    }

    function applySceneMode(d: "2d" | "3d") {
        if (!viewer || !Cesium) return;
        const target =
            d === "3d" ? Cesium.SceneMode.SCENE3D : Cesium.SceneMode.SCENE2D;
        if (appliedDim === d && viewer.scene.mode === target) return;
        appliedDim = d;
        const is3d = d === "3d";

        if (morphRemover) {
            try {
                morphRemover();
            } catch {
                /* ignore */
            }
            morphRemover = null;
            // Dropped an in-flight morphComplete — sync tileset/sky to the
            // new destination now so rapid toggles don't leave 3D chrome in 2D.
            finishSceneMode(is3d, { refocus: false });
        }

        try {
            viewer.camera.cancelFlight();
        } catch {
            /* ignore */
        }

        if (viewer.scene.mode === target) {
            finishSceneMode(is3d, { refocus: true });
            return;
        }

        const morphGen = ++sceneMorphGen;
        morphRemover = viewer.scene.morphComplete.addEventListener(() => {
            if (morphGen !== sceneMorphGen) return;
            if (morphRemover) {
                try {
                    morphRemover();
                } catch {
                    /* ignore */
                }
                morphRemover = null;
            }
            finishSceneMode(is3d, { refocus: true });
        });

        try {
            if (is3d) viewer.scene.morphTo3D(0.45);
            else viewer.scene.morphTo2D(0.45);
        } catch {
            viewer.scene.mode = target;
            finishSceneMode(is3d, { refocus: true });
        }
    }

    async function boot() {
        if (!browser || !el || !creditSink) return;
        Cesium = await loadCesium();
        scratchSphere = new Cesium.BoundingSphere();
        const token = publicEnv.PUBLIC_CESIUM_ION_ACCESS_TOKEN ?? "";
        if (token) Cesium.Ion.defaultAccessToken = token;
        ionAvailable = Boolean(token);
        const nextImagery = resolveImageryId(readStoredImageryId(), ionAvailable);
        const nextTerrain = resolveTerrainId(readStoredTerrainId(), ionAvailable);

        // Viewer first on ellipsoid — same as injalak. Do NOT pass
        // Terrain.fromWorldTerrain() here: that helper swaps the provider
        // asynchronously after ready, so early height samples land at Z≈0.
        const initialImagery =
            nextImagery === "none"
                ? false
                : new Cesium.ImageryLayer(createOsmImageryProvider(Cesium));
        viewer = new Cesium.Viewer(el, {
            animation: false,
            timeline: false,
            baseLayerPicker: false,
            geocoder: false,
            homeButton: false,
            sceneModePicker: false,
            selectionIndicator: false,
            navigationHelpButton: false,
            fullscreenButton: false,
            infoBox: false,
            creditContainer: creditSink,
            requestRenderMode: true,
            maximumRenderTimeChange: Infinity,
            skyBox: false,
            // Default true → 1× CSS pixels (soft/aliased on HiDPI).
            useBrowserRecommendedResolution: false,
            msaaSamples: 4,
            baseLayer: initialImagery,
        });
        if (nextImagery === "none") {
            while (viewer.imageryLayers.length > 0) {
                viewer.imageryLayers.remove(viewer.imageryLayers.get(0), true);
            }
            basemapLayer = null;
        } else {
            basemapLayer = viewer.imageryLayers.length
                ? viewer.imageryLayers.get(0)
                : null;
        }
        try {
            viewer.resize();
            viewer.scene.postProcessStages.fxaa.enabled = true;
        } catch {
            /* ignore */
        }
        applyBasemapTheme();
        viewer.scene.globe.depthTestAgainstTerrain = false;
        try {
            renderRequestRemovers.push(
                viewer.camera.changed.addEventListener(bumpRender),
            );
            renderRequestRemovers.push(
                viewer.scene.globe.tileLoadProgressEvent.addEventListener(
                    bumpRender,
                ),
            );
        } catch {
            /* ignore */
        }

        if (nextImagery !== "osm" && nextImagery !== "none") {
            await applyImagery(nextImagery);
        } else {
            imageryId = nextImagery;
            persistImageryId(nextImagery);
            hasIonTerrain = usesIon(nextImagery, nextTerrain);
        }
        // Terrain must be live before syncLayers / sampleTerrainMostDetailed.
        await applyTerrain(nextTerrain);
        // Start in requested dim without morph flash on first paint.
        appliedDim = dim;
        viewer.scene.mode =
            dim === "3d" ? Cesium.SceneMode.SCENE3D : Cesium.SceneMode.SCENE2D;
        finishSceneMode(dim === "3d");

        clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        viewer.scene.canvas.addEventListener("pointerdown", (ev: PointerEvent) => {
            lastPointerMods = {
                shift: ev.shiftKey,
                ctrl: ev.ctrlKey,
                meta: ev.metaKey,
            };
        });
        clickHandler.setInputAction((click: { position: unknown }) => {
            if (suppressNextClick) {
                suppressNextClick = false;
                return;
            }
            if (measureEnabled || editEnabled) return;
            closeContextMenu();
            const commentHit = pickCommentId(viewer, click.position);
            if (commentHit) {
                layerSelection.clearSelection();
                clearSelectionUi();
                commentsEnabled = true;
                selectedCommentId = commentHit;
                pendingComment = null;
                commentAdding = false;
                clearCommentSketch();
                commentBalloonAnchor = null;
                commentBalloonAnchorId = null;
                const hit = comments.find((c) => c.id === commentHit);
                if (hit?.status === "resolved" && commentFilter === "open") {
                    commentFilter = "all";
                }
                bumpRender();
                return;
            }
            if (commentAdding && canWrite) {
                onCommentSketchPick(click.position);
                return;
            }
            const { shift, ctrl, meta: cmd } = lastPointerMods;
            const candidates = collectDrillCandidates(click.position);
            if (candidates.length === 0) {
                clearSelection();
                closePickPager();
                return;
            }
            clearCommentSelection();
            pickDismissedKey = "";
            const top = candidates[0]!;
            if (shift) {
                layerSelection.addSelection(top.layerName, top.entityId);
                lastFlownKey = selectionFlyKey();
                syncAllSelectionStyles();
                return;
            }
            if (ctrl || cmd) {
                layerSelection.removeSelection(top.layerName, top.entityId);
                lastFlownKey = selectionFlyKey();
                syncAllSelectionStyles();
                return;
            }
            pickCandidates = candidates;
            pickIndex = 0;
            pickOpen = true;
            layerSelection.selectSingle(top.layerName, top.entityId);
            lastFlownKey = selectionFlyKey();
            syncAllSelectionStyles();
            selectedEntity = findEntityByKey(top.key);
            const pos = click.position as { x: number; y: number };
            setPickAnchorFromScreen(pos);
            updatePickPanelFromAnchor();
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        clickHandler.setInputAction((click: { position: { x: number; y: number } }) => {
            if (measureEnabled || editEnabled) return;
            const picked = viewer.scene.pick(click.position);
            const entity = resolvePickedEntity(picked);
            const meta = entity ? entityMeta.get(entity) : undefined;
            if (entity && meta) {
                // Context menu only — preview highlight OK; do not selectSingle / popup.
                openEntityContextMenu(click.position, entity, meta.layerName, meta.entityId);
                return;
            }
            const tilesetHash = resolvePickedTilesetHash(picked);
            if (tilesetHash) {
                openTilesetContextMenu(click.position, tilesetHash);
                return;
            }
            closeContextMenu();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

        viewer.scene.canvas.addEventListener("contextmenu", (ev: Event) => {
            ev.preventDefault();
        });

        postRenderRemover = viewer.scene.postRender.addEventListener(() => {
            if (pickOpen && pickAnchorCartesian) updatePickPanelFromAnchor();
            if (filterToView) scheduleInViewUpdate();
            const now =
                typeof performance !== "undefined" ? performance.now() : Date.now();
            if (
                presenceMember &&
                commentDataSource &&
                commentClampNeedsRetry() &&
                now - lastCommentClampMs > 250
            ) {
                lastCommentClampMs = now;
                syncCommentPins({
                    Cesium,
                    viewer,
                    ds: commentDataSource,
                    comments,
                    filter: commentFilter,
                    selectedId: selectedCommentId,
                    pending: pendingComment,
                    sketch: commentSketchVerts,
                    sketchMode: commentDrawMode,
                });
            }
            paintCommentBalloons();
        });

        ready = true;
        started = true;
        // Effects load layers/models once — do not sync here (avoids empty→full remount).
    }

    async function syncModels(fly = false) {
        if (!viewer || !Cesium) return;
        const gen = ++modelLoadGen;
        error = "";
        const readyHashes = new Set(models.map((m) => m.hash));

        // Remove only models that left the project list (not visibility toggles).
        for (const hash of [...tilesetPrims.keys()]) {
            if (!readyHashes.has(hash)) destroyTileset(hash);
        }

        // Toggle with .show — never destroy on hide.
        for (const m of models) {
            const want = isModelVisible(m.hash);
            const existing = tilesetPrims.get(m.hash);
            if (existing) {
                existing.show = dim === "3d" && want;
                applyTilesetHeightOffset(existing, m.height_offset_m);
                continue;
            }
            // Always load while wanted — hide via .show in 2D so a later
            // morph to 3D does not miss tilesets that arrived mid-2D.
            if (!want || !m.root_url) continue;
            try {
                const prim = await loadTilesetPrimitive(
                    Cesium,
                    viewer,
                    m,
                    accessToken,
                    dim === "3d" && isModelVisible(m.hash),
                );
                if (!prim) continue;
                if (gen !== modelLoadGen || !readyHashes.has(m.hash)) {
                    if (!prim.isDestroyed?.()) prim.destroy();
                    continue;
                }
                viewer.scene.primitives.add(prim);
                tilesetPrims.set(m.hash, prim);
            } catch (e) {
                if (gen === modelLoadGen) {
                    error =
                        e instanceof Error
                            ? e.message
                            : "Failed to load 3D model";
                }
            }
        }

        if (gen !== modelLoadGen) return;

        flyHomeOnce();
        bumpRender();
    }

    let pendingFlyModelHash = "";

    async function flyToModelSphere(hash: string) {
        if (!viewer || !Cesium) return;
        let prim = tilesetPrims.get(hash);
        if (!prim) {
            await syncModels(false);
            if (!viewer || viewer.isDestroyed?.()) return;
            prim = tilesetPrims.get(hash);
        }
        if (!prim) return;
        try {
            await prim.readyPromise;
        } catch {
            /* continue */
        }
        if (!viewer || viewer.isDestroyed?.()) return;
        const m = models.find((t) => t.hash === hash);
        applyTilesetHeightOffset(prim, m?.height_offset_m);
        if (prim.boundingSphere?.radius > 0) {
            await flyCameraToSphere(
                Cesium.BoundingSphere.clone(prim.boundingSphere),
                1.0,
            );
            return;
        }
        try {
            await viewer.flyTo(prim, { duration: 1.0 });
        } catch {
            /* ignore */
        }
    }

    function flyToModel(hash: string) {
        if (!isModelVisible(hash)) {
            modelVis = { ...modelVis, [hash]: true };
            const prim = tilesetPrims.get(hash);
            if (prim) prim.show = dim === "3d";
            else void syncModels(false);
        }
        onSelectTileset?.(hash);
        if (dim !== "3d") {
            pendingFlyModelHash = hash;
            onDimChange?.("3d");
            return;
        }
        void flyToModelSphere(hash);
    }

    function setAllModelsVisible(visible: boolean) {
        const next: Record<string, boolean> = { ...modelVis };
        for (const m of models) next[m.hash] = visible;
        modelVis = next;
        for (const [hash, prim] of tilesetPrims) {
            try {
                prim.show = visible && dim === "3d";
            } catch {
                /* ignore */
            }
        }
        if (visible) void syncModels(false);
    }

    function toggleModel(hash: string) {
        const next = !isModelVisible(hash);
        modelVis = { ...modelVis, [hash]: next };
        const prim = tilesetPrims.get(hash);
        if (prim) {
            prim.show = next && dim === "3d";
            if (next) onSelectTileset?.(hash);
            bumpRender();
            return;
        }
        if (next) {
            onSelectTileset?.(hash);
            void syncModels(false);
        }
    }

    function coverageCtx(gen: number) {
        return {
            Cesium,
            viewer,
            rasters,
            accessToken,
            coverageLayers,
            coverageCogDestroy,
            isCoverageVisible,
            stillCurrent: () => gen === coverageLoadGen,
            setError: (msg: string) => {
                coverageError = coverageError
                    ? `${coverageError}; ${msg}`
                    : msg;
            },
        };
    }

    function destroyCoverageLayer(hash: string) {
        destroyCoverageLayerImpl(coverageCtx(coverageLoadGen), hash);
    }

    async function syncCoverageImagery() {
        if (!viewer || !Cesium) return;
        const gen = ++coverageLoadGen;
        coverageError = "";
        await syncCoverageImageryImpl(coverageCtx(gen));
        if (gen !== coverageLoadGen) return;
        bumpRender();
    }

    function toggleCoverage(hash: string) {
        const next = !isCoverageVisible(hash);
        coverageVis = { ...coverageVis, [hash]: next };
        const layers = coverageLayers.get(hash);
        if (layers) {
            for (const layer of layers) layer.show = next;
            bumpRender();
            return;
        }
        if (next) void syncCoverageImagery();
    }

    function flyToCoverage(hash: string) {
        if (!viewer || !Cesium) return;
        const cov = rasters.find((c) => c.hash === hash);
        const bb = cov?.bbox_wgs84;
        if (!bb || bb.length !== 4) return;
        const rect = Cesium.Rectangle.fromDegrees(bb[0], bb[1], bb[2], bb[3]);
        void viewer.camera.flyTo({
            destination: rect,
            duration: 0.8,
        });
    }

    async function syncLayers() {
        if (!viewer || !Cesium) return;
        const gen = ++layerLoadGen;
        const byName = new Map(layers.map((l) => [l.name, l]));

        for (const name of [...layerSources.keys()]) {
            if (!byName.has(name)) destroyLayerSource(name);
        }

        for (let i = 0; i < layers.length; i++) {
            if (gen !== layerLoadGen) return;
            const layer = layers[i]!;
            let ds = layerSources.get(layer.name);
            const packetCount = layer.packets?.length ?? 0;
            const needsLoad =
                !ds ||
                (ds.__packetCount !== undefined &&
                    ds.__packetCount !== packetCount);

            if (needsLoad && packetCount > 0) {
                if (ds) destroyLayerSource(layer.name);
                try {
                    const { customDataSourceFromCzml } = await import(
                        "./czmlEntities"
                    );
                    ds = await customDataSourceFromCzml(
                        Cesium,
                        viewer,
                        layer.packets,
                        layer.name,
                    );
                    if (gen !== layerLoadGen) return;
                    ds.__packetCount = packetCount;
                    ds.show = layer.visible;
                    indexCzmlEntities(ds, layer.name);
                    await viewer.dataSources.add(ds);
                    layerSources.set(layer.name, ds);
                } catch (e) {
                    console.warn("layer", layer.name, e);
                }
            } else if (ds) {
                ds.show = layer.visible;
            }
        }

        if (gen !== layerLoadGen) return;

        applyLayerViews();
        flyHomeOnce();
        bumpRender();
    }

    function colorFromRgba(rgba: number[], opacity: number) {
        const [r = 0, g = 0, b = 0, a = 255] = rgba;
        return new Cesium.Color(
            r / 255,
            g / 255,
            b / 255,
            (a / 255) * opacity,
        );
    }

    function selectionKindFor(
        layerName: string,
        entityId: string,
    ): "primary" | "secondary" | null {
        const key = toSelectionKey(layerName, entityId);
        if (!layerSelection.selected.has(key)) return null;
        return key === layerSelection.primaryKey ? "primary" : "secondary";
    }

    function applyLayerClustering(ds: any, layerName: string) {
        if (!Cesium || !ds?.clustering) return;
        const layer = layers.find((l) => l.name === layerName);
        const view = activeView(layer?.views, layer?.activeViewId ?? "");
        const on = Boolean(view?.style.cluster);
        const range =
            view?.style.clusterPixelRange && view.style.clusterPixelRange > 0
                ? view.style.clusterPixelRange
                : DEFAULT_CLUSTER_PIXEL_RANGE;
        ds.clustering.pixelRange = range;
        ds.clustering.minimumClusterSize = 2;
        ds.clustering.clusterPoints = true;
        ds.clustering.clusterBillboards = true;
        ds.clustering.clusterLabels = true;
        if (!clusteredSources.has(ds)) {
            clusteredSources.add(ds);
            ds.clustering.clusterEvent.addEventListener(
                (clusteredEntities: unknown[], cluster: any) => {
                    const n = clusteredEntities?.length ?? 0;
                    const size = n < 10 ? 28 : n < 100 ? 36 : 44;
                    const live = layers.find((l) => l.name === ds.name);
                    const fill = layerLegendColor(
                        live?.views,
                        live?.activeViewId ?? "",
                    );
                    const color = colorFromRgba(fill, 1);
                    try {
                        if (cluster.billboard) cluster.billboard.show = false;
                        if (cluster.point) {
                            cluster.point.show = true;
                            cluster.point.color = color;
                            cluster.point.pixelSize = size;
                            cluster.point.outlineColor =
                                Cesium.Color.WHITE.withAlpha(0.9);
                            cluster.point.outlineWidth = 2;
                            cluster.point.disableDepthTestDistance =
                                Number.POSITIVE_INFINITY;
                        }
                        if (cluster.label) {
                            cluster.label.show = true;
                            cluster.label.text = String(n);
                            cluster.label.font =
                                "650 12px ui-sans-serif, system-ui, sans-serif";
                            cluster.label.fillColor = Cesium.Color.WHITE;
                            cluster.label.outlineColor = Cesium.Color.BLACK;
                            cluster.label.outlineWidth = 3;
                            cluster.label.style =
                                Cesium.LabelStyle?.FILL_AND_OUTLINE ??
                                cluster.label.style;
                            cluster.label.disableDepthTestDistance =
                                Number.POSITIVE_INFINITY;
                            cluster.label.pixelOffset = new Cesium.Cartesian2(
                                0,
                                0,
                            );
                        }
                    } catch {
                        /* ignore */
                    }
                },
            );
        }
        ds.clustering.enabled = false;
        ds.clustering.enabled = on;
    }

    function applyLayerViews() {
        if (!viewer || !Cesium) return;
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
        for (const ds of entityDataSources()) {
            try {
                for (const entity of ds.entities.values) {
                    const meta = entityMeta.get(entity);
                    if (!meta) continue;
                    const layer = layers.find((l) => l.name === meta.layerName);
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
                        const row = rowByEntityId(
                            rows[meta.layerName],
                            meta.entityId,
                        );
                        const fill = resolveFill(view.style, row, span?.color);
                        const outline = contrastColor(fill);
                        meta.dash = Boolean(view.style.dash);
                        meta.basePixelSize = view.style.pointSize || meta.basePixelSize;
                        meta.baseWidth = view.style.strokeWidth || meta.baseWidth;
                        if (meta.kind === "point") {
                            meta.baseOutlineWidth = POINT_OUTLINE_WIDTH;
                            meta.base = colorFromRgba(fill, op);
                            meta.baseOutline = colorFromRgba(outline, 1);
                            meta.baseAlpha = ((fill[3] ?? 255) / 255) * op;
                        } else if (meta.kind === "polyline") {
                            const line =
                                view.source === "sld" &&
                                view.style.strokeColor?.length
                                    ? view.style.strokeColor
                                    : fill;
                            meta.base = colorFromRgba(line, op);
                            meta.baseOutline = colorFromRgba(line, op);
                            meta.baseAlpha = ((line[3] ?? 255) / 255) * op;
                        } else {
                            meta.baseOutlineWidth = view.style.strokeWidth || 1;
                            meta.base = colorFromRgba(fill, op);
                            meta.baseOutline = colorFromRgba(outline, 1);
                            meta.baseAlpha = ((fill[3] ?? 255) / 255) * op;
                        }
                        applyEntityHeight(
                            entity,
                            meta,
                            resolveHeight(view.style, row, span?.height),
                        );
                    } else {
                        applyEntityHeight(entity, meta, null);
                    }
                    applyEntitySelectionStyle(
                        entity,
                        selectionKindFor(meta.layerName, meta.entityId),
                    );
                }
            } catch {
                /* ignore */
            }
        }
        for (const [name, ds] of layerSources) {
            try {
                applyLayerClustering(ds, name);
            } catch {
                /* ignore */
            }
        }
        applyHiddenVisibility();
        bumpRender();
    }

    function toggleLayer(idx: number) {
        const layer = layers[idx];
        if (!layer) return;
        layer.visible = !layer.visible;
        const ds = layerSources.get(layer.name);
        if (ds) {
            ds.show = layer.visible;
        } else if (layer.visible) {
            void syncLayers();
        }
        applyHiddenVisibility();
    }

    function setLayerOpacity(idx: number, opacity: number) {
        const layer = layers[idx];
        if (!layer) return;
        layer.opacity = Math.max(0, Math.min(1, opacity));
        applyLayerViews();
    }

    function changeLayerViews(idx: number, next: LayerView[], activeId: string) {
        const layer = layers[idx];
        if (!layer) return;
        layer.views = next;
        layer.activeViewId = activeId;
        applyLayerViews();
        if (canEditViews) onPersistViews?.(layer.name, next);
    }

    function openLayerStyle(idx: number) {
        styleLayerIdx = styleLayerIdx === idx ? null : idx;
    }

    onMount(() => {
        if (!browser) return;
        void boot().catch((e) => {
            error = e instanceof Error ? e.message : "Failed to start 3D";
            // Release the preparing overlay so the error banner is visible.
            hasFramed = true;
        });
    });

    let modelKey = $derived(
        models.map((m) => m.hash).join("|") + "|" + accessToken,
    );
    let coverageKey = $derived(
        rasters.map((c) => c.hash).join("|") +
            "|" +
            accessToken +
            "|" +
            rasters.map((c) => (c.bbox_wgs84 ?? []).join(",")).join(";"),
    );
    let layerContentKey = $derived(
        layers
            .map((l) => `${l.name}:${l.packets?.length ?? 0}`)
            .join("|"),
    );
    let viewApplyKey = $derived(
        layers
            .map(
                (l) =>
                    `${l.name}:${l.activeViewId ?? ""}:${l.opacity ?? defaultOpacityForPackets(l.packets)}:${JSON.stringify(l.views ?? [])}`,
            )
            .join("|"),
    );

    $effect(() => {
        if (styleLayerIdx === null) return;
        if (!layers[styleLayerIdx]) styleLayerIdx = null;
    });

    $effect(() => {
        modelKey;
        if (!ready || !started) return;
        void syncModels(false);
    });

    $effect(() => {
        coverageKey;
        if (!ready || !started) return;
        void syncCoverageImagery();
    });

    $effect(() => {
        layerContentKey;
        if (!ready || !started) return;
        void syncLayers();
    });

    $effect(() => {
        viewApplyKey;
        if (!ready || !started) return;
        applyLayerViews();
    });

    $effect(() => {
        diffFeatures;
        vertexSession;
        bufferOverlayVisible;
        editBuffer.entries;
        if (!ready || !started || !viewer || !Cesium) return;
        const features = !bufferOverlayVisible
            ? []
            : diffFeatures.flatMap((f) => {
                  const vs = vertexSession;
                  const editing =
                      Boolean(vs) &&
                      vs !== null &&
                      f.entityId === vs.entityId &&
                      f.table === vs.table;
                  if (editing) {
                      return f.oldGeometry
                          ? [{ ...f, geometry: null }]
                          : [];
                  }
                  return [f];
              });
        if (
            bufferOverlayVisible &&
            vertexSession?.oldGeometry &&
            !features.some((f) => {
                const vs = vertexSession;
                return (
                    vs !== null &&
                    f.entityId === vs.entityId &&
                    f.table === vs.table &&
                    f.oldGeometry
                );
            })
        ) {
            const vs = vertexSession;
            if (vs !== null) {
                features.push({
                    id: vs.entityId,
                    table: vs.table,
                    entityId: vs.entityId,
                    op: "update",
                    geometry: null,
                    oldGeometry: vs.oldGeometry,
                });
            }
        }
        let cancelled = false;
        void syncDiffOverlay(Cesium, viewer, features).then((ds) => {
            if (cancelled) return;
            diffDataSource = ds;
            indexOverlayEntities(ds);
            applyLayerViews();
            if (layerSelection.primaryKey) {
                selectedEntity = findEntityByKey(layerSelection.primaryKey);
            }
            try {
                if (ds) viewer.dataSources.raiseToTop(ds);
            } catch {
                /* ignore */
            }
            raiseDrawHandles();
            bumpRender();
        });
        return () => {
            cancelled = true;
        };
    });

    $effect(() => {
        if (!ready || !started || loading || homeFlyStarted) return;
        layerContentKey;
        modelKey;
        flyHomeOnce();
    });

    $effect(() => {
        const d = dim;
        if (!ready || !viewer) return;
        if (appliedDim === d) return;
        applySceneMode(d);
    });

    $effect(() => {
        if (!ready || !viewer) return;
        viewer.useDefaultRenderLoop = active;
        if (!active) return;
        try {
            viewer.resize();
            viewer.scene.requestRender();
        } catch {
            /* ignore */
        }
    });

    $effect(() => {
        selectionSig;
        appliedHighlight;
        editEnabled;
        if (!ready || !started || !hasFramed) return;
        syncAllSelectionStyles();
        const flyKey = selectionFlyKey();
        if (flyKey && flyKey !== lastFlownKey) {
            void flyToSelection(false);
        } else if (!flyKey) {
            lastFlownKey = "";
        }
    });

    $effect(() => {
        searchQ;
        placeBBox;
        placeLat;
        placeLng;
        placeRadius;
        if (!ready || !started || !hasFramed) return;
        if (searchQ.trim()) return;
        if (layerSelection.size > 0) return;
        void flySearchInterop(false);
    });

    $effect(() => {
        void isolating;
        void hiddenCount;
        if (!ready || !started) return;
        applyHiddenVisibility();
    });

    $effect(() => {
        themePrefs.accentHue;
        themePrefs.bgBase;
        if (!ready || !viewer) return;
        applyBasemapTheme();
    });

    $effect(() => {
        if (!filterToView || !ready || !viewer) return;
        computeInView();
    });

    $effect(() => {
        const member = presenceMember;
        const uid = presenceUserId;
        const slug = projectSlug;
        if (!browser || !ready || !viewer || viewer.isDestroyed?.() || !Cesium || !member || !uid || !slug) {
            return;
        }

        let stopped = false;
        let mouse: any = null;
        let layer: PresenceLayer | null = null;
        let handle: MapPresenceHandle | null = null;

        layer = createPresenceLayer(Cesium, viewer, {
            onRoster: (list) => {
                if (!stopped) presenceRoster = list;
            },
            node: (id) => presenceCursorNodes.get(id),
        });
        void connectMapPresence({
            slug,
            userId: uid,
            onPeers: (peers) => {
                if (stopped) return;
                presencePeers = peers;
                layer?.sync(peers);
            },
            onHidden: (hidden) => {
                if (!stopped) presenceHidden = hidden;
            },
        }).then(async (next) => {
            if (stopped) {
                await next?.stop();
                return;
            }
            if (!next) {
                layer?.destroy();
                layer = null;
                return;
            }
            handle = next;
            presenceHandle = next;
            presenceConnected = true;
            if (document.hidden) await next.setPageVisible(false);
            mouse = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
            mouse.setInputAction(
                (m: { endPosition?: unknown }) => {
                    if (!active || handle?.hidden) return;
                    const cart = pickMeasureCartesian(m.endPosition);
                    if (!cart) return;
                    const v = cartesianToVertex(cart);
                    handle?.publishCursor(v.lon, v.lat, v.height);
                },
                Cesium.ScreenSpaceEventType.MOUSE_MOVE,
            );
        });

        const onVis = () => {
            void handle?.setPageVisible(document.visibilityState === "visible");
        };
        document.addEventListener("visibilitychange", onVis);

        return () => {
            stopped = true;
            document.removeEventListener("visibilitychange", onVis);
            try {
                mouse?.destroy?.();
            } catch {
                /* ignore */
            }
            presenceHandle = null;
            presenceConnected = false;
            presencePeers = [];
            presenceRoster = [];
            layer?.destroy();
            void handle?.stop();
        };
    });

    async function reloadComments() {
        if (!presenceMember || !projectSlug) {
            comments = [];
            return;
        }
        const gen = ++commentsLoadGen;
        try {
            const list = await fetchComments(projectSlug, accessToken);
            if (gen !== commentsLoadGen) return;
            comments = list;
            commentsError = "";
            bumpRender();
        } catch (e) {
            if (gen !== commentsLoadGen) return;
            commentsError =
                e instanceof Error ? e.message : "Could not load comments";
        }
    }

    async function postComment(body: string, parentId?: string) {
        const text = body.trim();
        if (!text) return;
        commentsBusy = true;
        commentsError = "";
        try {
            const             payload: {
                body: string;
                parent_id?: string;
                layer_name?: string;
                feature_id?: string;
                lon?: number;
                lat?: number;
                geometry?: GeoJsonGeometry;
            } = { body: text };
            if (parentId) {
                payload.parent_id = parentId;
            } else if (pendingComment) {
                payload.lon = pendingComment.lon;
                payload.lat = pendingComment.lat;
                if (pendingComment.geometry) {
                    payload.geometry = pendingComment.geometry;
                }
                if (pendingComment.layerName && pendingComment.featureId) {
                    payload.layer_name = pendingComment.layerName;
                    payload.feature_id = pendingComment.featureId;
                }
            } else {
                return;
            }
            const created = await createComment(
                projectSlug,
                accessToken,
                payload,
            );
            pendingComment = null;
            commentAdding = false;
            selectedCommentId = created.parent_id ?? created.id;
            await reloadComments();
            commentsRealtime?.notify();
        } catch (e) {
            commentsError =
                e instanceof Error ? e.message : "Could not post comment";
        } finally {
            commentsBusy = false;
        }
    }

    async function resolveComment(id: string, status: "open" | "resolved") {
        commentsBusy = true;
        commentsError = "";
        try {
            await patchComment(projectSlug, accessToken, id, { status });
            await reloadComments();
            commentsRealtime?.notify();
        } catch (e) {
            commentsError =
                e instanceof Error ? e.message : "Could not update comment";
        } finally {
            commentsBusy = false;
        }
    }

    async function removeComment(id: string) {
        commentsBusy = true;
        commentsError = "";
        try {
            await deleteComment(projectSlug, accessToken, id);
            if (selectedCommentId === id) clearCommentSelection();
            await reloadComments();
            commentsRealtime?.notify();
        } catch (e) {
            commentsError =
                e instanceof Error ? e.message : "Could not delete comment";
        } finally {
            commentsBusy = false;
        }
    }

    function startFeatureComment(layerName: string, featureId: string) {
        commentsEnabled = true;
        commentAdding = false;
        const existing = comments.find(
            (c) =>
                !c.parent_id &&
                c.layer_name === layerName &&
                c.feature_id === featureId,
        );
        if (existing) {
            selectedCommentId = existing.id;
            pendingComment = null;
            if (existing.status === "resolved" && commentFilter === "open") {
                commentFilter = "all";
            }
            return;
        }
        selectedCommentId = null;
        pendingComment = {
            lon: ctxLon,
            lat: ctxLat,
            layerName,
            featureId,
            geometry: {
                type: "Point",
                coordinates:
                    Number.isFinite(ctxHeight) && Math.abs(ctxHeight) > 1e-3
                        ? [ctxLon, ctxLat, ctxHeight]
                        : [ctxLon, ctxLat],
            },
        };
    }

    function startCommentAdd() {
        commentsEnabled = true;
        commentAdding = true;
        clearCommentSelection();
        pendingComment = null;
        clearCommentSketch();
        bumpRender();
    }

    function stopCommentAdd() {
        commentAdding = false;
        pendingComment = null;
        clearCommentSketch();
        bumpRender();
    }

    function clearCommentSketch() {
        commentSketchVerts = [];
        commentSketchCount = 0;
    }

    function setCommentDrawMode(mode: DrawGeomMode) {
        commentDrawMode = mode;
        pendingComment = null;
        clearCommentSketch();
        bumpRender();
    }

    function onCommentSketchPick(screenPos: unknown) {
        const cartesian = pickMeasureCartesian(screenPos);
        if (!cartesian) return;
        const v = cartesianToVertex(cartesian);
        pendingComment = null;
        selectedCommentId = null;
        commentSketchVerts = [...commentSketchVerts, v];
        commentSketchCount = commentSketchVerts.length;
        if (commentDrawMode === "Point") finishCommentSketch();
        else bumpRender();
    }

    function finishCommentSketch() {
        const geom = geometryFromDraft(
            commentDrawMode,
            commentSketchVerts,
            [],
            true,
        );
        const first = commentSketchVerts[0];
        if (!geom || !first) return;
        pendingComment = {
            lon: first.lon,
            lat: first.lat,
            geometry: geom,
        };
        clearCommentSketch();
        bumpRender();
    }

    function commentRootId(id: string | null): string | null {
        if (!id) return null;
        const hit = comments.find((c) => c.id === id);
        if (!hit) return id;
        return hit.parent_id ?? hit.id;
    }

    function resolveCommentBalloonAnchor(rootId: string): any | null {
        if (!viewer || !Cesium) return null;
        const c = comments.find((x) => x.id === rootId);
        if (!c) return null;
        const lon = c?.lon;
        const lat = c?.lat;
        if (lon == null || lat == null) return null;
        const exclude = commentDataSource?.entities?.values
            ? [...commentDataSource.entities.values]
            : [];
        return clampLonLatToScene(
            Cesium,
            viewer,
            lon,
            lat,
            firstHeightFromGeometry(c.geometry),
            exclude,
        );
    }

    function paintCommentBalloons() {
        if (!Cesium || !viewer) return;
        const rootId = commentRootId(selectedCommentId);
        if (!rootId) {
            commentBalloonAnchor = null;
            commentBalloonAnchorId = null;
            if (commentBalloonOnScreen) commentBalloonOnScreen = false;
            return;
        }
        commentBalloonAnchorId = rootId;
        commentBalloonAnchor = resolveCommentBalloonAnchor(rootId);
        if (!commentBalloonAnchor) {
            if (commentBalloonOnScreen) commentBalloonOnScreen = false;
            return;
        }
        const win = Cesium.SceneTransforms.worldToWindowCoordinates(
            viewer.scene,
            commentBalloonAnchor,
        );
        const canvas = viewer.scene?.canvas;
        const w = canvas?.clientWidth ?? 400;
        const h = canvas?.clientHeight ?? 300;
        if (!win) {
            if (commentBalloonOnScreen) commentBalloonOnScreen = false;
            return;
        }
        const onScreen =
            win.x >= -40 &&
            win.y >= -40 &&
            win.x <= w + 40 &&
            win.y <= h + 40;
        if (!onScreen) {
            if (commentBalloonOnScreen) commentBalloonOnScreen = false;
            return;
        }
        commentBalloonX = Math.max(8, Math.min(win.x, w - 8));
        commentBalloonY = Math.max(8, Math.min(win.y, h - 8));
        if (!commentBalloonOnScreen) commentBalloonOnScreen = true;
    }

    $effect(() => {
        presenceMember;
        projectSlug;
        accessToken;
        ready;
        if (!ready || !presenceMember) {
            comments = [];
            return;
        }
        void reloadComments();
    });

    $effect(() => {
        comments;
        commentFilter;
        selectedCommentId;
        pendingComment;
        commentSketchCount;
        commentDrawMode;
        if (!ready || !viewer || !Cesium) return;
        if (!presenceMember) {
            if (commentDataSource) {
                try {
                    viewer.dataSources.remove(commentDataSource, true);
                } catch {
                    /* ignore */
                }
                commentDataSource = null;
                clearCommentHeightCache();
                bumpRender();
            }
            return;
        }
        commentDataSource = getOrCreateCommentDs(
            Cesium,
            viewer,
            commentDataSource,
        );
        syncCommentPins({
            Cesium,
            viewer,
            ds: commentDataSource,
            comments,
            filter: commentFilter,
            selectedId: selectedCommentId,
            pending: pendingComment,
            sketch: commentSketchVerts,
            sketchMode: commentDrawMode,
        });
        bumpRender();
    });

    $effect(() => {
        const member = presenceMember;
        const uid = presenceUserId;
        const slug = projectSlug;
        if (!browser || !ready || !member || !uid || !slug) return;
        let stopped = false;
        let handle: CommentsRealtimeHandle | null = null;
        void subscribeComments({
            slug,
            userId: uid,
            onChange: () => {
                if (!stopped) void reloadComments();
            },
        }).then((next) => {
            if (stopped) {
                void next?.stop();
                return;
            }
            handle = next;
            commentsRealtime = next;
        });
        return () => {
            stopped = true;
            commentsRealtime = null;
            void handle?.stop();
        };
    });

    onDestroy(() => {
        teardownDrawHandler();
        teardownMeasureHandler();
        window.removeEventListener("keydown", onSceneKey);
        if (inViewThrottle != null) {
            clearTimeout(inViewThrottle);
            inViewThrottle = null;
        }
        if (morphRemover) {
            try {
                morphRemover();
            } catch {
                /* ignore */
            }
            morphRemover = null;
        }
        // Do not clear shared layerSelection — table view may still use it.
        clearSelectionUi();
        styledSelectionKeys = new Set();
        postRenderRemover?.();
        postRenderRemover = null;
        for (const rm of renderRequestRemovers) {
            try {
                rm();
            } catch {
                /* ignore */
            }
        }
        renderRequestRemovers = [];
        try {
            clickHandler?.destroy?.();
        } catch {
            /* ignore */
        }
        clickHandler = null;
        try {
            dragHandler?.destroy?.();
        } catch {
            /* ignore */
        }
        dragHandler = null;
        for (const hash of [...tilesetPrims.keys()]) destroyTileset(hash);
        for (const hash of [...coverageLayers.keys()]) destroyCoverageLayer(hash);
        for (const name of [...layerSources.keys()]) destroyLayerSource(name);
        void detachDrawDataSource();
        try {
            destroyDiffOverlay(viewer, diffDataSource);
        } catch {
            /* ignore */
        }
        diffDataSource = null;
        try {
            viewer?.destroy?.();
        } catch {
            /* ignore */
        }
        viewer = null;
        basemapLayer = null;
    });

    function onSceneKey(ev: KeyboardEvent) {
        const action = mapToolShortcut(ev);
        if (!action) return;

        if (action.type === "enter") {
            if (anyFormOpen) return;
            if (editEnabled) {
                ev.preventDefault();
                onEnterInEdit();
                return;
            }
            if (commentCanFinishSketch) {
                ev.preventDefault();
                finishCommentSketch();
                return;
            }
            if (measureEnabled) {
                ev.preventDefault();
                finishDraft3d();
            }
            return;
        }
        if (action.type === "undo") {
            ev.preventDefault();
            undoDrawOrMeasure();
            return;
        }
        if (action.type === "delete-feature") {
            if (!canWrite || !active) return;
            ev.preventDefault();
            if (anyFormOpen) return;
            if (!editEnabled) return;
            if (
                !vertexSession &&
                (drawVertexCount > 0 || drawPartCount > 0)
            ) {
                popLastDrawVertex();
                if (drawVertexCount === 0) restoreLastDrawPart();
                return;
            }
            // Vertex multi-select (06): Del removes selected draft vertices first.
            if (vertexSession && selectedVertexIndices.size > 0) {
                deleteSelectedVertices();
                return;
            }
            deleteSelectedFeatures();
            return;
        }
        if (action.type === "escape") {
            if (attrEdit) {
                ev.preventDefault();
                cancelAttrEdit();
                return;
            }
            if (createFormOpen) {
                ev.preventDefault();
                cancelCreate();
                return;
            }
            if (editEnabled) {
                if (cancelVertexMarquee()) {
                    ev.preventDefault();
                    return;
                }
                if (vertexSession) {
                    // Escape clears the vertex selection before cancelling the session.
                    if (selectedVertexIndices.size > 0) {
                        ev.preventDefault();
                        clearVertexSelection();
                        return;
                    }
                    ev.preventDefault();
                    cancelVertexEdit();
                    return;
                }
                if (drawVertexCount > 0 || drawPartCount > 0) {
                    clearDraftDraw();
                    paintDraftDraw();
                    return;
                }
                exitEditMode();
                return;
            }
            if (measureEnabled) {
                clearDraftMeasure();
                measureStatus = measureHint(measureMode, dim === "2d" ? "2d" : "3d");
                return;
            }
            if (commentsEnabled) {
                ev.preventDefault();
                if (commentSketchCount > 0) {
                    clearCommentSketch();
                    return;
                }
                if (pendingComment) {
                    pendingComment = null;
                    commentAdding = false;
                    return;
                }
                if (commentAdding) {
                    stopCommentAdd();
                    return;
                }
                if (selectedCommentId) {
                    clearCommentSelection();
                    return;
                }
                commentsEnabled = false;
                return;
            }
            if (ctxOpen) return;
            if (pickOpen) {
                closePickPager();
                return;
            }
            if (styleLayerIdx !== null) {
                styleLayerIdx = null;
                return;
            }
            if (layerSelection.isIsolating) {
                exitIsolateUi();
                return;
            }
            clearSelection();
            return;
        }
        if (action.type === "fly-to") {
            ev.preventDefault();
            void flyToSelection(true);
            return;
        }
        if (action.type === "home") {
            ev.preventDefault();
            void flyHome();
            return;
        }
        if (action.type === "isolate") {
            ev.preventDefault();
            layerSelection.isolateSelected();
            applyHiddenVisibility();
            return;
        }
        if (action.type === "exit-isolate") {
            ev.preventDefault();
            exitIsolateUi();
            return;
        }
        if (action.type === "select-tool") {
            ev.preventDefault();
            selectionToolLocal = action.mode;
            return;
        }
        if (action.type === "measure-toggle") {
            ev.preventDefault();
            if (editEnabled) exitEditMode();
            measureEnabled = !measureEnabled;
            if (measureEnabled) commentsEnabled = false;
            return;
        }
        if (action.type === "comments-toggle") {
            if (!presenceMember) return;
            ev.preventDefault();
            if (editEnabled) exitEditMode();
            commentsEnabled = !commentsEnabled;
            if (commentsEnabled) measureEnabled = false;
            else stopCommentAdd();
            return;
        }
        if (action.type === "edit-toggle") {
            if (anyFormOpen) return;
            if (editEnabled) {
                ev.preventDefault();
                exitEditMode();
                return;
            }
            if (!canWrite || !active) return;
            if (!editLayer && !layerFromSelection()) return;
            ev.preventDefault();
            enterEditMode();
            return;
        }
        if (action.type === "measure-mode") {
            ev.preventDefault();
            if (editEnabled) {
                const mapped: Record<string, DrawGeomMode> = {
                    point: "Point",
                    length: "LineString",
                    area: "Polygon",
                };
                const next = mapped[action.mode];
                if (next) setDrawMode(next);
                return;
            }
            measureMode = action.mode;
            measureEnabled = true;
            editEnabled = false;
            commentsEnabled = false;
        }
    }

    $effect(() => {
        layerSelection.setToolMode(selectionToolLocal);
    });

    $effect(() => {
        if (!ready || !viewer || !Cesium || measureEnabled || editEnabled || commentsEnabled) return;
        if (selectionToolLocal !== "box" && selectionToolLocal !== "lasso") {
            return;
        }

        const tool = selectionToolLocal;
        const controller = viewer.scene?.screenSpaceCameraController;
        let restoreCamera: (() => void) | undefined;
        if (controller) {
            // Keep plain left-drag as camera rotate; free Shift/Ctrl for selection.
            const savedTilt = controller.tiltEventTypes;
            const savedLook = controller.lookEventTypes;
            const hasModifier = (e: unknown) =>
                e != null && typeof e === "object" && "modifier" in (e as object);
            const stripModified = (val: unknown): unknown => {
                if (Array.isArray(val)) return val.filter((e) => !hasModifier(e));
                return hasModifier(val) ? undefined : val;
            };
            controller.tiltEventTypes = stripModified(savedTilt);
            controller.lookEventTypes = stripModified(savedLook);
            restoreCamera = () => {
                if (!viewer || viewer.isDestroyed?.()) return;
                const c = viewer.scene?.screenSpaceCameraController;
                if (!c) return;
                c.tiltEventTypes = savedTilt;
                c.lookEventTypes = savedLook;
            };
        }

        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        dragHandler = handler;

        let dragStart: { x: number; y: number } | null = null;
        let dragCurrent: { x: number; y: number } | null = null;
        let dragMoved = false;
        let dragOp: SelectionOp = "add";
        const dragThresholdPx = 6;

        const startDrag = (position: { x: number; y: number }, op: SelectionOp) => {
            dragOp = op;
            dragStart = { x: position.x, y: position.y };
            dragCurrent = dragStart;
            dragMoved = false;
            if (tool === "box") {
                dragRectVisible = true;
                dragRectLeft = dragStart.x;
                dragRectTop = dragStart.y;
                dragRectWidth = 0;
                dragRectHeight = 0;
                lassoVisible = false;
                lassoPoints = [];
            } else {
                dragRectVisible = false;
                lassoVisible = true;
                lassoPoints = [{ x: dragStart.x, y: dragStart.y }];
            }
        };

        const updateMove = (endPosition: { x: number; y: number } | undefined) => {
            if (!dragStart || !endPosition) return;
            dragCurrent = { x: endPosition.x, y: endPosition.y };
            const dx = dragCurrent.x - dragStart.x;
            const dy = dragCurrent.y - dragStart.y;
            if (tool === "box") {
                dragRectLeft = Math.min(dragStart.x, dragCurrent.x);
                dragRectTop = Math.min(dragStart.y, dragCurrent.y);
                dragRectWidth = Math.abs(dx);
                dragRectHeight = Math.abs(dy);
            } else {
                const lastPoint = lassoPoints[lassoPoints.length - 1];
                if (!lastPoint) {
                    lassoPoints = [{ x: dragCurrent.x, y: dragCurrent.y }];
                } else {
                    const delta = Math.hypot(
                        dragCurrent.x - lastPoint.x,
                        dragCurrent.y - lastPoint.y,
                    );
                    if (delta >= 4) {
                        lassoPoints = [
                            ...lassoPoints,
                            { x: dragCurrent.x, y: dragCurrent.y },
                        ];
                    }
                }
            }
            if (!dragMoved && Math.hypot(dx, dy) >= dragThresholdPx) {
                dragMoved = true;
            }
        };

        const finishDrag = () => {
            if (!dragStart || !dragCurrent || !dragMoved) {
                dragStart = null;
                dragCurrent = null;
                dragMoved = false;
                dragRectVisible = false;
                lassoVisible = false;
                lassoPoints = [];
                return;
            }

            const items = allSelectableEntities();
            let ids: string[];
            if (tool === "box") {
                const left = Math.min(dragStart.x, dragCurrent.x);
                const right = Math.max(dragStart.x, dragCurrent.x);
                const top = Math.min(dragStart.y, dragCurrent.y);
                const bottom = Math.max(dragStart.y, dragCurrent.y);
                ids = collectKeysInScreenRect(
                    Cesium,
                    viewer,
                    items,
                    left,
                    right,
                    top,
                    bottom,
                );
            } else {
                const path = [...lassoPoints, { x: dragCurrent.x, y: dragCurrent.y }];
                ids = collectKeysInScreenPolygon(Cesium, viewer, items, path);
            }

            dragStart = null;
            dragCurrent = null;
            dragMoved = false;
            dragRectVisible = false;
            lassoVisible = false;
            lassoPoints = [];

            layerSelection.applyOp(ids, dragOp);
            suppressNextClick = true;
            lastFlownKey = selectionFlyKey();
            syncAllSelectionStyles();
        };

        // Shift+drag = add; Ctrl/Meta+drag = remove. Plain left-drag keeps camera.
        handler.setInputAction(
            (event: { position?: { x: number; y: number } }) => {
                if (event.position) startDrag(event.position, "add");
            },
            Cesium.ScreenSpaceEventType.LEFT_DOWN,
            Cesium.KeyboardEventModifier.SHIFT,
        );
        handler.setInputAction(
            (event: { position?: { x: number; y: number } }) => {
                if (event.position) startDrag(event.position, "remove");
            },
            Cesium.ScreenSpaceEventType.LEFT_DOWN,
            Cesium.KeyboardEventModifier.CTRL,
        );
        const metaMod = Cesium.KeyboardEventModifier?.META;
        if (metaMod !== undefined) {
            handler.setInputAction(
                (event: { position?: { x: number; y: number } }) => {
                    if (event.position) startDrag(event.position, "remove");
                },
                Cesium.ScreenSpaceEventType.LEFT_DOWN,
                metaMod,
            );
        }

        const onMove = (event: { endPosition?: { x: number; y: number } }) =>
            updateMove(event.endPosition);
        handler.setInputAction(onMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
        handler.setInputAction(
            onMove,
            Cesium.ScreenSpaceEventType.MOUSE_MOVE,
            Cesium.KeyboardEventModifier.SHIFT,
        );
        handler.setInputAction(
            onMove,
            Cesium.ScreenSpaceEventType.MOUSE_MOVE,
            Cesium.KeyboardEventModifier.CTRL,
        );
        if (metaMod !== undefined) {
            handler.setInputAction(
                onMove,
                Cesium.ScreenSpaceEventType.MOUSE_MOVE,
                metaMod,
            );
        }

        const onUp = () => finishDrag();
        handler.setInputAction(onUp, Cesium.ScreenSpaceEventType.LEFT_UP);
        handler.setInputAction(
            onUp,
            Cesium.ScreenSpaceEventType.LEFT_UP,
            Cesium.KeyboardEventModifier.SHIFT,
        );
        handler.setInputAction(
            onUp,
            Cesium.ScreenSpaceEventType.LEFT_UP,
            Cesium.KeyboardEventModifier.CTRL,
        );
        if (metaMod !== undefined) {
            handler.setInputAction(
                onUp,
                Cesium.ScreenSpaceEventType.LEFT_UP,
                metaMod,
            );
        }

        return () => {
            dragHandler = null;
            try {
                handler.destroy();
            } catch {
                /* ignore */
            }
            restoreCamera?.();
            dragRectVisible = false;
            lassoVisible = false;
            lassoPoints = [];
        };
    });

    $effect(() => {
        if (!ready || !viewer) return;
        window.addEventListener("keydown", onSceneKey);
        return () => {
            window.removeEventListener("keydown", onSceneKey);
        };
    });

    $effect(() => {
        if (!ready || !viewer) return;
        if (measureEnabled) {
            measureStatus = measureHint(measureMode, dim === "2d" ? "2d" : "3d");
            clearDraftMeasure();
            setupMeasureHandler();
            viewer.canvas.style.cursor = "crosshair";
            return;
        }
        teardownMeasureHandler();
        clearDraftMeasure();
        measureStatus = "";
        if (!editEnabled && !commentAdding && viewer?.canvas) {
            viewer.canvas.style.cursor = "";
        }
    });

    $effect(() => {
        if (!ready || !viewer) return;
        if (editEnabled) {
            setupDrawHandler();
            viewer.canvas.style.cursor = "crosshair";
            return;
        }
        teardownDrawHandler();
        clearDraftDraw();
        if (!measureEnabled && !commentAdding && viewer?.canvas) {
            viewer.canvas.style.cursor = "";
        }
    });

    $effect(() => {
        if (!ready || !viewer) return;
        if (commentAdding && canWrite && !measureEnabled && !editEnabled) {
            viewer.canvas.style.cursor = "crosshair";
            return;
        }
        if (!measureEnabled && !editEnabled && viewer?.canvas) {
            viewer.canvas.style.cursor = "";
        }
    });

    $effect(() => {
        measureMode;
        if (!measureEnabled || !ready) return;
        clearDraftMeasure();
        measureStatus = measureHint(measureMode, dim === "2d" ? "2d" : "3d");
    });

    $effect(() => {
        if (editEnabled && !canEdit) exitEditMode();
    });

    $effect(() => {
        if (!commentsEnabled) {
            commentAdding = false;
            pendingComment = null;
            clearCommentSketch();
            clearCommentSelection();
        }
    });

    $effect(() => {
        if (layerSelection.primaryKey) clearCommentSelection();
    });
</script>

<div class="relative h-full w-full min-h-0 overflow-hidden">
    <div class="absolute top-2 left-2 z-20 flex items-start gap-2">
        <MapToolsRail
            bind:enabled={measureEnabled}
            bind:mode={measureMode}
            bind:selectionTool={selectionToolLocal}
            bind:commentsEnabled
            bind:editEnabled
            showComments={presenceMember}
            showEdit={canWrite}
            canEnterEdit={canEdit}
            onEnterEdit={enterEditMode}
            onExitEdit={exitEditMode}
            status={measureStatus}
            records={measureRecords}
            {canFinish}
            {dim}
            {selectionCount}
            {isolating}
            onZoomIn={zoomIn3d}
            onZoomOut={zoomOut3d}
            onFlyToSelection={() => flyToSelection(true)}
            onFlyHome={() => {
                void flyHome();
            }}
            onFlyTopDown={flyTopDown}
            onLockNorth={lockNorthUp}
            onClearSelection={() => clearSelection()}
            onHideSelected={() => {
                layerSelection.hideSelected();
                applyHiddenVisibility();
            }}
            onShowSelected={() => {
                layerSelection.showSelected();
                applyHiddenVisibility();
            }}
            onIsolateSelected={() => {
                layerSelection.isolateSelected();
                applyHiddenVisibility();
            }}
            onExitIsolate={() => {
                exitIsolateUi();
            }}
            onClear={() => void clearMeasurements()}
            onFinish={finishDraft3d}
            onRemove={(id) => void removeMeasurement(id)}
        >
            {#snippet extraRail()}
                <MapViewChrome
                    {dim}
                    {fullscreen}
                    onSetDim={onDimChange}
                    {onToggleFullscreen}
                    {imageryId}
                    {terrainId}
                    {ionAvailable}
                    {imageryBusy}
                    {terrainBusy}
                    {providerError}
                    onSetImagery={(id) => void applyImagery(id)}
                    onSetTerrain={(id) => void applyTerrain(id)}
                />
            {/snippet}
        </MapToolsRail>
        {#if commentsEnabled && presenceMember}
            <CommentPanel
                {comments}
                filter={commentFilter}
                selectedId={selectedCommentId}
                pending={pendingComment}
                adding={commentAdding}
                canWrite={canWrite}
                busy={commentsBusy}
                error={commentsError}
                onFilter={(next) => (commentFilter = next)}
                onSelect={(id) => {
                    if (id) {
                        layerSelection.clearSelection();
                        clearSelectionUi();
                        pendingComment = null;
                        commentAdding = false;
                        clearCommentSketch();
                        selectedCommentId = id;
                    } else {
                        clearCommentSelection();
                    }
                }}
                onAdd={startCommentAdd}
                onCancelAdd={stopCommentAdd}
                onCancelPending={stopCommentAdd}
                onPost={(body) => void postComment(body)}
                onClose={() => {
                    commentsEnabled = false;
                    stopCommentAdd();
                }}
            />
        {/if}
    </div>

    {#if canWrite && editEnabled && editLayer}
        <div
            class="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center"
        >
            <EditModeBar
                layer={editLayer}
                mode={drawMode}
                canFinish={drawCanFinish && !anyFormOpen}
                canAddPart={drawCanAddPart && !anyFormOpen && !vertexSession}
                canDelete={!anyFormOpen}
                useHeight={drawUseHeight}
                snap={snapMode}
                vertexEditing={Boolean(vertexSession)}
                onMode={setDrawMode}
                onUseHeight={setDrawUseHeight}
                onSnap={(m) => (snapMode = m)}
                onFinish={finishDrawDraft}
                onAddPart={addDrawPart}
                onDelete={deleteSelectedFeatures}
            />
        </div>
    {:else if canWrite && commentAdding && !pendingComment}
        <div
            class="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center"
        >
            <EditModeBar
                layer="Comment"
                mode={commentDrawMode}
                canFinish={commentCanFinishSketch}
                showHeight={false}
                showSnap={false}
                onMode={setCommentDrawMode}
                onFinish={finishCommentSketch}
            />
        </div>
    {/if}

    <EntityContextMenu
        open={ctxOpen}
        x={ctxX}
        y={ctxY}
        kind={ctxKind}
        layerName={ctxLayerName}
        entityId={ctxEntityId}
        targetVisible={ctxKind === "tileset"
            ? isModelVisible(ctxTilesetHash)
            : true}
        {selectionCount}
        targetInSelection={layerSelection.isSelected(ctxLayerName, ctxEntityId)}
        {isolating}
        onFlyTo={() => {
            if (ctxKind === "tileset" && ctxTilesetHash) {
                flyToModel(ctxTilesetHash);
                return;
            }
            if (ctxEntity && ctxLayerName && ctxEntityId) {
                if (!layerSelection.isSelected(ctxLayerName, ctxEntityId)) {
                    layerSelection.selectSingle(ctxLayerName, ctxEntityId);
                }
                lastFlownKey = "";
                void flyToSelection(true);
            } else {
                void flyToSelection(true);
            }
        }}
        onHide={() => {
            if (ctxKind === "tileset" && ctxTilesetHash) {
                toggleModel(ctxTilesetHash);
                return;
            }
            if (ctxEntity) {
                hideEntity(ctxEntity, ctxLayerName, ctxEntityId);
            }
        }}
        onShow={() => {
            if (ctxKind === "tileset" && ctxTilesetHash) {
                toggleModel(ctxTilesetHash);
            }
        }}
        onHideAll={() => {
            layerSelection.hideSelected();
            applyHiddenVisibility();
            closeContextMenu();
        }}
        onShowSelected={() => {
            layerSelection.showSelected();
            applyHiddenVisibility();
        }}
        onIsolate={() => {
            if (
                ctxLayerName &&
                ctxEntityId &&
                !layerSelection.isSelected(ctxLayerName, ctxEntityId)
            ) {
                layerSelection.selectSingle(ctxLayerName, ctxEntityId);
            }
            layerSelection.isolateSelected();
            applyHiddenVisibility();
        }}
        onExitIsolate={() => {
            exitIsolateUi();
        }}
        onClear={() => clearSelection()}
        onComment={presenceMember && canWrite && ctxKind === "entity"
            ? () => startFeatureComment(ctxLayerName, ctxEntityId)
            : undefined}
        onEditAttributes={canWrite && ctxKind === "entity"
            ? () => openAttrEdit(ctxLayerName, ctxEntityId)
            : undefined}
        onDelete={canWrite && ctxKind === "entity"
            ? () => deleteBufferedFeature(ctxLayerName, ctxEntityId)
            : undefined}
        onClose={closeContextMenu}
    />

    {#if hiddenCount > 0 && !isolating}
        <button
            type="button"
            class="absolute {editEnabled
                ? 'bottom-24'
                : 'bottom-10'} left-3 z-20 rounded-md border border-border bg-background/95 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm hover:text-foreground"
            onclick={showAllHiddenEntities}
        >
            {hiddenCount} hidden · Show all
        </button>
    {/if}

    {#if !hasFramed && !error}
        <CesiumLoading />
    {/if}

    {#if hasFramed && ready && !loading && (models.length > 0 || layers.length > 0 || coverageRows.length > 0)}
        <div
            class="pointer-events-none absolute top-2 right-2 bottom-2 z-10 flex items-start gap-2"
        >
            {#if styleLayerIdx !== null && layers[styleLayerIdx]}
                {@const styleLayer = layers[styleLayerIdx]}
                {#key styleLayer.name}
                    <div class="pointer-events-auto">
                    <LayerStylePanel
                        layer={styleLayer}
                        rows={rows[styleLayer.name] ?? []}
                        canEdit={canEditViews}
                        onClose={() => (styleLayerIdx = null)}
                        applyViews={(views, activeId) =>
                            changeLayerViews(styleLayerIdx!, views, activeId)}
                        onSetOpacity={(v) =>
                            setLayerOpacity(styleLayerIdx!, v)}
                    />
                    </div>
                {/key}
            {/if}
            <div
                class="pointer-events-auto flex max-h-full min-h-0 w-60 flex-col gap-2 overflow-hidden"
            >
            <SceneGraphPanel
                {layers}
                {models}
                coverages={coverageRows}
                {rows}
                {palette}
                pendingModels={pending}
                modelVisible={isModelVisible}
                coverageVisible={isCoverageVisible}
                onToggleModel={toggleModel}
                onSetModelsVisible={setAllModelsVisible}
                onToggleCoverage={toggleCoverage}
                onToggleLayer={toggleLayer}
                onOpenStyle={openLayerStyle}
                styleLayerName={styleLayerIdx !== null
                    ? (layers[styleLayerIdx]?.name ?? "")
                    : ""}
                onApplyHidden={applyHiddenVisibility}
                onFlyTo={() => {
                    lastFlownKey = "";
                    void flyToSelection(true);
                }}
                onFlyToLayer={(name) => {
                    void flyToLayerExtent(name);
                }}
                onFlyToCoverage={flyToCoverage}
                onFlyToModel={flyToModel}
                {joinedKeys}
                bind:filterToView
                {inViewEntityKeys}
                {inViewModelHashes}
                    {canWrite}
                    class="min-h-0 flex-1"
                />
                {#if canWrite && createFormOpen}
                    <FeatureCreateForm
                        layer={editLayer ?? ""}
                        geomType={drawMode}
                        fields={createFields}
                        onConfirm={confirmCreate}
                        onCancel={cancelCreate}
                    />
                {:else if canWrite && attrEdit}
                    {#key `${attrEdit.table}:${attrEdit.entityId}`}
                        <FeatureCreateForm
                            mode="edit"
                            layer={attrEdit.table}
                            entityId={attrEdit.entityId}
                            geomType="Point"
                            fields={attrEditFields}
                            initial={attrEditInitial}
                            onConfirm={confirmAttrEdit}
                            onCancel={cancelAttrEdit}
                        />
                    {/key}
                {/if}
                {#if canWrite && (bufferEntries.length > 0 || commitDoneId)}
                    <div
                        class="flex min-h-0 max-h-52 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-background/95 text-xs shadow-lg backdrop-blur-sm"
                    >
                        <div
                            class="flex shrink-0 items-center justify-between gap-2 border-b border-border px-2 py-1.5"
                        >
                            <span
                                class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                                >Buffer · {bufferEntries.length}</span
                            >
                            <div class="flex items-center gap-0.5">
                                <button
                                    type="button"
                                    class="inline-flex items-center rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                                    title={bufferOverlayVisible
                                        ? "Hide buffer on map"
                                        : "Show buffer on map"}
                                    onclick={() =>
                                        (bufferOverlayVisible =
                                            !bufferOverlayVisible)}
                                >
                                    {#if bufferOverlayVisible}
                                        <EyeIcon class="size-3" />
                                    {:else}
                                        <EyeOffIcon class="size-3" />
                                    {/if}
                                </button>
                                <button
                                    type="button"
                                    class="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                                    title="Clear session buffer"
                                    onclick={() => editBuffer.clear()}
                                >
                                    <XIcon class="size-3" />
                                    Clear
                                </button>
                            </div>
                        </div>
                        <ul class="min-h-0 flex-1 overflow-y-auto p-1">
                            {#each bufferEntries as rec (rec.entityId)}
                                <li
                                    class="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-secondary/80 {vertexSession?.entityId ===
                                        rec.entityId &&
                                    vertexSession?.table === rec.table
                                        ? 'bg-secondary'
                                        : ''}"
                                >
                                    <button
                                        type="button"
                                        class="min-w-0 flex-1 truncate text-left"
                                        title={rec.op === "delete"
                                            ? `Deleted · ${rec.table} · ${rec.entityId}`
                                            : `Edit ${rec.table} · ${rec.entityId}`}
                                        onclick={() => {
                                            if (rec.op === "delete") return;
                                            if (!editEnabled) enterEditMode();
                                            queueMicrotask(() =>
                                                beginVertexEdit(
                                                    rec.table,
                                                    rec.entityId,
                                                ),
                                            );
                                        }}
                                    >
                                        {#if rec.op === "delete"}
                                            <span class="text-red-400/90"
                                                >delete ·</span
                                            >
                                        {/if}
                                        <span class="text-muted-foreground"
                                            >{rec.table} ·</span
                                        >
                                        <span class="font-medium"
                                            >{rec.entityId}</span
                                        >
                                    </button>
                                    <button
                                        type="button"
                                        class="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                                        title="Remove"
                                        onclick={() =>
                                            editBuffer.remove(rec.entityId)}
                                    >
                                        <XIcon class="size-3" />
                                    </button>
                                </li>
                            {/each}
                        </ul>
                        {#if bufferEntries.length > 0}
                            <form
                                class="flex shrink-0 flex-col gap-1 border-t border-border p-1.5"
                                onsubmit={(e) => {
                                    e.preventDefault();
                                    void commitEditBuffer();
                                }}
                            >
                                <input
                                    class="w-full rounded-md border border-border bg-background px-1.5 py-1 text-xs text-foreground placeholder:text-muted-foreground"
                                    placeholder="Commit message (required)"
                                    bind:value={commitMessage}
                                    disabled={commitBusy}
                                    maxlength={500}
                                />
                                <div class="flex items-center justify-between gap-1">
                                    <button
                                        type="submit"
                                        class="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1 font-medium text-foreground hover:bg-primary/20 disabled:opacity-50"
                                        disabled={commitBusy ||
                                            !commitMessage.trim()}
                                        title="Submit as pending changeset (does not write canonical)"
                                    >
                                        <CheckIcon class="size-3" />
                                        {commitBusy ? "Sending…" : "Commit"}
                                    </button>
                                </div>
                                {#if commitError}
                                    <p class="text-[10px] text-destructive">
                                        {commitError}
                                    </p>
                                {/if}
                            </form>
                        {/if}
                        {#if commitDoneId}
                            <p
                                class="shrink-0 border-t border-border px-1.5 py-1 text-[10px] text-muted-foreground"
                            >
                                Pending
                                <a
                                    class="font-medium text-foreground underline-offset-2 hover:underline"
                                    href="/{projectSlug}/review/{commitDoneId}"
                                    >review</a
                                >
                            </p>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    {#if coverageError}
        <div
            class="absolute {editEnabled
                ? 'bottom-24'
                : 'bottom-10'} left-2 right-2 z-10 rounded-md border border-border bg-background/95 px-2 py-1.5 text-[11px] text-muted-foreground"
        >
            Coverage: {coverageError}
        </div>
    {/if}

    {#if ready && !loading && models.length === 0 && layers.length === 0 && coverageRows.length === 0}
        <div
            class="absolute inset-0 z-5 flex flex-col items-center justify-center gap-2 bg-background/70 px-6 text-center"
        >
            <BoxIcon class="size-10 text-muted-foreground/30" />
            <p class="text-sm">No layers or 3D models</p>
            <p class="max-w-sm text-xs text-muted-foreground">
                Add entities to this project, or upload a georeferenced
                <code class="font-mono">.3tz</code> from Artefacts.
            </p>
            {#if failed}
                <p class="max-w-sm text-xs text-destructive">{failed.ingest_error}</p>
            {/if}
            <a
                href="/{projectSlug}/artefacts"
                class="text-xs text-primary hover:underline">Open Artefacts</a
            >
        </div>
    {/if}

    {#if error}
        <div
            class="absolute {editEnabled
                ? 'bottom-28'
                : 'bottom-14'} left-3 right-3 z-10 rounded-md border border-destructive/40 bg-background/95 px-3 py-2 text-xs text-destructive"
        >
            {error}
        </div>
    {/if}

    {#if selectionToolLocal === "box" && dragRectVisible}
        <div
            class="pointer-events-none absolute z-40 border border-sky-400/90 bg-sky-300/10"
            style="left: {dragRectLeft}px; top: {dragRectTop}px; width: {dragRectWidth}px; height: {dragRectHeight}px;"
        ></div>
    {/if}
    {#if selectionToolLocal === "lasso" && lassoVisible && lassoPoints.length > 1}
        <svg
            class="pointer-events-none absolute inset-0 z-40 h-full w-full"
            preserveAspectRatio="none"
        >
            <polygon
                points={lassoPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="rgba(56,189,248,0.12)"
                stroke="rgba(56,189,248,0.95)"
                stroke-width="1.5"
                stroke-dasharray="5 4"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>
    {/if}

    <div
        bind:this={el}
        class="cesium-scene absolute inset-0 z-0 bg-neutral-900"
    ></div>
    <PresenceCursors roster={presenceRoster} nodes={presenceCursorNodes} />
    {#if presenceMember}
        <CommentBalloons
            {comments}
            selectedId={selectedCommentId}
            open={Boolean(selectedCommentId) && commentBalloonOnScreen}
            x={commentBalloonX}
            y={commentBalloonY}
            canWrite={canWrite}
            currentUserId={presenceUserId}
            isAdmin={commentIsAdmin}
            busy={commentsBusy}
            onSelect={(id) => {
                commentsEnabled = true;
                layerSelection.clearSelection();
                clearSelectionUi();
                selectedCommentId = id;
                pendingComment = null;
                commentAdding = false;
                clearCommentSketch();
            }}
            onReply={(body, parentId) => void postComment(body, parentId)}
            onResolve={(id, status) => void resolveComment(id, status)}
            onDelete={(id) => void removeComment(id)}
        />
    {/if}
    <div bind:this={creditSink} class="sr-only" aria-hidden="true"></div>

    {#if pickOpen && !editEnabled}
        <PickPager
            open={pickOpen}
            candidates={pickCandidates}
            bind:index={pickIndex}
            placement="floating"
            x={pickPanelX}
            y={pickPanelY}
            flipBelow={pickFlipBelow}
            onIndexChange={applyPickIndex}
            canEdit={canWrite}
            onEdit={(c) => openAttrEdit(c.layerName, c.entityId)}
            onClose={() => {
                closePickPager({ suppressClick: true });
            }}
        />
    {/if}

    {#if ready && Cesium && viewer && dim === "3d"}
        <EnuCornerWidget {Cesium} {viewer} show={true} />
    {/if}

    <div
        class="absolute bottom-2 right-2 z-20 flex flex-col items-end gap-1"
    >
        {#if presenceMember && ready && presenceConnected}
            <PresenceDock
                peers={presencePeers}
                hidden={presenceHidden}
                onToggleHidden={() => {
                    void presenceHandle?.setHidden(!presenceHidden);
                }}
            />
        {/if}
    <CesiumAttribution
        credits={creditsFor(imageryId, terrainId)}
        ion={hasIonTerrain}
    />
    </div>
</div>

<style>
    :global(.cesium-scene .cesium-viewer-bottom),
    :global(.cesium-scene .cesium-widget-credits),
    :global(.cesium-scene .cesium-credit-lightbox) {
        display: none !important;
    }
</style>
