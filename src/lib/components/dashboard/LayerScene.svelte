<script lang="ts">
    import { browser } from "$app/environment";
    import { page } from "$app/stores";
    import { env as publicEnv } from "$env/dynamic/public";
    import { onDestroy, onMount, untrack } from "svelte";
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
    import SceneMenuBar, {
        type SceneToolMode,
        type ViewingRef,
    } from "./SceneMenuBar.svelte";
    import { viewportMenu } from "./viewportMenu.svelte";
    import InstanceGraph from "$lib/instance-graph/InstanceGraph.svelte";
    import EntityContextMenu from "./EntityContextMenu.svelte";
    import SceneGraphPanel from "./SceneGraphPanel.svelte";
    import LayerStylePanel from "./LayerStylePanel.svelte";
    import TilesetOffsetPanel from "./TilesetOffsetPanel.svelte";
    import LayerSeriesBar from "./LayerSeriesBar.svelte";
    import PickPager from "./PickPager.svelte";
    import { readInfoboxDocked } from "./infoboxDock";
    import EditModeBar from "./EditModeBar.svelte";
    import FeatureCreateForm from "./FeatureCreateForm.svelte";
    import {
        applyEntitySelectionStyle as paintEntitySelection,
    } from "./selectionStyle";
    import { computeInViewKeys } from "./layerSceneInView";
    import { paintLayerViews } from "./layerSceneViews";
    import { createLayerViewer } from "./layerSceneBoot";
    import {
        clearDraftMeasure as clearDraftMeasureImpl,
        clearMeasurements as clearMeasurementsImpl,
        createMeasureSession,
        finishDraft3d as finishDraft3dImpl,
        popLastMeasureVertex as popLastMeasureVertexImpl,
        removeMeasurement as removeMeasurementImpl,
        setVolumeKind as setVolumeKindImpl,
        setupMeasureHandler as setupMeasureHandlerImpl,
        teardownMeasureHandler as teardownMeasureHandlerImpl,
        type LayerSceneMeasureCtx,
    } from "./layerSceneMeasure";
    import { sampleLengthProfileOnGlobe, sampleAreaSurfaceOnGlobe, sampleVolumeOnGlobe } from "./layerSceneMeasureSample";
    import {
        createDrawSession,
        setupDrawHandler as setupDrawHandlerImpl,
        teardownDrawHandler as teardownDrawHandlerImpl,
        clearDraftDraw as clearDraftDrawImpl,
        paintDraftDraw as paintDraftDrawImpl,
        setDrawUseHeight as setDrawUseHeightImpl,
        setDrawMode as setDrawModeImpl,
        confirmCreate as confirmCreateImpl,
        cancelCreate as cancelCreateImpl,
        dismissCreateFormKeepDraft as dismissCreateFormKeepDraftImpl,
        deleteBufferedFeature as deleteBufferedFeatureImpl,
        deleteSelectedFeatures as deleteSelectedFeaturesImpl,
        addDrawPart as addDrawPartImpl,
        popLastDrawVertex as popLastDrawVertexImpl,
        restoreLastDrawPart as restoreLastDrawPartImpl,
        undoLastBuffer as undoLastBufferImpl,
        commitEditBuffer as commitEditBufferImpl,
        beginVertexEdit as beginVertexEditImpl,
        cancelVertexEdit as cancelVertexEditImpl,
        settleVertexSessionOnExit as settleVertexSessionOnExitImpl,
        undoVertexStep as undoVertexStepImpl,
        clearVertexSelection as clearVertexSelectionImpl,
        deleteSelectedVertices as deleteSelectedVerticesImpl,
        detachDrawDataSource as detachDrawDataSourceImpl,
        finishDrawDraft as finishDrawDraftImpl,
        onEnterInEdit as onEnterInEditImpl,
        cancelVertexMarquee as cancelVertexMarqueeImpl,
        type LayerSceneDrawCtx,
    } from "./layerSceneDraw";
    import {
        createCameraSession,
        flyCameraToSphere as flyCameraToSphereImpl,
        flyHome as flyHomeImpl,
        flyHomeOnce as flyHomeOnceImpl,
        flySearchInterop as flySearchInteropImpl,
        flyToLayerExtent as flyToLayerExtentImpl,
        flyToSelection as flyToSelectionImpl,
        flyTopDown as flyTopDownImpl,
        lockNorthUp as lockNorthUpImpl,
        refocusAfterMorph as refocusAfterMorphImpl,
        selectionFlyKey as selectionFlyKeyImpl,
        type LayerSceneCameraCtx,
    } from "./layerSceneCamera";
    import {
        bboxFromEntity,
        collectKeysAtScreenPoint,
        collectKeysInScreenPolygon,
        collectKeysInScreenRect,
        type GeoBbox,
        type SelectableEntity,
    } from "./mapSelection";
    import { syncSelectionOverlay } from "./selectionOverlay";
    import { handleSceneKey } from "./layerSceneKeys";
    import { attachCameraSchemes, type CameraSchemeHandle } from "./cameraSchemes";
    import { attachFlyController } from "./flyController";
    import {
        keyboardPrefs,
        isFlyActive,
        setFlyActive,
    } from "$lib/shortcuts";
    import {
        dedupePickCandidates,
        pickCandidateLabel,
        attrsFromEntity,
        attrsFromRecord,
        overlayBufferAttrs,
        type PickCandidate,
    } from "./pickCandidates";
    import type { LayerData } from "./layerTypes";
    import {
        activeView,
        defaultOpacityForPackets,
        rowByEntityId,
        rowMatchesFilter,
        rowMatchesSeries,
        resolveSeriesKind,
        SERIES_ALL,
        seriesSteps,
        styleRenderer,
        type LayerView,
    } from "./layerViews";
    import {
        fkEdgeForColumn,
        loadFkLookups,
    } from "$lib/project/schemaFields";
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
        entityIdFromPacketId,
    } from "./czmlLoad";
    import {
        measureHint,
        minVertices,
        type MeasureMode,
        type MeasureRecord,
        type MeasureVertex,
    } from "$lib/measure";
    import {
        createImageryProvider,
        createTerrainProvider,
        creditsFor,
        imageryOption,
        persistImageryId,
        persistTerrainId,
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
        fetchDevelopTip,
        syncDiffOverlay,
        fromPeerAwareness,
        overlayIsLive,
        peerHoldingEdit,
        PEER_AWARENESS_DS_NAME,
        type DiffFeature,
        type GeoJsonGeometry,
        asGeometry,
    } from "$lib/geoDiff";
    import {
        editBuffer,
        attrFieldsForTable,
        geometryFromDraft,
        isMultipartMode,
        minVerticesForMode,
        type DrawGeomMode,
        type LonLatVertex,
        type SnapMode,
    } from "$lib/stores/editBuffer.svelte";
    import { presenceChrome } from "$lib/stores/presenceChrome.svelte";
    import PresenceCursors from "./PresenceCursors.svelte";
    import CommentPanel from "./CommentPanel.svelte";
    import CommentBalloons from "./CommentBalloons.svelte";
    import {
        connectMapPresence,
        displayNameFromUser,
        MAX_OVERLAY_ITEMS,
        type MapPresenceHandle,
        type PresencePeer,
        type PresenceSelection,
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
        pendingCommentId,
        reconcileComments,
        subscribeComments,
        type CommentAuthor,
        type CommentDraft,
        type CommentFilter,
        type CommentsRealtimeHandle,
        type MapComment,
    } from "$lib/map-comments";
    import {
        getOrCreateCommentDs,
        pickCommentId,
        syncCommentPins,
        setCommentPinEmphasis,
        clampLonLatToScene,
        commentClampNeedsRetry,
        clearCommentHeightCache,
        firstHeightFromGeometry,
        COMMENT_PENDING,
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
        bbox?: GeoBbox | null;
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
        /** Member-only tileset height-offset save (metres, null = clear). */
        onUpdateModelOffset?: (
            hash: string,
            offset: number | null,
        ) => Promise<boolean | void> | boolean | void;
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
        /**
         * Role-based member flag for the tileset height-offset editor.
         * Unlike canWrite this is not gated on viewingRef: the offset lives
         * in media metadata, not on a data ref.
         */
        canEditModelOffset?: boolean;
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
        /** Bump after a develop commit so CZML datasources reload. */
        dataEpoch?: number;
        /** Called after a successful develop commit (parent refetches layers). */
        onCommitted?: () => void;
        schemaTables?: {
            name: string;
            label?: string;
            kind?: string;
            count?: number;
            columns?: { name: string }[];
        }[];
        schemaEdges?: {
            source: string;
            target: string;
            source_column: string;
            target_column?: string;
            kind?: string;
        }[];
        mediaByEntity?: Record<
            string,
            { url: string; media_type: string }[]
        >;
        onOpenTable?: (name: string) => void;
        onAddTableRow?: (name: string) => void;
        /** Member viewing tip. `main` is read-only. */
        viewingRef?: ViewingRef;
        onSetViewingRef?: (ref: ViewingRef) => void;
        showRefToggle?: boolean;
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
        onUpdateModelOffset,
        fullscreen = false,
        onToggleFullscreen,
        onDimChange,
        active = true,
        canEditViews = false,
        onPersistViews,
        diffFeatures = [],
        joinedKeys = [],
        canWrite = false,
        canEditModelOffset = false,
        tables = {},
        searchQ = "",
        onClearSearchQ,
        placeBBox = null,
        placeLat = null,
        placeLng = null,
        placeRadius = null,
        focusLayer = "",
        dataEpoch = 0,
        onCommitted,
        schemaTables = [],
        schemaEdges = [],
        mediaByEntity = {},
        onOpenTable,
        onAddTableRow,
        viewingRef = "develop",
        onSetViewingRef,
        showRefToggle = false,
    }: Props = $props();

    let el = $state<HTMLDivElement>();
    let sceneRoot = $state<HTMLDivElement>();
    let showGraph = $state(false);
    let graphFullscreen = $state(false);
    let splitAt = $state(55);
    let splitting = $state(false);
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
    const measureSession = $state(createMeasureSession());
    let diffDataSource: any = null;

    let editEnabled = $state(false);
    let bufferOverlayVisible = $state(true);
    let commitMessage = $state("");
    let commitBusy = $state(false);
    let commitError = $state("");
    let commitDoneId = $state("");
    let commitDoneStatus = $state<"committed" | "conflicted" | "parked" | "">("");
    let drawMode = $state<DrawGeomMode>("Polygon");
    let drawUseHeight = $state(true);
    let snapMode = $state<SnapMode>("mesh");
    const drawSession = $state(createDrawSession());
    let createFormOpen = $state(false);
    let addingGeometry = $state(false);
    let createFormDocked = $state(true);
    let pendingGeometry = $state<GeoJsonGeometry | null>(null);
    const anyFormOpen = $derived(createFormOpen);
    const canFinish = $derived(
        measureEnabled &&
            measureMode !== "point" &&
            measureSession.draftCartesians.length >= minVertices(measureMode),
    );

    const editLayer = $derived(editBuffer.targetLayer);
    const canEdit = $derived(
        Boolean(
            canWrite &&
                viewingRef !== "main" &&
                active &&
                (editLayer || layerSelection.primaryKey),
        ),
    );
    const createFields = $derived.by(() => {
        const table = drawSession.bindTable ?? editLayer ?? "";
        void editBuffer.schemaAdds;
        const cols = [
            ...(tables[table] ?? []),
            ...editBuffer.addedColumnsFor(table),
        ];
        return attrFieldsForTable(cols);
    });
    const drawNeed = $derived(minVerticesForMode(drawMode));
    const drawCanAddPart = $derived(
        editEnabled && isMultipartMode(drawMode) && drawSession.vertexCount >= drawNeed,
    );
    const drawCanFinish = $derived(
        editEnabled &&
            (isMultipartMode(drawMode)
                ? drawSession.partCount >= 1 || drawSession.vertexCount >= drawNeed
                : drawSession.vertexCount >= drawNeed),
    );
    const bufferEntries = $derived(
        editBuffer.entries.map((e) => ({
            entityId: e.entityId,
            table: e.table,
            op: e.op,
        })),
    );
    const bufferGroups = $derived.by(() => {
        const order: string[] = [];
        const map = new Map<string, typeof bufferEntries>();
        for (const e of bufferEntries) {
            if (!map.has(e.table)) {
                order.push(e.table);
                map.set(e.table, []);
            }
            map.get(e.table)!.push(e);
        }
        return order.map((table) => ({
            table,
            rows: map.get(table)!,
        }));
    });
    const bufferSummary = $derived.by(() => {
        const parts = Object.entries(editBuffer.pendingByTable).map(
            ([t, n]) => `${t} ${n}`,
        );
        if (editBuffer.schemaAdds.length > 0) {
            parts.push(`+${editBuffer.schemaAdds.length} col`);
        }
        return parts.join(" · ");
    });
    const barLayer = $derived(
        drawSession.vertexSession?.table ?? drawSession.bindTable ?? editLayer ?? "",
    );
    const sessionSummary = $derived(
        Object.entries(editBuffer.pendingByTable)
            .filter(([t]) => t !== barLayer)
            .map(([t, n]) => `${t} ${n}`)
            .join(" · "),
    );

    let Cesium: any;
    let viewer: any;
    let clickHandler: any;
    let postRenderRemover: (() => void) | null = null;
    let renderRequestRemovers: Array<() => void> = [];
    let presencePeers = $state<PresencePeer[]>([]);
    let presenceRoster = $state<PresenceRosterCursor[]>([]);
    let presenceConnected = $state(false);
    let presenceHandle = $state<MapPresenceHandle | null>(null);
    let developCommit = $state("");
    const presenceDockPeers = $derived(
        presencePeers.map((p) => ({
            ...p,
            overlayStale: Boolean(
                ((p.buffer?.length ?? 0) > 0 ||
                    (p.selection?.length ?? 0) > 0 ||
                    Boolean(p.editing)) &&
                    !overlayIsLive(p, developCommit),
            ),
        })),
    );
    const awarenessSig = $derived(
        presencePeers
            .map((p) =>
                JSON.stringify({
                    u: p.userId,
                    b: p.based_on ?? "",
                    r: p.tracking_ref ?? "",
                    s: p.selection ?? [],
                    f: p.buffer ?? [],
                    e: p.editing ?? null,
                }),
            )
            .join("\n") + `|${developCommit}`,
    );
    const presenceCursorNodes = new Map<string, HTMLElement>();
    let awarenessDataSource: any = null;
    let editLockHint = $state("");
    let editLockTimer: ReturnType<typeof setTimeout> | null = null;

    const presenceMember = $derived(
        Boolean(($page.data as { isMember?: boolean } | undefined)?.isMember),
    );
    const commentsOk = $derived(presenceMember && viewingRef !== "main");
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
    const commentEchoIds = new Set<string>();
    let hoveredCommentId = $state<string | null>(null);
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
    let schemeHandle: CameraSchemeHandle | null = null;

    function applyCurrentScheme() {
        if (!schemeHandle || !viewer) return;
        if (isFlyActive()) {
            schemeHandle.apply(keyboardPrefs.cameraScheme, dim, { suspend: true });
            return;
        }
        schemeHandle.apply(keyboardPrefs.cameraScheme, dim);
    }
    const tilesetPrims = new Map<string, any>();
    const coverageLayers = new Map<string, any[]>();
    const coverageCogDestroy = new Map<string, () => void>();
    const layerSources = new Map<string, any>();
    const clusteredSources = new WeakSet<object>();
    const entityMeta = new WeakMap<object, EntityMeta>();
    /** Reverse index for selection keys — avoid scanning every entity on click. */
    const entitiesByKey = new Map<string, any[]>();
    let selectedEntity: any = null;
    let layerLoadGen = 0;
    let modelLoadGen = 0;
    let coverageLoadGen = 0;
    let started = false;
    /** Frame the project/tileset extent once on boot. Reactive — gates loading overlay. */
    let hasFramed = $state(false);
    const cameraSession = createCameraSession();
    let lastFlownKey = "";
    let filterToView = $state(false);
    let styleLayerIdx = $state<number | null>(null);
    /** Tileset hash with the height-offset panel open (null = closed). */
    let styleModelHash = $state<string | null>(null);
    let focusedLayerName = $state("");
    let seriesStepByLayer = $state<Record<string, string>>({});
    let inViewEntityKeys = $state<string[]>([]);
    let inViewModelHashes = $state<string[]>([]);
    let inViewThrottle: ReturnType<typeof setTimeout> | null = null;
    let scratchSphere: any;
    let selectionDataSource: any = null;
    let appliedClassifyTiles: boolean | null = null;
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
    const pending = $derived(
        tilesets.filter((t) => t.ingest_status === "pending").length,
    );
    const failed = $derived(
        tilesets.find((t) => t.ingest_status === "failed"),
    );
    /**
     * Anything worth showing scene chrome for: geometry, coverages,
     * attribute-only tables, or tilesets still ingesting. Empty projects
     * get a dismissible hint — never a full-map block.
     */
    const hasSceneData = $derived(
        models.length > 0 ||
            layers.length > 0 ||
            coverageRows.length > 0 ||
            schemaTables.length > 0 ||
            pending > 0,
    );
    /** User-dismissed the empty-project hint (per mount). */
    let emptyHintDismissed = $state(false);
    const palette = $derived(mapLayerPalette(8));

    function isModelVisible(hash: string) {
        if (hash in modelVis) return modelVis[hash]!;
        return true;
    }

    function isCoverageVisible(hash: string) {
        if (hash in coverageVis) return coverageVis[hash]!;
        return true;
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

    function cameraCtx(): LayerSceneCameraCtx {
        return {
            Cesium,
            viewer,
            layers,
            models,
            tilesetPrims,
            layerSources,
            bumpRender,
            pushExtentSphere,
            findEntitiesByKey,
            session: cameraSession,
            searchQ,
            placeBBox,
            placeLat,
            placeLng,
            placeRadius,
            focusLayer,
            selectionKeys: () => [...layerSelection.selected, ...joinedKeys],
            loading,
            getLastFlownKey: () => lastFlownKey,
            setLastFlownKey: (key) => {
                lastFlownKey = key;
            },
            setHasFramed: (framed) => {
                hasFramed = framed;
            },
        };
    }

    async function flyCameraToSphere(sphere: any, duration = 1.0) {
        await flyCameraToSphereImpl(cameraCtx(), sphere, duration);
    }

    async function refocusAfterMorph(is3d: boolean) {
        await refocusAfterMorphImpl(cameraCtx(), is3d);
    }

    async function flyHome(duration = 1.0) {
        await flyHomeImpl(cameraCtx(), duration);
    }

    async function flyToLayerExtent(layerName: string) {
        await flyToLayerExtentImpl(cameraCtx(), layerName);
    }

    async function flySearchInterop(force = false) {
        await flySearchInteropImpl(cameraCtx(), force);
    }

    function flyTopDown() {
        flyTopDownImpl(cameraCtx());
    }

    function lockNorthUp() {
        lockNorthUpImpl(cameraCtx());
    }

    function selectionFlyKey(): string {
        return selectionFlyKeyImpl([...layerSelection.selected, ...joinedKeys]);
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
                out.push({ key, entity, bbox: meta.bbox });
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
        const indexed = entitiesByKey.get(key);
        if (!indexed || indexed.length === 0) return [];
        const visible = indexed.filter((e) => {
            try {
                return e.show !== false;
            } catch {
                return true;
            }
        });
        return visible.length > 0 ? visible : indexed;
    }

    function findEntityByKey(key: string): any | null {
        return findEntitiesByKey(key)[0] ?? null;
    }

    async function flyToSelection(force = true) {
        await flyToSelectionImpl(cameraCtx(), force);
    }

    /** Once after load: same flyHome() as the toolbar button. */
    function flyHomeOnce() {
        flyHomeOnceImpl(cameraCtx());
    }

    function destroyLayerSource(name: string) {
        const ds = layerSources.get(name);
        if (!ds) return;
        ds.__echidnaDisposed = true;
        unindexDataSource(ds);
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
        viewportMenu.release("ctx");
    }

    function clearSelection() {
        layerSelection.clearSelection();
        clearSelectionUi();
        lastFlownKey = "";
        clearCommentSelection();
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
        const previewed = ctxEntity;
        ctxOpen = false;
        ctxEntity = null;
        ctxKind = "entity";
        ctxTilesetHash = "";
        viewportMenu.release("ctx");
        if (wasOpen && wasEntity && previewed) {
            applyEntitySelectionStyle(previewed, null);
        }
        if (wasOpen && wasEntity && started) syncAllSelectionStyles();
    }

    $effect(() => {
        if (viewportMenu.id !== "ctx" && ctxOpen) {
            closeContextMenu();
        }
    });

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
        if (drawSession.vertexSession && drawSession.vertexSession.bufferOp !== "insert") {
            bufHide.add(
                toSelectionKey(drawSession.vertexSession.table, drawSession.vertexSession.entityId),
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
        const seriesField = view?.style.seriesField;
        if (!view?.filter?.field && !seriesField) return false;
        const tableRows = rows[layerName];
        const row = rowByEntityId(tableRows, entityId);
        if (!row) {
            const buf = editBuffer.entries.find(
                (e) => e.table === layerName && e.entityId === entityId,
            );
            if (buf?.op === "insert") return false;
        }
        if (view?.filter?.field && !rowMatchesFilter(row, view.filter)) {
            return true;
        }
        if (seriesField) {
            const kind = resolveSeriesKind(view.style, tableRows);
            const step = seriesStepByLayer[layerName] ?? SERIES_ALL;
            if (!rowMatchesSeries(row, seriesField, kind, step)) return true;
        }
        return false;
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
        viewportMenu.claim("ctx");
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
        viewportMenu.claim("ctx");
        ctxOpen = true;
    }

    function measureCtx(): LayerSceneMeasureCtx {
        return {
            Cesium,
            viewer,
            session: measureSession,
            measureMode,
            dim,
            bumpRender,
            pickMeasureCartesian,
            cartesianToVertex,
            sampleLengthProfile: (vertices) =>
                sampleLengthProfileOnGlobe(Cesium, viewer, vertices, {
                    snap: snapMode,
                    isGlobePick,
                    overlay: measureSession.dataSource,
                }),
            sampleAreaSurface: (vertices) =>
                sampleAreaSurfaceOnGlobe(Cesium, viewer, vertices, {
                    snap: snapMode,
                    isGlobePick,
                    overlay: measureSession.dataSource,
                }),
            sampleVolume: (vertices) =>
                sampleVolumeOnGlobe(Cesium, viewer, vertices, {
                    snap: snapMode,
                    isGlobePick,
                    overlay: measureSession.dataSource,
                }),
            getRecords: () => measureRecords,
            setRecords: (next) => {
                measureRecords = next;
            },
            setStatus: (msg) => {
                measureStatus = msg;
            },
        };
    }

    function drawCtx(): LayerSceneDrawCtx {
        return {
            Cesium,
            viewer,
            session: drawSession,
            dim,
            drawMode,
            drawUseHeight,
            editEnabled,
            editLayer: editLayer ?? "",
            anyFormOpen,
            createFormOpen,
            addingGeometry,
            drawNeed,
            drawCanFinish,
            bufferOverlayVisible,
            selectionTool: selectionToolLocal,
            canWrite,
            bumpRender,
            pickSnapCartesian,
            cartesianToVertex,
            findEntityByKey,
            geometryFromCesiumEntity,
            applyHiddenVisibility,
            blockPeerEdit,
            closePickPager,
            closeContextMenu,
            setDrawMode: (mode) => {
                drawMode = mode;
            },
            setDrawUseHeight: (on) => {
                drawUseHeight = on;
            },
            setCreateFormOpen: (open) => {
                createFormOpen = open;
                if (open) {
                    createFormDocked = readInfoboxDocked();
                    if (!createFormDocked) positionCreateFormFromDraft();
                }
            },
            setAddingGeometry: (on) => {
                addingGeometry = on;
            },
            onSelectForEdit: (table, entityId) => {
                openInfobox(table, entityId);
            },
            onCreatedFeature: (table, entityId) => {
                addingGeometry = false;
                openInfobox(table, entityId);
            },
            getPendingGeometry: () => pendingGeometry,
            setPendingGeometry: (geom) => {
                pendingGeometry = geom;
            },
            setBoxOverlay: (rect) => {
                if (!rect) {
                    dragRectVisible = false;
                    return;
                }
                dragRectVisible = true;
                dragRectLeft = rect.left;
                dragRectTop = rect.top;
                dragRectWidth = rect.width;
                dragRectHeight = rect.height;
            },
            getLassoPoints: () => lassoPoints,
            setLassoPoints: (pts) => {
                lassoPoints = pts;
            },
            setLassoVisible: (on) => {
                lassoVisible = on;
            },
            projectSlug,
            accessToken,
            getSessionBaseCommit: () => editBuffer.baseCommit,
            setSessionBaseCommit: (id) => {
                editBuffer.setBaseCommit(id);
            },
            getCommitMessage: () => commitMessage,
            setCommitMessage: (msg) => {
                commitMessage = msg;
            },
            getCommitBusy: () => commitBusy,
            setCommitBusy: (busy) => {
                commitBusy = busy;
            },
            setCommitError: (msg) => {
                commitError = msg;
            },
            setCommitDoneId: (id) => {
                commitDoneId = id;
            },
            setCommitDoneStatus: (status) => {
                commitDoneStatus = status;
            },
            setDevelopCommit: (id) => {
                developCommit = id;
            },
            onCommitted,
            restoreCamera: applyCurrentScheme,
        };
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
        // Same snap as draw: mesh (tileset) → terrain → ellipsoid.
        return pickSnapCartesian(position);
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

    function isGlobePick(obj: any): boolean {
        if (!obj || !viewer) return false;
        const prim = obj.primitive ?? obj;
        return prim === viewer.scene.globe;
    }

    /** Tileset / glTF along the camera ray, ignoring globe depth. */
    function pickMeshCartesian(position: any): any | null {
        if (!viewer || !Cesium) return null;
        const scene = viewer.scene;
        if (scene.mode !== Cesium.SceneMode.SCENE3D) return null;
        try {
            const ray = viewer.camera.getPickRay(position);
            if (!ray) return null;
            const exclude = [scene.globe];
            const hits = scene.drillPickFromRay
                ? scene.drillPickFromRay(ray, 8, exclude)
                : scene.pickFromRay
                  ? [scene.pickFromRay(ray, exclude)].filter(Boolean)
                  : [];
            for (const hit of hits ?? []) {
                if (!hit || hit.exclude) continue;
                if (!Cesium.defined(hit.position)) continue;
                if (isGlobePick(hit.object)) continue;
                return hit.position;
            }
        } catch {
            /* 2D / no depth texture */
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

    function clearDraftMeasure() {
        clearDraftMeasureImpl(measureCtx());
    }

    async function removeMeasurement(id: string) {
        await removeMeasurementImpl(measureCtx(), id);
    }

    function setVolumeKind(id: string, kind: "cut" | "fill") {
        setVolumeKindImpl(measureCtx(), id, kind);
    }

    function popLastMeasureVertex(repaint = true) {
        popLastMeasureVertexImpl(measureCtx(), repaint);
    }

    async function clearMeasurements() {
        await clearMeasurementsImpl(measureCtx());
    }

    function finishDraft3d(): boolean {
        return finishDraft3dImpl(measureCtx());
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
        teardownMeasureHandlerImpl(measureCtx());
    }

    function setupMeasureHandler() {
        setupMeasureHandlerImpl(measureCtx);
    }

    function setupDrawHandler() {
        setupDrawHandlerImpl(drawCtx);
    }

    function teardownDrawHandler() {
        teardownDrawHandlerImpl(drawCtx());
    }

    function clearDraftDraw() {
        clearDraftDrawImpl(drawCtx());
    }

    function paintDraftDraw() {
        paintDraftDrawImpl(drawCtx());
    }

    function setDrawUseHeight(on: boolean) {
        setDrawUseHeightImpl(drawCtx(), on);
    }

    function setDrawMode(next: DrawGeomMode) {
        setDrawModeImpl(drawCtx(), next);
    }

    function confirmCreate(attrs: Record<string, string>) {
        confirmCreateImpl(drawCtx(), attrs);
    }

    function cancelCreate() {
        cancelCreateImpl(drawCtx());
    }

    function openInfobox(table: string, entityId: string) {
        if (!canWrite || viewingRef === "main" || !table || !entityId) return;
        if (blockPeerEdit(table, entityId)) return;
        createFormOpen = false;
        pendingGeometry = null;
        editBuffer.setTargetLayer(table);
        closeContextMenu();
        layerSelection.selectSingle(table, entityId);
        const entity = findEntityByKey(toSelectionKey(table, entityId));
        if (entity) {
            selectEntity(entity, table, entityId);
            return;
        }
        const row = rowByEntityId(rows[table], entityId);
        const buf = editBuffer.entryFor(table, entityId);
        const attributes = overlayBufferAttrs(
            attrsFromRecord(row),
            buf?.attributes,
        );
        pickCandidates = [
            {
                key: toSelectionKey(table, entityId),
                layerName: table,
                entityId,
                label: pickCandidateLabel(entityId, attributes),
                attributes,
                bufferOp:
                    buf?.op === "insert" ||
                    buf?.op === "update" ||
                    buf?.op === "delete"
                        ? buf.op
                        : undefined,
            },
        ];
        pickIndex = 0;
        pickOpen = true;
        pickAnchorCartesian = null;
    }

    function deleteBufferedFeature(table: string, entityId: string) {
        deleteBufferedFeatureImpl(drawCtx(), table, entityId);
    }

    function deleteSelectedFeatures() {
        deleteSelectedFeaturesImpl(drawCtx(), {
            ctxOpen,
            ctxKind,
            ctxLayerName,
            ctxEntityId,
        });
    }

    function addDrawPart() {
        addDrawPartImpl(drawCtx());
    }

    function popLastDrawVertex(repaint = true) {
        popLastDrawVertexImpl(drawCtx(), repaint);
    }

    function restoreLastDrawPart() {
        return restoreLastDrawPartImpl(drawCtx());
    }

    function undoLastBuffer() {
        const ok = undoLastBufferImpl();
        if (ok) bumpRender();
        return ok;
    }

    async function commitEditBuffer() {
        await commitEditBufferImpl(drawCtx());
    }

    function beginVertexEdit(table: string, entityId: string) {
        return beginVertexEditImpl(drawCtx(), table, entityId);
    }

    function cancelVertexEdit() {
        cancelVertexEditImpl(drawCtx());
    }

    function settleVertexSessionOnExit() {
        settleVertexSessionOnExitImpl(drawCtx());
    }

    function clearVertexSelection() {
        clearVertexSelectionImpl(drawCtx());
    }

    function deleteSelectedVertices() {
        return deleteSelectedVerticesImpl(drawCtx());
    }

    async function detachDrawDataSource() {
        await detachDrawDataSourceImpl(drawCtx());
    }

    function finishDrawDraft() {
        return finishDrawDraftImpl(drawCtx());
    }

    function onEnterInEdit() {
        onEnterInEditImpl(drawCtx());
    }

    function cancelVertexMarquee() {
        return cancelVertexMarqueeImpl(drawCtx());
    }

    function undoDrawOrMeasure() {
        if (createFormOpen) {
            dismissCreateFormKeepDraftImpl(drawCtx());
            return;
        }
        if (drawSession.vertexSession) {
            if (undoVertexStepImpl(drawCtx())) return;
            cancelVertexEdit();
            return;
        }
        if (editEnabled) {
            if (drawSession.vertices.length > 0) {
                popLastDrawVertex();
                return;
            }
            if (restoreLastDrawPart()) return;
            undoLastBuffer();
            return;
        }
        if (measureEnabled) {
            if (measureSession.draftCartesians.length > 0) {
                popLastMeasureVertex();
                return;
            }
            if (measureRecords.length > 0) {
                void removeMeasurement(measureRecords[measureRecords.length - 1]!.id);
                return;
            }
        }
        undoLastBuffer();
    }

    function presenceSelectionPayload(): PresenceSelection[] {
        const out: PresenceSelection[] = [];
        for (const key of layerSelection.keys().slice(0, MAX_OVERLAY_ITEMS)) {
            const { layer, id } = parseSelectionKey(key);
            if (!layer || !id) continue;
            out.push({ table: layer, entityId: id });
        }
        return out;
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

    function geometryFromCesiumEntity(
        entity: any,
        withHeight = drawUseHeight,
    ): GeoJsonGeometry | null {
        if (!entity || !Cesium || !viewer) return null;
        const time = viewer.clock.currentTime;
        try {
            if (entity.polygon?.hierarchy) {
                const h = entity.polygon.hierarchy.getValue(time);
                const raw = h?.positions ?? h;
                const pts =
                    raw && typeof raw.length === "number"
                        ? Array.from(raw)
                        : [];
                if (pts.length < 3) return null;
                return geometryFromDraft(
                    "Polygon",
                    cartesiansToVertices(pts),
                    [],
                    withHeight,
                );
            }
            if (entity.polyline?.positions) {
                const raw = entity.polyline.positions.getValue(time);
                const pts =
                    raw && typeof raw.length === "number"
                        ? Array.from(raw)
                        : [];
                if (pts.length < 2) return null;
                return geometryFromDraft(
                    "LineString",
                    cartesiansToVertices(pts),
                    [],
                    withHeight,
                );
            }
            if (entity.position) {
                const pos = entity.position.getValue(time);
                if (!pos) return null;
                return geometryFromDraft(
                    "Point",
                    [cartesianToVertex(pos)],
                    [],
                    withHeight,
                );
            }
        } catch {
            return null;
        }
        return null;
    }

    function awarenessGeometry(table: string, entityId: string): GeoJsonGeometry | null {
        const entity = findEntityByKey(toSelectionKey(table, entityId));
        const geom = geometryFromCesiumEntity(entity, false);
        if (geom) return geom;
        if (!entity || !Cesium) return null;
        const sphere = entityBoundingSphere(entity);
        if (!isUsableExtentSphere(sphere)) return null;
        try {
            const c = Cesium.Cartographic.fromCartesian(sphere.center);
            return {
                type: "Point",
                coordinates: [
                    Cesium.Math.toDegrees(c.longitude),
                    Cesium.Math.toDegrees(c.latitude),
                ],
            };
        } catch {
            return null;
        }
    }

    function showEditLock(peer: PresencePeer) {
        editLockHint = `${peer.displayName} is editing this feature`;
        if (editLockTimer) clearTimeout(editLockTimer);
        editLockTimer = setTimeout(() => {
            editLockHint = "";
            editLockTimer = null;
        }, 4000);
    }

    function blockPeerEdit(table: string, entityId: string): boolean {
        const locker = peerHoldingEdit(
            presencePeers,
            table,
            entityId,
            developCommit,
        );
        if (!locker) return false;
        showEditLock(locker);
        return true;
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

    function selectionEditTarget(): { table: string; entityId: string } | null {
        if (layerSelection.size === 0) return null;
        const key = layerSelection.primaryKey;
        if (!key) return null;
        const { layer, id } = parseSelectionKey(key);
        if (!id) return null;
        const table = layer || editLayer || layerFromSelection();
        if (!table) return null;
        return { table, entityId: id };
    }

    const toolMode = $derived<SceneToolMode>(
        editEnabled
            ? "draw"
            : measureEnabled
              ? "measure"
              : commentsEnabled
                ? "comments"
                : "select",
    );

    function setToolMode(next: SceneToolMode) {
        if (next === "draw") {
            if (editEnabled) return;
            if (!canEdit) return;
            measureEnabled = false;
            commentsEnabled = false;
            enterEditMode();
            return;
        }
        if (editEnabled) exitEditMode();
        if (next === "measure") {
            commentsEnabled = false;
            measureEnabled = true;
            return;
        }
        if (next === "comments") {
            if (!commentsOk) return;
            measureEnabled = false;
            commentsEnabled = true;
            return;
        }
        measureEnabled = false;
        commentsEnabled = false;
    }

    function positionCreateFormFromDraft() {
        if (!viewer || !Cesium) return;
        const last = drawSession.cartesians.at(-1);
        if (!last) return;
        pickAnchorCartesian = Cesium.Cartesian3.clone(last);
        updatePickPanelFromAnchor();
    }

    function startAddGeometry(geom?: DrawGeomMode) {
        if (!canWrite || viewingRef === "main" || !active) return;
        if (geom) drawMode = geom;
        if (createFormOpen) cancelCreate();
        if (!editEnabled) enterEditMode({ skipSelectionLock: true });
        if (!editEnabled) return;
        if (drawSession.vertexSession) cancelVertexEdit();
        clearDraftDraw();
        closePickPager({ suppressClick: true });
        addingGeometry = true;
    }

    function startDrawAs(geom: DrawGeomMode) {
        if (!canEdit && !editEnabled) return;
        startAddGeometry(geom);
    }

    $effect(() => {
        if (viewingRef !== "main") return;
        if (editEnabled) exitEditMode();
        commentsEnabled = false;
    });

    function enterEditMode(opts?: { skipSelectionLock?: boolean }) {
        if (!canWrite || viewingRef === "main" || !active) return;
        const target = opts?.skipSelectionLock ? null : selectionEditTarget();
        if (target && blockPeerEdit(target.table, target.entityId)) return;
        const layer = target?.table ?? editLayer ?? layerFromSelection();
        if (!layer) return;
        if (editBuffer.targetLayer !== layer) {
            editBuffer.setTargetLayer(layer);
        }
        closeContextMenu();
        addingGeometry = false;
        editEnabled = true;
        measureEnabled = false;
        commentsEnabled = false;
        commentAdding = false;
        pendingComment = null;
        clearCommentSketch();
        queueMicrotask(() => {
            if (opts?.skipSelectionLock) return;
            if (!editEnabled || addingGeometry || drawSession.vertexSession) return;
            const next = selectionEditTarget();
            if (!next) return;
            if (editBuffer.targetLayer !== next.table) {
                editBuffer.setTargetLayer(next.table);
            }
            beginVertexEdit(next.table, next.entityId);
            openInfobox(next.table, next.entityId);
        });
    }

    function exitEditMode() {
        editEnabled = false;
        addingGeometry = false;
        createFormOpen = false;
        pendingGeometry = null;
        settleVertexSessionOnExit();
        clearDraftDraw();
    }

    /** Keys / model hashes whose geometry intersects the current camera frustum. */
    function computeInView(): void {
        const next = computeInViewKeys({
            Cesium,
            viewer,
            entityDataSources,
            entityMeta,
            entityBoundingSphere,
            tilesetPrims,
            prev: {
                entityKeys: inViewEntityKeys,
                modelHashes: inViewModelHashes,
            },
        });
        if (!next) return;
        inViewEntityKeys = next.entityKeys;
        inViewModelHashes = next.modelHashes;
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
        const buf = editBuffer.entryFor(layerName, entityId);
        const fromRow = attrsFromRecord(row);
        const fromEntity = attrsFromEntity(entity?.properties, time);
        const attributes = overlayBufferAttrs(
            Object.keys(fromRow).length > 0 ? fromRow : fromEntity,
            buf?.attributes,
        );
        return {
            key: toSelectionKey(layerName, entityId),
            layerName,
            entityId,
            label: pickCandidateLabel(entityId, attributes),
            attributes,
            bufferOp:
                buf?.op === "insert" ||
                buf?.op === "update" ||
                buf?.op === "delete"
                    ? buf.op
                    : undefined,
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
        focusSeriesLayer(c.layerName);
        lastFlownKey = selectionFlyKey();
        selectedEntity = findEntityByKey(c.key);
        // Do not retarget pickAnchorCartesian — panel stays pinned to the click in 3D.
    }

    function clickGeoPoint(position: { x: number; y: number } | unknown): { longitude: number; latitude: number } | null {
        if (!viewer || !Cesium || !position || typeof position !== "object") return null;
        const pos = position as { x: number; y: number };
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;
        const world = pickMeasureCartesian(pos);
        if (!world) return null;
        try {
            const c = Cesium.Cartographic.fromCartesian(world);
            if (!c) return null;
            return { longitude: c.longitude, latitude: c.latitude };
        } catch {
            return null;
        }
    }

    function candidateFromEntity(entity: any): PickCandidate | null {
        const meta = entityMeta.get(entity);
        if (!meta) return null;
        try {
            if (entity.show === false) return null;
        } catch {
            /* ignore */
        }
        if (layerSelection.isHidden(meta.layerName, meta.entityId)) return null;
        if (isViewFiltered(meta.layerName, meta.entityId)) return null;
        return makePickCandidate(entity, meta.layerName, meta.entityId);
    }

    function collectTopCandidate(position: unknown): PickCandidate | null {
        if (!viewer || !Cesium) return null;
        try {
            const entity = resolvePickedEntity(viewer.scene.pick(position));
            return entity ? candidateFromEntity(entity) : null;
        } catch {
            return null;
        }
    }

    function collectDrillCandidates(position: unknown): PickCandidate[] {
        if (!viewer || !Cesium) return [];
        const top = collectTopCandidate(position);
        const screen = position as { x: number; y: number };
        if (
            !screen ||
            typeof screen.x !== "number" ||
            typeof screen.y !== "number"
        ) {
            return top ? [top] : [];
        }
        const geo = clickGeoPoint(screen);
        const keys = collectKeysAtScreenPoint(
            Cesium,
            viewer,
            allSelectableEntities(),
            screen,
            geo,
        );
        const extra: PickCandidate[] = [];
        for (const key of keys) {
            if (top && key === top.key) continue;
            const entity = findEntityByKey(key);
            if (!entity) continue;
            const c = candidateFromEntity(entity);
            if (c) extra.push(c);
        }
        return dedupePickCandidates(top ? [top, ...extra] : extra);
    }

    function applyEntitySelectionStyle(
        entity: any,
        kind: "primary" | "secondary" | null,
    ) {
        paintEntitySelection(Cesium, entity, entityMeta.get(entity), kind);
    }

    function raiseTransientOverlays() {
        try {
            if (selectionDataSource) {
                viewer?.dataSources?.raiseToTop?.(selectionDataSource);
            }
            if (diffDataSource) {
                viewer?.dataSources?.raiseToTop?.(diffDataSource);
            }
            if (awarenessDataSource) {
                viewer?.dataSources?.raiseToTop?.(awarenessDataSource);
            }
            if (drawSession.handleDataSource) {
                viewer?.dataSources?.raiseToTop?.(drawSession.handleDataSource);
            }
        } catch {
            /* ignore */
        }
    }

    function syncAllSelectionStyles() {
        const primary = layerSelection.primaryKey;
        const items: Array<{ entity: any; kind: "primary" | "secondary" }> = [];
        const seen = new Set<string>();
        for (const key of layerSelection.selected) {
            const kind = key === primary ? "primary" : "secondary";
            for (const entity of findEntitiesByKey(key)) {
                items.push({ entity, kind });
            }
            seen.add(key);
        }
        for (const key of joinedKeys) {
            if (seen.has(key)) continue;
            for (const entity of findEntitiesByKey(key)) {
                items.push({ entity, kind: "secondary" });
            }
        }

        if (viewer && Cesium) {
            void syncSelectionOverlay(Cesium, viewer, items).then((ds) => {
                selectionDataSource = ds;
                raiseTransientOverlays();
                bumpRender();
            });
        } else {
            bumpRender();
        }

        if (layerSelection.size === 0) {
            pickDismissedKey = "";
            hideEntityPopup();
            return;
        }

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

    function unindexEntity(entity: any) {
        const meta = entityMeta.get(entity);
        if (!meta) return;
        const key = toSelectionKey(meta.layerName, meta.entityId);
        const list = entitiesByKey.get(key);
        if (!list) return;
        const next = list.filter((e) => e !== entity);
        if (next.length > 0) entitiesByKey.set(key, next);
        else entitiesByKey.delete(key);
    }

    function unindexDataSource(ds: any) {
        if (!ds?.entities) return;
        try {
            for (const entity of ds.entities.values) unindexEntity(entity);
        } catch {
            /* ignore */
        }
    }

    function indexEntity(entity: any, key: string) {
        const list = entitiesByKey.get(key);
        if (!list) {
            entitiesByKey.set(key, [entity]);
            return;
        }
        if (!list.includes(entity)) list.push(entity);
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
        unindexEntity(entity);
        const key = toSelectionKey(layerName, entityId);
        const time = Cesium?.JulianDate?.now?.() ?? undefined;
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
            bbox: Cesium ? bboxFromEntity(Cesium, entity, time) : null,
            ...captureBasePosition(entity),
        });
        entity.name = key;
        indexEntity(entity, key);
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
        applyCurrentScheme();

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
        void syncPolygonGroundMode();

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
        const created = await createLayerViewer({
            container: el,
            creditSink,
            ionToken: publicEnv.PUBLIC_CESIUM_ION_ACCESS_TOKEN ?? "",
            bumpRender,
        });
        Cesium = created.Cesium;
        viewer = created.viewer;
        scratchSphere = created.scratchSphere;
        ionAvailable = created.ionAvailable;
        basemapLayer = created.basemapLayer;
        renderRequestRemovers.push(...created.renderRequestRemovers);
        schemeHandle?.dispose();
        schemeHandle = attachCameraSchemes({
            Cesium,
            viewer,
            pickWorld: (p) => pickSnapCartesian(p),
        });
        const { nextImagery, nextTerrain } = created;

        applyBasemapTheme();

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
            if (measureEnabled || addingGeometry) return;
            closeContextMenu();
            if (editEnabled && drawSession.vertexSession) {
                const vertexHits = collectDrillCandidates(click.position);
                if (vertexHits.length === 0) return;
            }
            const commentHit = pickCommentId(viewer, click.position);
            if (commentHit) {
                try {
                    viewer.selectedEntity = undefined;
                } catch {
                    /* ignore */
                }
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
            if (shift || ctrl || cmd) {
                const top = collectTopCandidate(click.position);
                if (!top) {
                    if (!shift) {
                        clearSelection();
                        closePickPager();
                    }
                    return;
                }
                clearCommentSelection();
                pickDismissedKey = "";
                if (shift) {
                    layerSelection.addSelection(top.layerName, top.entityId);
                    focusSeriesLayer(top.layerName);
                } else {
                    layerSelection.removeSelection(top.layerName, top.entityId);
                }
                lastFlownKey = selectionFlyKey();
                return;
            }
            const candidates = collectDrillCandidates(click.position);
            if (candidates.length === 0) {
                clearSelection();
                closePickPager();
                return;
            }
            clearCommentSelection();
            pickDismissedKey = "";
            const top = candidates[0]!;
            pickCandidates = candidates;
            pickIndex = 0;
            pickOpen = true;
            layerSelection.selectSingle(top.layerName, top.entityId);
            focusSeriesLayer(top.layerName);
            lastFlownKey = selectionFlyKey();
            selectedEntity = findEntityByKey(top.key);
            const pos = click.position as { x: number; y: number };
            setPickAnchorFromScreen(pos);
            updatePickPanelFromAnchor();
            if (editEnabled && !addingGeometry) {
                beginVertexEdit(top.layerName, top.entityId);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        clickHandler.setInputAction((click: { position: { x: number; y: number } }) => {
            if (measureEnabled || addingGeometry) return;
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
                    pending: pendingComment,
                    sketch: commentSketchVerts,
                    sketchMode: commentDrawMode,
                    pendingUserId: presenceUserId,
                    ...commentPinFills(),
                });
                setCommentPinEmphasis({
                    ds: commentDataSource,
                    comments,
                    filter: commentFilter,
                    hoveredId: hoveredCommentId,
                    selectedId: selectedCommentId,
                    ...commentPinFills(),
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
        void syncPolygonGroundMode();
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
        void syncPolygonGroundMode();
    }

    function toggleModel(hash: string) {
        const next = !isModelVisible(hash);
        modelVis = { ...modelVis, [hash]: next };
        const prim = tilesetPrims.get(hash);
        if (prim) {
            prim.show = next && dim === "3d";
            if (next) onSelectTileset?.(hash);
            bumpRender();
            void syncPolygonGroundMode();
            return;
        }
        if (next) {
            onSelectTileset?.(hash);
            void syncModels(false);
        }
        void syncPolygonGroundMode();
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
                ds.__epoch !== dataEpoch ||
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
                        { classifyTiles: classifyTilesActive() },
                    );
                    if (gen !== layerLoadGen) {
                        ds.__echidnaDisposed = true;
                        ds.entities.removeAll();
                        return;
                    }
                    ds.__packetCount = packetCount;
                    ds.__epoch = dataEpoch;
                    ds.show = layer.visible;
                    indexCzmlEntities(ds, layer.name);
                    ds.__echidnaOnTerrainHeights = () => {
                        if (ds.__echidnaDisposed) return;
                        indexCzmlEntities(ds, layer.name);
                        applyLayerViews();
                    };
                    if (ds.__echidnaTerrainHeightsReady) {
                        ds.__echidnaOnTerrainHeights();
                    }
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

        appliedClassifyTiles = classifyTilesActive();
        applyLayerViews();
        flyHomeOnce();
        bumpRender();
    }

    function classifyTilesActive(): boolean {
        if (dim !== "3d") return false;
        return models.some((m) => isModelVisible(m.hash));
    }

    async function syncPolygonGroundMode(force = false) {
        if (!Cesium) return;
        const next = classifyTilesActive();
        if (!force && appliedClassifyTiles === next) return;
        appliedClassifyTiles = next;
        if (layerSources.size === 0) return;
        const { applyPolygonClassification } = await import("./czmlEntities");
        for (const ds of layerSources.values()) {
            try {
                applyPolygonClassification(Cesium, ds, next);
            } catch {
                /* ignore */
            }
        }
        bumpRender();
    }

    function applyLayerViews() {
        const painted = paintLayerViews({
            Cesium,
            viewer,
            layers,
            rows,
            entityMeta,
            entityDataSources,
            layerSources,
            clusteredSources,
            paintSelection: applyEntitySelectionStyle,
        });
        if (!painted) return;
        applyHiddenVisibility();
        syncAllSelectionStyles();
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

    function focusSeriesLayer(name: string) {
        if (name) focusedLayerName = name;
    }

    function changeLayerViews(idx: number, next: LayerView[], activeId: string) {
        const layer = layers[idx];
        if (!layer) return;
        layer.views = next;
        layer.activeViewId = activeId;
        focusSeriesLayer(layer.name);
        applyLayerViews();
        if (canEditViews) onPersistViews?.(layer.name, next);
    }

    function openLayerStyle(idx: number) {
        styleLayerIdx = styleLayerIdx === idx ? null : idx;
        if (styleLayerIdx !== null) styleModelHash = null;
        const name = layers[idx]?.name;
        if (name) focusSeriesLayer(name);
    }

    function openModelStyle(hash: string) {
        styleModelHash = styleModelHash === hash ? null : hash;
        if (styleModelHash !== null) {
            styleLayerIdx = null;
            const prim = tilesetPrims.get(hash);
            if (prim) {
                const m = models.find((t) => t.hash === hash);
                applyTilesetHeightOffset(prim, m?.height_offset_m);
            }
        }
    }

    function closeModelStyle() {
        if (styleModelHash !== null) {
            const prim = tilesetPrims.get(styleModelHash);
            if (prim) {
                const m = models.find((t) => t.hash === styleModelHash);
                applyTilesetHeightOffset(prim, m?.height_offset_m);
            }
        }
        styleModelHash = null;
    }

    /** Live offset preview — shifts the primitive only, no persist. */
    function previewModelOffset(hash: string, offset: number | null) {
        const prim = tilesetPrims.get(hash);
        if (prim) applyTilesetHeightOffset(prim, offset);
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
        models.map((m) => `${m.hash}:${m.height_offset_m ?? ""}`).join("|") +
            "|" +
            accessToken,
    );
    let coverageKey = $derived(
        rasters.map((c) => c.hash).join("|") +
            "|" +
            accessToken +
            "|" +
            rasters.map((c) => (c.bbox_wgs84 ?? []).join(",")).join(";"),
    );
    let layerContentKey = $derived(
        `${dataEpoch}|` +
            layers.map((l) => `${l.name}:${l.packets?.length ?? 0}`).join("|"),
    );
    let viewApplyKey = $derived(
        layers
            .map(
                (l) =>
                    `${l.name}:${l.activeViewId ?? ""}:${l.opacity ?? defaultOpacityForPackets(l.packets)}:${JSON.stringify(l.views ?? [])}`,
            )
            .join("|"),
    );
    let seriesFocusName = $derived(
        focusedLayerName ||
            editBuffer.targetLayer ||
            layerSelection.primaryLayer,
    );

    /**
     * FK id → lookup label maps per `layer\0field`, shared by the SCENE
     * legend and the style panel's category list. Keys elsewhere stay raw —
     * only display labels are resolved. Fetched lazily per layer+field.
     */
    let fkLabelMaps = $state<Record<string, Record<string, string>>>({});
    const fkInflight = new Map<string, Promise<Record<string, string>>>();

    function ensureFkLabels(layerName: string, field: string) {
        if (!layerName || !field) return;
        const key = `${layerName}\0${field}`;
        const done = untrack(() => key in fkLabelMaps);
        if (done || fkInflight.has(key)) return;
        if (!fkEdgeForColumn(schemaEdges, layerName, field)?.target) return;
        const slug = projectSlug;
        if (!slug) return;
        const token = accessToken;
        const p = loadFkLookups({
            slug,
            table: layerName,
            columns: [field],
            accessToken: token,
        })
            .then((byCol) => {
                const map: Record<string, string> = {};
                for (const o of byCol[field] ?? []) {
                    map[o.id] = o.label;
                    const trimmed = o.id.trim();
                    if (!(trimmed in map)) map[trimmed] = o.label;
                }
                return map;
            })
            .catch(() => ({}) as Record<string, string>);
        fkInflight.set(key, p);
        void p.then((map) => {
            fkInflight.delete(key);
            fkLabelMaps = { ...fkLabelMaps, [key]: map };
        });
    }

    function fkLabelFor(
        layerName: string,
        field: string,
        value: string,
    ): string | undefined {
        if (!field) return undefined;
        const map = fkLabelMaps[`${layerName}\0${field}`];
        return map?.[value] ?? map?.[value.trim()] ?? undefined;
    }
    const legendFkFocus = $derived.by(() => {
        const layer = layers.find((l) => l.name === seriesFocusName);
        const view = layer
            ? activeView(layer.views, layer.activeViewId ?? "")
            : undefined;
        const field = view?.style.categoryField ?? "";
        if (
            !layer ||
            !view ||
            !field ||
            styleRenderer(view.style) !== "categorized"
        ) {
            return null;
        }
        const edge = fkEdgeForColumn(schemaEdges, layer.name, field);
        if (!edge?.target) return null;
        return { layer: layer.name, field };
    });
    $effect(() => {
        const focus = legendFkFocus;
        if (focus) ensureFkLabels(focus.layer, focus.field);
    });

    function resolveLegendLabel(
        layerName: string,
        field: string,
        value: string,
    ): string | undefined {
        return fkLabelFor(layerName, field, value);
    }
    let seriesControls = $derived(
        layers.flatMap((layer) => {
            if (layer.name !== seriesFocusName) return [];
            const view = activeView(layer.views, layer.activeViewId ?? "");
            const field = view?.style.seriesField;
            if (!view || !field) return [];
            const tableRows = rows[layer.name];
            const kind = resolveSeriesKind(view.style, tableRows);
            return [
                {
                    name: layer.name,
                    field,
                    steps: seriesSteps(tableRows, field, kind),
                },
            ];
        }),
    );
    let seriesApplyKey = $derived(
        seriesControls
            .map(
                (c) =>
                    `${c.name}:${seriesStepByLayer[c.name] ?? SERIES_ALL}`,
            )
            .join("|"),
    );

    function setSeriesStep(layerName: string, key: string) {
        seriesStepByLayer = { ...seriesStepByLayer, [layerName]: key };
    }

    $effect(() => {
        if (styleLayerIdx === null) return;
        if (!layers[styleLayerIdx]) styleLayerIdx = null;
    });

    $effect(() => {
        if (styleModelHash === null) return;
        if (!models.some((m) => m.hash === styleModelHash)) {
            styleModelHash = null;
        }
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
        const keep = new Set(
            layers
                .filter(
                    (l) =>
                        activeView(l.views, l.activeViewId ?? "")?.style
                            .seriesField,
                )
                .map((l) => l.name),
        );
        const extra = Object.keys(seriesStepByLayer).filter((k) => !keep.has(k));
        if (extra.length === 0) return;
        const next = { ...seriesStepByLayer };
        for (const k of extra) delete next[k];
        seriesStepByLayer = next;
    });

    $effect(() => {
        seriesApplyKey;
        if (!ready || !started) return;
        applyHiddenVisibility();
    });

    $effect(() => {
        diffFeatures;
        drawSession.vertexSession;
        bufferOverlayVisible;
        editBuffer.entries;
        if (!ready || !started || !viewer || !Cesium) return;
        const features = !bufferOverlayVisible
            ? []
            : diffFeatures.flatMap((f) => {
                  const vs = drawSession.vertexSession;
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
            drawSession.vertexSession?.oldGeometry &&
            !features.some((f) => {
                const vs = drawSession.vertexSession;
                return (
                    vs !== null &&
                    f.entityId === vs.entityId &&
                    f.table === vs.table &&
                    f.oldGeometry
                );
            })
        ) {
            const vs = drawSession.vertexSession;
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
        unindexDataSource(diffDataSource);
        void syncDiffOverlay(Cesium, viewer, features).then((ds) => {
            if (cancelled) return;
            diffDataSource = ds;
            indexOverlayEntities(ds);
            applyLayerViews();
            if (layerSelection.primaryKey) {
                selectedEntity = findEntityByKey(layerSelection.primaryKey);
            }
            raiseTransientOverlays();
            bumpRender();
        });
        return () => {
            cancelled = true;
        };
    });

    $effect(() => {
        if (!ready || !started || loading || cameraSession.homeFlyStarted) return;
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
        if (!ready || !started) return;
        syncAllSelectionStyles();
        if (!hasFramed) return;
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
        themePrefs.colorScheme;
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
            node: (id, kind) =>
                presenceCursorNodes.get(kind === "field" ? `field:${id}` : id),
        });
        void connectMapPresence({
            slug,
            userId: uid,
            onPeers: (peers) => {
                if (stopped) return;
                presencePeers = peers;
                layer?.sync(peers);
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
                    if (!active || !handle) return;
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
            presenceChrome.clear();
            layer?.destroy();
            try {
                destroyDiffOverlay(viewer, awarenessDataSource);
            } catch {
                /* ignore */
            }
            awarenessDataSource = null;
            void handle?.stop();
        };
    });

    $effect(() => {
        if (!active || !presenceMember || !presenceConnected) {
            presenceChrome.clear();
            return;
        }
        presenceChrome.publish({
            peers: presenceDockPeers,
        });
    });

    $effect(() => {
        const slug = projectSlug;
        const token = accessToken;
        dataEpoch;
        if (!slug || !presenceMember) {
            developCommit = "";
            return;
        }
        let cancelled = false;
        const pull = () => {
            void fetchDevelopTip(slug, token).then((id) => {
                if (!cancelled) developCommit = id;
            });
        };
        pull();
        const tick = setInterval(pull, 8_000);
        return () => {
            cancelled = true;
            clearInterval(tick);
        };
    });

    $effect(() => {
        const size = editBuffer.size;
        const tip = developCommit;
        if (size === 0) {
            editBuffer.setBaseCommit("");
            return;
        }
        if (!editBuffer.baseCommit && tip) {
            editBuffer.setBaseCommit(tip);
        }
    });

    $effect(() => {
        const h = presenceHandle;
        const connected = presenceConnected;
        const sel = selectionSig;
        const buf = editBuffer.entries;
        const base = developCommit;
        const vs = drawSession.vertexSession;
        if (!h || !connected) return;
        void sel;
        h.publishOverlay({
            tracking_ref: "develop",
            based_on: base,
            selection: presenceSelectionPayload(),
            buffer: buf,
            editing: vs
                ? { table: vs.table, entityId: vs.entityId }
                : null,
        });
    });

    $effect(() => {
        awarenessSig;
        if (!ready || !viewer || !Cesium) return;
        const features = fromPeerAwareness(
            presencePeers,
            developCommit,
            (table, id) => awarenessGeometry(table, id),
        );
        void syncDiffOverlay(
            Cesium,
            viewer,
            features,
            PEER_AWARENESS_DS_NAME,
        ).then((ds) => {
            awarenessDataSource = ds;
            try {
                if (ds) ds.show = true;
            } catch {
                /* ignore */
            }
            raiseTransientOverlays();
            bumpRender();
        });
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
            comments = reconcileComments(comments, list, commentEchoIds);
            commentsError = "";
            bumpRender();
        } catch (e) {
            if (gen !== commentsLoadGen) return;
            commentsError =
                e instanceof Error ? e.message : "Could not load comments";
        }
    }

    function localCommentAuthor(): CommentAuthor {
        const uid = presenceUserId;
        const prior = comments.find((c) => c.created_by === uid)?.author;
        if (prior) {
            return {
                id: uid,
                display_name: prior.display_name,
                has_avatar: prior.has_avatar,
            };
        }
        return {
            id: uid,
            display_name: displayNameFromUser($page.data?.user) || "You",
            has_avatar: false,
        };
    }

    function commentById(id: string | null | undefined): MapComment | undefined {
        if (!id) return undefined;
        return comments.find((c) => c.id === id);
    }

    async function postComment(body: string, parentId?: string): Promise<boolean> {
        const text = body.trim();
        if (!text) return false;

        const payload: {
            body: string;
            parent_id?: string;
            layer_name?: string;
            feature_id?: string;
            lon?: number;
            lat?: number;
            geometry?: GeoJsonGeometry;
        } = { body: text };

        let lon = 0;
        let lat = 0;
        let geometry: GeoJsonGeometry | null | undefined;
        let layerName: string | null | undefined;
        let featureId: string | null | undefined;
        const draft = pendingComment;

        if (parentId) {
            payload.parent_id = parentId;
            const parent =
                commentById(parentId) ?? commentById(commentRootId(parentId));
            const root = parent?.parent_id
                ? (commentById(parent.parent_id) ?? parent)
                : parent;
            if (root) {
                lon = root.lon;
                lat = root.lat;
                geometry = root.geometry;
                layerName = root.layer_name;
                featureId = root.feature_id;
            }
        } else if (draft) {
            payload.lon = draft.lon;
            payload.lat = draft.lat;
            lon = draft.lon;
            lat = draft.lat;
            if (draft.geometry) {
                payload.geometry = draft.geometry;
                geometry = draft.geometry;
            }
            if (draft.layerName && draft.featureId) {
                payload.layer_name = draft.layerName;
                payload.feature_id = draft.featureId;
                layerName = draft.layerName;
                featureId = draft.featureId;
            }
        } else {
            return false;
        }

        const tempId = pendingCommentId();
        const now = new Date().toISOString();
        const uid = presenceUserId;
        try {
            comments = [
                ...comments,
                {
                    id: tempId,
                    project_slug: projectSlug,
                    body: text,
                    status: "open",
                    parent_id: parentId ?? null,
                    layer_name: layerName ?? null,
                    feature_id: featureId ?? null,
                    lon,
                    lat,
                    geometry: geometry ?? null,
                    created_by: uid,
                    created_at: now,
                    updated_at: now,
                    author: localCommentAuthor(),
                },
            ];
            commentsError = "";
            if (!parentId) {
                pendingComment = null;
                commentAdding = false;
                selectedCommentId = tempId;
            }
            bumpRender();

            const created = await createComment(
                projectSlug,
                accessToken,
                payload,
            );
            commentEchoIds.add(created.id);
            comments = comments.map((c) => (c.id === tempId ? created : c));
            selectedCommentId = created.parent_id ?? created.id;
            commentsRealtime?.notify();
            void reloadComments();
            bumpRender();
            if (!parentId) void flyToComment(created.id);
            return true;
        } catch (e) {
            comments = comments.filter((c) => c.id !== tempId);
            if (!parentId) {
                pendingComment = draft;
                commentAdding = true;
                selectedCommentId = null;
            }
            commentsError =
                e instanceof Error ? e.message : "Could not post comment";
            bumpRender();
            return false;
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
            void flyToComment(existing.id);
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

    function commentPinFills() {
        const c = mapColors();
        return {
            openFill: c.marker,
            resolvedFill: c.muted,
            pendingFill: COMMENT_PENDING,
        };
    }

    async function flyToComment(id: string) {
        if (!viewer || !Cesium) return;
        const hit = comments.find((c) => c.id === id);
        if (!hit) return;
        const root = hit.parent_id
            ? (comments.find((c) => c.id === hit.parent_id) ?? hit)
            : hit;
        const exclude = commentDataSource?.entities?.values
            ? [...commentDataSource.entities.values]
            : [];
        const pos = clampLonLatToScene(
            Cesium,
            viewer,
            root.lon,
            root.lat,
            firstHeightFromGeometry(root.geometry),
            exclude,
        );
        if (!pos) return;
        const sphere = new Cesium.BoundingSphere(pos, 80);
        await flyCameraToSphere(sphere, 0.65);
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
        pendingComment;
        commentSketchCount;
        commentDrawMode;
        presenceUserId;
        themePrefs.accentHue;
        themePrefs.bgBase;
        themePrefs.colorScheme;
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
        // Selection/hover only scale the pin — do not resubscribe here or
        // syncCommentPins rebuilds every polyline/polygon (visible flicker).
        const hoveredId = untrack(() => hoveredCommentId);
        const selectedId = untrack(() => selectedCommentId);
        syncCommentPins({
            Cesium,
            viewer,
            ds: commentDataSource,
            comments,
            filter: commentFilter,
            pending: pendingComment,
            sketch: commentSketchVerts,
            sketchMode: commentDrawMode,
            pendingUserId: presenceUserId,
            ...commentPinFills(),
        });
        setCommentPinEmphasis({
            ds: commentDataSource,
            comments,
            filter: commentFilter,
            hoveredId,
            selectedId,
            ...commentPinFills(),
        });
        bumpRender();
    });

    $effect(() => {
        hoveredCommentId;
        selectedCommentId;
        if (!commentDataSource) return;
        setCommentPinEmphasis({
            ds: commentDataSource,
            comments,
            filter: commentFilter,
            hoveredId: hoveredCommentId,
            selectedId: selectedCommentId,
            ...commentPinFills(),
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
        schemeHandle?.dispose();
        schemeHandle = null;
        setFlyActive(false);
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
        presenceChrome.clear();
        clearSelectionUi();
        entitiesByKey.clear();
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
            if (selectionDataSource) {
                destroyDiffOverlay(viewer, selectionDataSource);
            }
        } catch {
            /* ignore */
        }
        selectionDataSource = null;
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
        handleSceneKey(ev, {
            anyFormOpen,
            canWrite,
            active,
            presenceMember: commentsOk,
            dim,
            editEnabled,
            measureEnabled,
            commentsEnabled,
            commentCanFinishSketch,
            vertexSession: Boolean(drawSession.vertexSession),
            drawVertexCount: drawSession.vertexCount,
            drawPartCount: drawSession.partCount,
            selectedVertexCount: drawSession.selectedVertexIndices.size,
            attrEdit: false,
            createFormOpen,
            ctxOpen,
            pickOpen,
            stylePanelOpen:
                styleLayerIdx !== null || styleModelHash !== null,
            isolating: layerSelection.isIsolating,
            commentSketchCount,
            pendingComment: Boolean(pendingComment),
            commentAdding,
            selectedCommentId: Boolean(selectedCommentId),
            editLayer: Boolean(editLayer),
            measureMode,
            onEnterInEdit,
            finishCommentSketch,
            finishDraft3d,
            undoDrawOrMeasure,
            popLastDrawVertex: () => {
                popLastDrawVertex();
                if (drawSession.vertexCount === 0) restoreLastDrawPart();
            },
            deleteSelectedVertices,
            deleteSelectedFeatures,
            cancelAttrEdit: () => {},
            cancelCreate,
            cancelVertexMarquee,
            clearVertexSelection,
            cancelVertexEdit,
            clearDraftDraw,
            paintDraftDraw,
            exitEditMode,
            clearDraftMeasure,
            clearCommentSketch,
            stopCommentAdd,
            clearCommentSelection,
            closePickPager,
            closeStylePanel: () => {
                styleLayerIdx = null;
                closeModelStyle();
            },
            exitIsolateUi,
            clearSelection,
            flyToSelection: () => {
                void flyToSelection(true);
            },
            flyHome: () => {
                void flyHome();
            },
            isolateSelected: () => layerSelection.isolateSelected(),
            applyHiddenVisibility,
            layerFromSelection,
            enterEditMode,
            startAddGeometry,
            addingGeometry,
            setAddingGeometry: (on) => {
                addingGeometry = on;
            },
            setDrawMode,
            setSelectionTool: (mode) => {
                selectionToolLocal = mode;
            },
            setMeasureEnabled: (on) => {
                measureEnabled = on;
            },
            setCommentsEnabled: (on) => {
                commentsEnabled = on;
            },
            setEditEnabled: (on) => {
                editEnabled = on;
            },
            setMeasureMode: (mode) => {
                measureMode = mode;
            },
            setMeasureStatus: (msg) => {
                measureStatus = msg;
            },
            clearPendingComment: () => {
                pendingComment = null;
                commentAdding = false;
            },
            graphOpen: showGraph,
            graphFullscreen,
            setGraphOpen: (on) => {
                showGraph = on;
            },
            setGraphFullscreen: (on) => {
                graphFullscreen = on;
            },
            flyActive: isFlyActive(),
            setFlyActive: (on) => {
                if (on && dim !== "3d") return;
                setFlyActive(on);
            },
        });
    }

    $effect(() => {
        layerSelection.setToolMode(selectionToolLocal);
    });

    $effect(() => {
        if (!ready || !viewer || !Cesium || measureEnabled || commentsEnabled) return;
        if (addingGeometry || (editEnabled && drawSession.vertexSession)) return;
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
            if (editEnabled && layerSelection.size === 1) {
                const next = selectionEditTarget();
                if (next) beginVertexEdit(next.table, next.entityId);
            }
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
        if (!ready) return;
        const scheme = keyboardPrefs.cameraScheme;
        const fly = isFlyActive();
        if (!schemeHandle || !viewer) return;
        if (fly) {
            schemeHandle.apply(scheme, dim, { suspend: true });
            return;
        }
        schemeHandle.apply(scheme, dim);
    });

    $effect(() => {
        if (dim !== "3d" && isFlyActive()) setFlyActive(false);
    });

    $effect(() => {
        if (
            (editEnabled || measureEnabled || commentsEnabled) &&
            isFlyActive()
        ) {
            setFlyActive(false);
        }
    });

    $effect(() => {
        if (!ready || !viewer || !Cesium) return;
        if (!isFlyActive() || dim !== "3d") return;
        const dispose = attachFlyController({
            Cesium,
            viewer,
            bumpRender,
            getSensitivity: () => keyboardPrefs.flySensitivity,
        });
        return () => dispose();
    });

    $effect(() => {
        if (!ready || !viewer) return;
        if (measureEnabled) {
            const mode = measureMode;
            const d = dim;
            // measureCtx reads the $state session; untrack so picks don't
            // re-run this effect and wipe the draft.
            untrack(() => {
                measureStatus = measureHint(mode, d === "2d" ? "2d" : "3d");
                clearDraftMeasure();
                setupMeasureHandler();
                viewer.canvas.style.cursor = "crosshair";
            });
            return;
        }
        editEnabled;
        commentAdding;
        untrack(() => {
            teardownMeasureHandler();
            clearDraftMeasure();
            measureStatus = "";
            if (!editEnabled && !commentAdding && viewer?.canvas) {
                viewer.canvas.style.cursor = "";
            }
        });
    });

    $effect(() => {
        if (!ready || !viewer) return;
        const vertexing = Boolean(drawSession.vertexSession);
        const drawLive = editEnabled && (addingGeometry || vertexing);
        if (drawLive) {
            untrack(() => setupDrawHandler());
            viewer.canvas.style.cursor = "crosshair";
            return;
        }
        untrack(() => {
            teardownDrawHandler();
            if (!editEnabled) clearDraftDraw();
            if (!measureEnabled && !commentAdding && viewer?.canvas) {
                viewer.canvas.style.cursor = "";
            }
        });
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
        if (dim === "2d" && measureMode === "volume") {
            measureMode = "area";
            return;
        }
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
            hoveredCommentId = null;
            clearCommentSketch();
            clearCommentSelection();
        }
    });

    $effect(() => {
        if (layerSelection.primaryKey) clearCommentSelection();
    });
</script>

<div
    bind:this={sceneRoot}
    class="relative flex h-full w-full min-h-0 flex-col overflow-hidden"
>
    {#if !graphFullscreen}
        <SceneMenuBar
            {toolMode}
            onSetToolMode={setToolMode}
            showDraw={canWrite && viewingRef !== "main"}
            showComments={commentsOk}
            canEnterDraw={canEdit}
            selectionTool={selectionToolLocal}
            onSetSelectionTool={(tool) => {
                selectionToolLocal = tool;
            }}
            {selectionCount}
            {isolating}
            onFlyHome={() => {
                void flyHome();
            }}
            onFlyToSelection={() => flyToSelection(true)}
            onFlyTopDown={flyTopDown}
            onLockNorth={lockNorthUp}
            onZoomIn={zoomIn3d}
            onZoomOut={zoomOut3d}
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
            {showGraph}
            onToggleGraph={() => {
                showGraph = !showGraph;
            }}
            flyEnabled={isFlyActive()}
            onToggleFly={() => {
                if (dim !== "3d") return;
                setFlyActive(!isFlyActive());
            }}
            {dim}
            onSetDim={onDimChange}
            {fullscreen}
            {onToggleFullscreen}
            {imageryId}
            {terrainId}
            {ionAvailable}
            {imageryBusy}
            {terrainBusy}
            {providerError}
            onSetImagery={(id) => void applyImagery(id)}
            onSetTerrain={(id) => void applyTerrain(id)}
            {showRefToggle}
            {viewingRef}
            {onSetViewingRef}
            canAdd={canWrite && viewingRef !== "main"}
            addTable={editLayer || focusLayer || ""}
            onAddGeom={startDrawAs}
            onAddAttrRow={onAddTableRow}
        />
    {/if}
    <div class="relative min-h-0 flex-1 overflow-hidden">
    <div
        class="absolute top-10 left-2 z-20 flex items-start gap-2 {graphFullscreen
            ? 'hidden'
            : ''}"
    >
        <MapToolsRail
            bind:enabled={measureEnabled}
            bind:mode={measureMode}
            bind:selectionTool={selectionToolLocal}
            bind:commentsEnabled
            bind:editEnabled
            showComments={commentsOk}
            showEdit={canWrite && viewingRef !== "main"}
            canEnterEdit={canEdit}
            onEnterEdit={enterEditMode}
            onExitEdit={exitEditMode}
            status={measureStatus}
            records={measureRecords}
            {canFinish}
            {dim}
            {selectionCount}
            {isolating}
            onFlyToSelection={() => flyToSelection(true)}
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
            onVolumeKind={setVolumeKind}
        />
        {#if commentsEnabled && commentsOk}
            <CommentPanel
                {comments}
                filter={commentFilter}
                selectedId={selectedCommentId}
                pending={pendingComment}
                adding={commentAdding}
                canWrite={canWrite}
                busy={commentsBusy}
                error={commentsError}
                drawMode={commentDrawMode}
                sketchCount={commentSketchCount}
                canFinish={commentCanFinishSketch}
                onFilter={(next) => (commentFilter = next)}
                onSelect={(id) => {
                    if (id) {
                        layerSelection.clearSelection();
                        clearSelectionUi();
                        pendingComment = null;
                        commentAdding = false;
                        clearCommentSketch();
                        selectedCommentId = id;
                        void flyToComment(id);
                    } else {
                        clearCommentSelection();
                    }
                }}
                onHover={(id) => (hoveredCommentId = id)}
                onAdd={startCommentAdd}
                onCancelAdd={stopCommentAdd}
                onCancelPending={stopCommentAdd}
                onPost={(body) => postComment(body)}
                onDrawMode={setCommentDrawMode}
                onFinish={finishCommentSketch}
                onClose={() => {
                    commentsEnabled = false;
                    stopCommentAdd();
                }}
            />
        {/if}
    </div>

    {#if (canWrite && editEnabled && barLayer) || seriesControls.length > 0}
        <div
            class="pointer-events-auto absolute bottom-2 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1"
        >
            {#each seriesControls as series (series.name)}
                <LayerSeriesBar
                    layerName={series.name}
                    field={series.field}
                    steps={series.steps}
                    stepKey={seriesStepByLayer[series.name] ?? SERIES_ALL}
                    onStep={(key) => setSeriesStep(series.name, key)}
                />
            {/each}
            {#if canWrite &&
                editEnabled &&
                barLayer &&
                (addingGeometry || Boolean(drawSession.vertexSession))}
                <EditModeBar
                    layer={barLayer}
                    mode={drawMode}
                    canFinish={drawCanFinish &&
                        !anyFormOpen &&
                        (addingGeometry || Boolean(drawSession.vertexSession))}
                    canAddPart={drawCanAddPart && !anyFormOpen && !drawSession.vertexSession}
                    canDelete={!anyFormOpen}
                    useHeight={drawUseHeight}
                    snap={snapMode}
                    vertexEditing={Boolean(drawSession.vertexSession)}
                    adding={addingGeometry}
                    sessionSummary={sessionSummary}
                    onMode={(m) => {
                        if (addingGeometry) setDrawMode(m);
                        else startAddGeometry(m);
                    }}
                    onUseHeight={setDrawUseHeight}
                    onSnap={(m) => (snapMode = m)}
                    onFinish={finishDrawDraft}
                    onAddPart={addDrawPart}
                    onDelete={deleteSelectedFeatures}
                />
            {/if}
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
        onComment={commentsOk && canWrite && ctxKind === "entity"
            ? () => startFeatureComment(ctxLayerName, ctxEntityId)
            : undefined}
        onEditAttributes={canWrite &&
        viewingRef !== "main" &&
        ctxKind === "entity"
            ? () => {
                if (!editEnabled) enterEditMode();
                openInfobox(ctxLayerName, ctxEntityId);
            }
            : undefined}
        onDelete={canWrite && viewingRef !== "main" && ctxKind === "entity"
            ? () => deleteBufferedFeature(ctxLayerName, ctxEntityId)
            : undefined}
        onClose={closeContextMenu}
    />

    <div
        class="absolute bottom-3 left-3 z-20 flex flex-col items-start gap-1"
    >
        {#if hiddenCount > 0 && !isolating}
            <button
                type="button"
                class="surface pointer-events-auto rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm hover:text-foreground"
                onclick={showAllHiddenEntities}
            >
                {hiddenCount} hidden · Show all
            </button>
        {/if}
        {#if ready && Cesium && viewer && dim === "3d"}
            <EnuCornerWidget {Cesium} {viewer} show={true} />
        {/if}
        <CesiumAttribution
            credits={creditsFor(imageryId, terrainId)}
            ion={hasIonTerrain}
        />
    </div>

    {#if !hasFramed && !error}
        <CesiumLoading />
    {/if}

    {#if hasFramed && ready && !loading && hasSceneData}
        <div
            class="pointer-events-none absolute top-10 bottom-2 z-10 flex items-start gap-2 {graphFullscreen
                ? 'hidden'
                : ''}"
            style:right={showGraph
                ? `calc(${100 - splitAt}% + 0.5rem)`
                : "0.5rem"}
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
                        fkLabelMaps={fkLabelMaps}
                        ensureFkLabels={ensureFkLabels}
                    />
                    </div>
                {/key}
            {/if}
            {#if styleModelHash !== null && models.some((m) => m.hash === styleModelHash)}
                {@const styleModel = models.find((m) => m.hash === styleModelHash)!}
                {#key styleModel.hash}
                    <div class="pointer-events-auto">
                    <TilesetOffsetPanel
                        label={styleModel.label || styleModel.hash.slice(0, 12)}
                        savedOffset={styleModel.height_offset_m ?? null}
                        canEdit={canEditModelOffset}
                        onClose={closeModelStyle}
                        onPreview={(v) => previewModelOffset(styleModel.hash, v)}
                        onApply={(v) => onUpdateModelOffset?.(styleModel.hash, v)}
                    />
                    </div>
                {/key}
            {/if}
            <div
                class="pointer-events-auto flex max-h-full min-h-0 flex-col gap-2 {styleLayerIdx !==
                    null || styleModelHash !== null
                    ? 'w-52'
                    : 'w-60'}"
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
                onOpenModelStyle={openModelStyle}
                onToggleCoverage={toggleCoverage}
                onToggleLayer={toggleLayer}
                onOpenStyle={openLayerStyle}
                onSelectLayer={(name) => focusSeriesLayer(name)}
                compact={styleLayerIdx !== null || styleModelHash !== null}
                focusLayerName={seriesFocusName}
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
                seriesStepByLayer={seriesStepByLayer}
                resolveLegendLabel={resolveLegendLabel}
                bind:filterToView
                {inViewEntityKeys}
                {inViewModelHashes}
                    {canWrite}
                    canEditModelOffset={canEditModelOffset}
                    {schemaTables}
                    {onOpenTable}
                    class="min-h-0 flex-1"
                />
                {#if canWrite && (bufferEntries.length > 0 || editBuffer.schemaAdds.length > 0 || commitDoneId)}
                    <div
                        class="surface flex min-h-0 max-h-52 shrink-0 flex-col overflow-hidden rounded-lg border border-border text-xs shadow-lg"
                    >
                        <div
                            class="flex shrink-0 items-center justify-between gap-2 border-b border-border px-2 py-1.5"
                        >
                            <span
                                class="min-w-0 truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                                title={bufferSummary}
                                >Session{#if bufferSummary}
                                    · {bufferSummary}
                                {:else}
                                    · {bufferEntries.length}
                                {/if}</span
                            >
                            <div class="flex items-center gap-0.5">
                                <button
                                    type="button"
                                    class="inline-flex items-center rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                                    title={bufferOverlayVisible
                                        ? "Hide session on map"
                                        : "Show session on map"}
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
                                    title="Clear session"
                                    onclick={() => editBuffer.clear()}
                                >
                                    <XIcon class="size-3" />
                                    Clear
                                </button>
                            </div>
                        </div>
                        <ul class="min-h-0 flex-1 overflow-y-auto p-1">
                            {#each bufferGroups as group (group.table)}
                                <li
                                    class="px-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                                >
                                    {group.table}
                                    <span class="tabular-nums"
                                        >· {group.rows.length}</span
                                    >
                                </li>
                                {#each group.rows as rec (`${rec.table}:${rec.entityId}`)}
                                <li
                                    class="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-secondary/80 {drawSession.vertexSession?.entityId ===
                                        rec.entityId &&
                                    drawSession.vertexSession?.table === rec.table
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
                                            if (
                                                blockPeerEdit(
                                                    rec.table,
                                                    rec.entityId,
                                                )
                                            ) {
                                                return;
                                            }
                                            editBuffer.setTargetLayer(rec.table);
                                            if (!editEnabled) {
                                                enterEditMode({
                                                    skipSelectionLock: true,
                                                });
                                            }
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
                                        <span class="font-medium"
                                            >{rec.entityId}</span
                                        >
                                    </button>
                                    <button
                                        type="button"
                                        class="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                                        title="Remove"
                                        onclick={() =>
                                            editBuffer.remove(
                                                rec.table,
                                                rec.entityId,
                                            )}
                                    >
                                        <XIcon class="size-3" />
                                    </button>
                                </li>
                                {/each}
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
                                        title="Commit (required message). Stale develop parks on a personal ref."
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
                        {#if commitDoneId && commitDoneStatus === "committed"}
                            <p
                                class="shrink-0 border-t border-border px-1.5 py-1 text-[10px] text-muted-foreground"
                            >
                                On develop
                                <a
                                    class="font-medium text-foreground underline-offset-2 hover:underline"
                                    href="/{encodeURIComponent(projectSlug)}/history"
                                    >history</a
                                >
                            </p>
                        {/if}
                        {#if commitDoneId && commitDoneStatus === "parked"}
                            <p
                                class="shrink-0 border-t border-border px-1.5 py-1 text-[10px] text-muted-foreground"
                            >
                                Parked — integrate from
                                <a
                                    class="font-medium text-foreground underline-offset-2 hover:underline"
                                    href="/{encodeURIComponent(projectSlug)}/review"
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
                : 'bottom-10'} left-2 right-2 z-10 rounded-md border border-border surface px-2 py-1.5 text-[11px] text-muted-foreground"
        >
            Coverage: {coverageError}
        </div>
    {/if}

    {#if ready && !loading && !hasSceneData && !emptyHintDismissed}
        <div
            class="pointer-events-none absolute inset-x-0 bottom-16 z-5 flex justify-center px-6"
        >
            <div
                class="surface pointer-events-auto flex max-w-sm flex-col items-center gap-1.5 rounded-lg border border-border px-4 py-3 text-center shadow-lg"
            >
                <BoxIcon class="size-8 text-muted-foreground/30" />
                <p class="text-sm">No layers or 3D models</p>
                <p class="max-w-sm text-xs text-muted-foreground">
                    Add entities to this project, or upload a georeferenced
                    <code class="font-mono">.3tz</code> from Artefacts.
                </p>
                {#if failed}
                    <p class="max-w-sm text-xs text-destructive">{failed.ingest_error}</p>
                {/if}
                <div class="flex items-center gap-3">
                    <a
                        href="/{encodeURIComponent(projectSlug)}/artefacts"
                        class="text-xs text-primary hover:underline">Open Artefacts</a
                    >
                    <button
                        type="button"
                        class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onclick={() => (emptyHintDismissed = true)}
                    >
                        <XIcon class="size-3" />
                        Dismiss
                    </button>
                </div>
            </div>
        </div>
    {/if}

    {#if error}
        <div
            class="absolute {editEnabled
                ? 'bottom-28'
                : 'bottom-14'} left-3 right-3 z-10 rounded-md border border-destructive/40 surface px-3 py-2 text-xs text-destructive"
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
        class="cesium-scene absolute top-0 left-0 bottom-0 z-0 bg-neutral-900"
        style:right={showGraph
            ? graphFullscreen
                ? "100%"
                : `${100 - splitAt}%`
            : "0"}
    ></div>
    {#if showGraph}
        {#if !graphFullscreen}
            <div
                class="absolute top-0 bottom-0 z-30 w-1.5 -translate-x-1/2 cursor-col-resize bg-border hover:bg-primary/50"
                style:left="{splitAt}%"
                role="separator"
                aria-orientation="vertical"
                aria-valuenow={Math.round(splitAt)}
                aria-valuemin={20}
                aria-valuemax={80}
                aria-label="Resize graph"
                onpointerdown={(ev) => {
                    splitting = true;
                    (ev.currentTarget as HTMLElement).setPointerCapture(
                        ev.pointerId,
                    );
                }}
                onpointermove={(ev) => {
                    if (!splitting || !sceneRoot) return;
                    const rect = sceneRoot.getBoundingClientRect();
                    if (rect.width <= 0) return;
                    const pct =
                        ((ev.clientX - rect.left) / rect.width) * 100;
                    splitAt = Math.min(80, Math.max(20, pct));
                }}
                onpointerup={(ev) => {
                    splitting = false;
                    try {
                        (ev.currentTarget as HTMLElement).releasePointerCapture(
                            ev.pointerId,
                        );
                    } catch {
                        /* ignore */
                    }
                }}
            ></div>
        {/if}
        <div
            class="absolute right-0 bottom-0 z-20 min-w-0"
            style:top={graphFullscreen ? "0.5rem" : "2.5rem"}
            style:left={graphFullscreen ? "0" : `${splitAt}%`}
        >
            <InstanceGraph
                slug={projectSlug}
                {accessToken}
                {schemaTables}
                {schemaEdges}
                {rows}
                fullscreen={graphFullscreen}
                onToggleFullscreen={() =>
                    (graphFullscreen = !graphFullscreen)}
                onClose={() => {
                    showGraph = false;
                    graphFullscreen = false;
                }}
            />
        </div>
    {/if}
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
            onReply={(body, parentId) => postComment(body, parentId)}
            onResolve={(id, status) => void resolveComment(id, status)}
            onDelete={(id) => void removeComment(id)}
        />
    {/if}
    <div bind:this={creditSink} class="sr-only" aria-hidden="true"></div>

    {#if canWrite && createFormOpen}
        <div
            class="pointer-events-auto z-[1100] {createFormDocked
                ? 'absolute bottom-12 right-3'
                : 'absolute'}"
            style={!createFormDocked
                ? `left: ${pickPanelX}px; top: ${pickPanelY}px; transform: translate(-50%, ${pickFlipBelow ? "12px" : "calc(-100% - 12px)"});`
                : undefined}
            role="dialog"
            aria-label="New feature"
            tabindex="-1"
            onpointerdown={(e) => e.stopPropagation()}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
        >
            <FeatureCreateForm
                layer={drawSession.bindTable ?? editLayer ?? ""}
                geomType={drawMode}
                fields={createFields}
                slug={projectSlug}
                {accessToken}
                {schemaTables}
                {rows}
                onConfirm={confirmCreate}
                onCancel={cancelCreate}
            />
        </div>
    {/if}

    {#if pickOpen && !createFormOpen}
        <PickPager
            open={pickOpen}
            candidates={pickCandidates}
            bind:index={pickIndex}
            placement="floating"
            x={pickPanelX}
            y={pickPanelY}
            flipBelow={pickFlipBelow}
            onIndexChange={applyPickIndex}
            canEdit={canWrite && viewingRef !== "main" && editEnabled}
            canDelete={canWrite && viewingRef !== "main"}
            onDelete={(c) => deleteBufferedFeature(c.layerName, c.entityId)}
            schemaEdges={schemaEdges}
            schemaTables={schemaTables}
            {rows}
            {tables}
            slug={projectSlug}
            {mediaByEntity}
            {accessToken}
            onSelectRelated={(table, id) => {
                layerSelection.selectSingle(table, id);
                const spatial = (tables[table] ?? []).some((c) =>
                    /^_?geom/i.test(c),
                );
                if (spatial) {
                    lastFlownKey = "";
                    void flyToSelection(true);
                } else {
                    onOpenTable?.(table);
                }
            }}
            onClose={() => {
                clearSelection();
            }}
        />
    {/if}

    {#if presenceMember && ready && presenceConnected && editLockHint}
        <div
            class="surface absolute bottom-2 right-2 z-20 max-w-[16rem] rounded px-2 py-1 text-[11px] text-muted-foreground shadow-sm ring-1 ring-border/60"
        >
            {editLockHint}
        </div>
    {/if}
    </div>
</div>

<style>
    :global(.cesium-scene .cesium-viewer-bottom),
    :global(.cesium-scene .cesium-widget-credits),
    :global(.cesium-scene .cesium-credit-lightbox) {
        display: none !important;
    }
</style>
