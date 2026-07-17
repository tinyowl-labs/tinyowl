<script lang="ts">
    import { browser } from "$app/environment";
    import { env as publicEnv } from "$env/dynamic/public";
    import { onDestroy, onMount } from "svelte";
    import BoxIcon from "@lucide/svelte/icons/box";
    import type { ProjectTileset } from "./tilesetTypes";
    import CesiumLoading from "$lib/components/CesiumLoading.svelte";
    import CesiumAttribution from "$lib/components/CesiumAttribution.svelte";
    import { isDark, mapColors, mapLayerPalette, themePrefs } from "$lib/stores/theme.svelte";
    import {
        layerSelection,
        parseSelectionKey,
        toSelectionKey,
        type SelectionOp,
        type SelectionToolMode,
    } from "$lib/stores/layerSelection.svelte";
    import MapToolsRail from "./MapToolsRail.svelte";
    import EntityContextMenu from "./EntityContextMenu.svelte";
    import SceneGraphPanel from "./SceneGraphPanel.svelte";
    import PickPager from "./PickPager.svelte";
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
        type PickCandidate,
    } from "./pickCandidates";
    import type { LayerData } from "./layerTypes";
    import {
        cesiumPropValue,
        entityIdFromPacketId,
    } from "./czmlLoad";
    import { customDataSourceFromCzml } from "./czmlEntities";
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
    };

    type Props = {
        projectSlug: string;
        accessToken?: string;
        tilesets?: ProjectTileset[];
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
    };

    let {
        projectSlug,
        accessToken = "",
        tilesets = [],
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
    }: Props = $props();

    let el = $state<HTMLDivElement>();
    let creditSink = $state<HTMLDivElement>();
    let error = $state("");
    let ready = $state(false);
    /** True when World Terrain was attached (Ion attribution). */
    let hasIonTerrain = $state(false);
    let modelVis = $state<Record<string, boolean>>({});
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
        `${layerSelection.primaryKey ?? ""}|${[...layerSelection.selected].sort().join(",")}`,
    );

    let measureEnabled = $state(false);
    let measureMode = $state<MeasureMode>("length");
    let measureStatus = $state("");
    let measureRecords = $state<MeasureRecord[]>([]);
    let draftVertices: MeasureVertex[] = [];
    let draftCartesians: any[] = [];
    let measureDataSource: any = null;
    let measureClickTimer: ReturnType<typeof setTimeout> | null = null;
    const MEASURE_CLICK_DELAY_MS = 280;
    const MEASURE_COLOR = "#ca8a04";

    const canFinish = $derived(
        measureEnabled &&
            measureMode !== "point" &&
            draftCartesians.length >= minVertices(measureMode),
    );

    let Cesium: any;
    let viewer: any;
    let clickHandler: any;
    let measureHandler: any;
    let postRenderRemover: (() => void) | null = null;
    const tilesetPrims = new Map<string, any>();
    const layerSources = new Map<string, any>();
    const entityMeta = new WeakMap<object, EntityMeta>();
    let selectedEntity: any = null;
    let layerLoadGen = 0;
    let modelLoadGen = 0;
    let started = false;
    /** Frame the project/tileset extent once on boot. Reactive — gates loading overlay. */
    let hasFramed = $state(false);
    let lastFlownKey = "";
    let filterToView = $state(false);
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

    let ctxOpen = $state(false);
    let ctxX = $state(0);
    let ctxY = $state(0);
    let ctxLayerName = $state("");
    let ctxEntityId = $state("");
    let ctxEntity: any = null;

    const models = $derived(
        tilesets.filter((t) => t.ingest_status === "ready" && t.root_url),
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

    async function loadCesium() {
        const { loadCesiumGlobal } = await import("$lib/components/cesiumBoot");
        return loadCesiumGlobal();
    }

    /** Attach World Terrain before any entity load (injalak Terrain.svelte order). */
    async function attachWorldTerrain(token: string) {
        if (!viewer || !Cesium || !token) return;
        try {
            if (typeof Cesium.createWorldTerrainAsync === "function") {
                viewer.terrainProvider = await Cesium.createWorldTerrainAsync();
                hasIonTerrain = true;
                return;
            }
            if (typeof Cesium.createWorldTerrain === "function") {
                viewer.terrainProvider = Cesium.createWorldTerrain();
                hasIonTerrain = true;
                return;
            }
        } catch (e) {
            console.warn("[LayerScene] World Terrain failed", e);
            hasIonTerrain = false;
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
        const prim = tilesetPrims.get(hash);
        if (!prim) return;
        tilesetPrims.delete(hash);
        try {
            viewer?.scene?.primitives?.remove(prim);
        } catch {
            /* ignore */
        }
        if (prim && !prim.isDestroyed?.()) {
            try {
                prim.destroy();
            } catch {
                /* ignore */
            }
        }
    }

    /** Shift tileset along ellipsoid normal to match entity ellipsoidal heights. */
    function applyTilesetHeightOffset(
        prim: any,
        offsetM: number | null | undefined,
    ) {
        if (!prim || !Cesium || offsetM == null || !Number.isFinite(offsetM)) {
            return;
        }
        const apply = () => {
            // Reset first so re-apply is idempotent (boundingSphere includes modelMatrix).
            prim.modelMatrix = Cesium.Matrix4.clone(
                Cesium.Matrix4.IDENTITY,
                new Cesium.Matrix4(),
            );
            const center = prim.boundingSphere?.center;
            if (!center) return false;
            if (offsetM === 0) return true;
            const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(center);
            const translation = Cesium.Cartesian3.multiplyByScalar(
                normal,
                offsetM,
                new Cesium.Cartesian3(),
            );
            prim.modelMatrix = Cesium.Matrix4.fromTranslation(translation);
            return true;
        };
        if (apply()) return;
        void Promise.resolve(prim.readyPromise)
            .then(() => {
                if (!apply()) {
                    const remove = prim.initialTilesLoaded?.addEventListener(
                        () => {
                            apply();
                            remove?.();
                        },
                    );
                }
            })
            .catch(() => {
                /* ignore */
            });
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

    function frameHeightM(prim: any | undefined): number {
        const c = prim?.boundingSphere?.center;
        if (c && Cesium) {
            const h = Cesium.Cartographic.fromCartesian(c).height;
            if (Number.isFinite(h)) return h;
        }
        return 100;
    }

    async function flyCameraToSphere(sphere: any, duration = 1.0) {
        if (!viewer || !Cesium || !sphere) return;
        const is3d = viewer.scene.mode === Cesium.SceneMode.SCENE3D;
        await viewer.camera.flyToBoundingSphere(sphere, {
            duration,
            offset: new Cesium.HeadingPitchRange(
                0,
                is3d ? Cesium.Math.toRadians(-45) : Cesium.Math.toRadians(-90),
                Math.max(sphere.radius * (is3d ? 2.5 : 2.2), is3d ? 40 : 800),
            ),
        });
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

    async function flyToSphere(sphere: any, duration = 1.2) {
        await flyCameraToSphere(sphere, duration);
        hasFramed = true;
        homeSphere = Cesium.BoundingSphere.clone(sphere);
        captureHomeView();
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
        const spheres: any[] = [];
        try {
            for (const ds of layerSources.values()) {
                if (!ds?.show) continue;
                for (const entity of ds.entities.values) {
                    try {
                        if (entity.show === false) continue;
                    } catch {
                        /* ignore */
                    }
                    const s = entityBoundingSphere(entity);
                    if (s?.center && s.radius >= 0) {
                        spheres.push(
                            new Cesium.BoundingSphere(
                                s.center,
                                Math.max(s.radius, 2),
                            ),
                        );
                    }
                }
            }
        } catch {
            /* visualizer may not be ready */
        }
        if (spheres.length > 0) {
            return spheres.length === 1
                ? spheres[0]
                : Cesium.BoundingSphere.fromBoundingSpheres(spheres);
        }
        // Tileset-only projects: fall back to mesh / bbox.
        const hasEntityLayers = layers.some(
            (l) => (l.entityIds?.length ?? 0) > 0,
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
        const ds = layerSources.get(layerName);
        if (!ds) return;
        const spheres: any[] = [];
        for (const entity of ds.entities.values) {
            const s = entityBoundingSphere(entity);
            if (s?.center && s.radius >= 0) {
                spheres.push(
                    new Cesium.BoundingSphere(s.center, Math.max(s.radius, 2)),
                );
            }
        }
        if (spheres.length === 0) return;
        const combined =
            spheres.length === 1
                ? spheres[0]
                : Cesium.BoundingSphere.fromBoundingSpheres(spheres);
        await flyCameraToSphere(combined, 1.0);
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
        return [...layerSelection.selected].sort().join("|");
    }

    function allSelectableEntities(): SelectableEntity[] {
        const out: SelectableEntity[] = [];
        for (const ds of layerSources.values()) {
            for (const entity of ds.entities.values) {
                const meta = entityMeta.get(entity);
                if (!meta) continue;
                if (layerSelection.isHidden(meta.layerName, meta.entityId)) continue;
                out.push({
                    key: toSelectionKey(meta.layerName, meta.entityId),
                    entity,
                });
            }
        }
        return out;
    }

    function findEntitiesByKey(key: string): any[] {
        if (!key) return [];
        const { layer, id } = parseSelectionKey(key);
        if (!id) return [];
        const out: any[] = [];
        for (const [name, ds] of layerSources) {
            if (layer && name !== layer) continue;
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
        return out;
    }

    function findEntityByKey(key: string): any | null {
        return findEntitiesByKey(key)[0] ?? null;
    }

    async function flyToSelection(force = true) {
        const keys = [...layerSelection.selected].sort();
        if (keys.length === 0) return;
        const flyKey = keys.join("|");
        if (!force && flyKey && flyKey === lastFlownKey) return;

        const spheres: any[] = [];
        for (const key of keys) {
            const entity = findEntityByKey(key);
            if (!entity) continue;
            const s = entityBoundingSphere(entity);
            if (s?.center && s.radius >= 0) {
                spheres.push(
                    new Cesium.BoundingSphere(s.center, Math.max(s.radius, 2)),
                );
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

    /**
     * Initial camera once: entity-layer home (instant). Do not zoom to tilesets
     * when layers exist — mesh is backdrop. Tileset-only projects still frame mesh.
     */
    async function frameScene(attempt = 0) {
        if (!viewer || !Cesium || hasFramed) return;
        const m = selected ?? models[0] ?? null;
        const prim = m ? tilesetPrims.get(m.hash) : undefined;
        if (prim) {
            try {
                await prim.readyPromise;
            } catch {
                /* continue */
            }
            applyTilesetHeightOffset(prim, m?.height_offset_m);
        }

        const entitySpheres: any[] = [];
        try {
            for (const ds of layerSources.values()) {
                if (!ds?.show) continue;
                for (const entity of ds.entities.values) {
                    if (entity.show === false) continue;
                    const s = entityBoundingSphere(entity);
                    if (s?.center && s.radius >= 0) {
                        entitySpheres.push(
                            new Cesium.BoundingSphere(
                                s.center,
                                Math.max(s.radius, 2),
                            ),
                        );
                    }
                }
            }
        } catch {
            /* visualizer may not be ready */
        }

        if (entitySpheres.length > 0) {
            const combined =
                entitySpheres.length === 1
                    ? entitySpheres[0]
                    : Cesium.BoundingSphere.fromBoundingSpheres(entitySpheres);
            await flyToSphere(combined, 1.0);
            return;
        }

        const expectEntities = layers.some(
            (l) => l.visible && (l.entityIds?.length ?? 0) > 0,
        );
        // Wait for entity visualizers — never fall through to tileset while layers load.
        if (expectEntities) {
            if (attempt < 24) {
                await new Promise<void>((r) =>
                    requestAnimationFrame(() => r()),
                );
                await frameScene(attempt + 1);
                return;
            }
            // Layers exist but spheres never became ready — don't zoom to mesh.
            hasFramed = true;
            return;
        }

        // No entity layers: tileset-only home.
        const bbox = m?.bbox_wgs84;
        if (Array.isArray(bbox)) {
            const sphere = sphereFromBboxWgs84(bbox, frameHeightM(prim));
            if (sphere) {
                await flyToSphere(sphere, 1.0);
                return;
            }
        }

        if (prim?.boundingSphere?.radius > 0) {
            await flyToSphere(
                Cesium.BoundingSphere.clone(prim.boundingSphere),
                1.0,
            );
            return;
        }

        if (prim) {
            await viewer.flyTo(prim, { duration: 1.0 });
            hasFramed = true;
            try {
                if (prim.boundingSphere?.radius > 0) {
                    homeSphere = Cesium.BoundingSphere.clone(
                        prim.boundingSphere,
                    );
                }
            } catch {
                /* ignore */
            }
            captureHomeView();
            return;
        }

        if (attempt < 24) {
            await new Promise<void>((r) =>
                requestAnimationFrame(() => r()),
            );
            await frameScene(attempt + 1);
            return;
        }
        // Nothing to frame (empty project) — release the loading overlay.
        hasFramed = true;
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
        if (started) syncAllSelectionStyles();
    }

    function closeContextMenu() {
        const wasOpen = ctxOpen;
        ctxOpen = false;
        ctxEntity = null;
        // Restore selection styles after context preview highlight.
        if (wasOpen && started) syncAllSelectionStyles();
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
        for (const [, ds] of layerSources) {
            try {
                for (const entity of ds.entities.values) {
                    const meta = entityMeta.get(entity);
                    if (!meta) continue;
                    const wantShow = !layerSelection.isHidden(
                        meta.layerName,
                        meta.entityId,
                    );
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
        const canvas = viewer?.scene?.canvas as HTMLCanvasElement | undefined;
        const rect = canvas?.getBoundingClientRect();
        ctxLayerName = layerName;
        ctxEntityId = entityId;
        ctxEntity = entity;
        ctxX = Math.min(
            (rect?.left ?? 0) + screenPos.x,
            window.innerWidth - 220,
        );
        ctxY = Math.min(
            (rect?.top ?? 0) + screenPos.y,
            window.innerHeight - 160,
        );
        ctxOpen = true;
        previewContextEntity(entity);
    }

    function measureColor() {
        return Cesium.Color.fromCssColorString(MEASURE_COLOR);
    }

    async function ensureMeasureDs() {
        if (!viewer || !Cesium) return null;
        if (measureDataSource) return measureDataSource;
        measureDataSource = new Cesium.CustomDataSource("tinyowl-measure");
        await viewer.dataSources.add(measureDataSource);
        return measureDataSource;
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

    async function redrawDraftMeasure() {
        const ds = await ensureMeasureDs();
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
                    positions: draftCartesians,
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
                    hierarchy: draftCartesians,
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
                    text: formatMeasureValue(measureMode, value, draftVertices),
                    font: "12px sans-serif",
                    fillColor: Cesium.Color.WHITE,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 3,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    pixelOffset: new Cesium.Cartesian2(0, -12),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
            });
        }
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
                    hierarchy: positions,
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
                    positions,
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
                text: label,
                font: "12px sans-serif",
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 3,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                pixelOffset: new Cesium.Cartesian2(0, -12),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
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
    }

    function queueMeasurePick(screenPos: any) {
        if (measureClickTimer) clearTimeout(measureClickTimer);
        if (measureMode === "point") {
            void onMeasurePick(screenPos);
            return;
        }
        measureClickTimer = setTimeout(() => {
            measureClickTimer = null;
            void onMeasurePick(screenPos);
        }, MEASURE_CLICK_DELAY_MS);
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
            await redrawDraftMeasure();
            await commitMeasure3d();
            return;
        }
        await redrawDraftMeasure();
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
        if (measureClickTimer) {
            clearTimeout(measureClickTimer);
            measureClickTimer = null;
        }
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
        measureRecords = [];
        measureStatus = measureHint(measureMode, dim === "2d" ? "2d" : "3d");
    }

    function finishDraft3d() {
        if (measureClickTimer) {
            clearTimeout(measureClickTimer);
            measureClickTimer = null;
        }
        if (draftCartesians.length >= minVertices(measureMode)) {
            void commitMeasure3d();
        }
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
            queueMeasurePick(click.position);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        measureHandler.setInputAction(() => {
            if (measureMode === "point") return;
            if (measureClickTimer) {
                clearTimeout(measureClickTimer);
                measureClickTimer = null;
            }
            finishDraft3d();
        }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
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
        for (const ds of layerSources.values()) {
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

        entityKeys.sort();
        modelHashes.sort();
        if (!arraysEqual(entityKeys, inViewEntityKeys)) {
            inViewEntityKeys = entityKeys;
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
            pickCandidates = [
                {
                    key,
                    layerName,
                    entityId,
                    label: pickCandidateLabel(layerName, entityId, rows),
                },
            ];
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

    function closePickPager() {
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
            const meta = entityMeta.get(entity);
            if (!meta) continue;
            if (layerSelection.isHidden(meta.layerName, meta.entityId)) continue;
            out.push({
                key: toSelectionKey(meta.layerName, meta.entityId),
                layerName: meta.layerName,
                entityId: meta.entityId,
                label: pickCandidateLabel(meta.layerName, meta.entityId, rows),
            });
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
                : (meta.baseOutline ?? Cesium.Color.WHITE.withAlpha(0.85));
            entity.point.outlineWidth = kind === "primary"
                ? Math.max(meta.baseOutlineWidth + 2, 3)
                : selected
                  ? Math.max(meta.baseOutlineWidth + 1, 2)
                  : meta.baseOutlineWidth;
        } else if (meta.kind === "polyline" && entity.polyline) {
            entity.polyline.width = kind === "primary"
                ? Math.max(meta.baseWidth + 3, 5)
                : selected
                  ? Math.max(meta.baseWidth + 1.5, 3.5)
                  : meta.baseWidth;
            entity.polyline.material = accent ?? base;
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

        if (layerSelection.size === 0) {
            hideEntityPopup();
            return;
        }

        // Single selection: show popup. Multi: no popup (primary still styled).
        if (layerSelection.size === 1 && primary) {
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

    function resolveEntityIdFromCzml(entity: any, layerName: string): string {
        const time = Cesium?.JulianDate?.now?.() ?? undefined;
        const props = entity.properties;
        if (props) {
            for (const key of ["source_id", "id", "fid", "entity_id"]) {
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
            const outlineWidth =
                Number(cesiumPropValue(entity.point.outlineWidth, time)) || 1;
            const outline =
                cesiumPropValue(entity.point.outlineColor, time) ??
                Cesium.Color.WHITE.withAlpha(0.85);
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

    function resolvePickedEntity(picked: any): any {
        if (!picked) return null;
        if (picked.id && entityMeta.has(picked.id)) return picked.id;
        if (entityMeta.has(picked)) return picked;
        // Classification / ground primitive pick may nest id
        if (picked.id && typeof picked.id === "object") return picked.id;
        return null;
    }

    function basemapTemplateUrl(): string {
        // CARTO Voyager — stable single basemap (no provider swap on theme).
        return "https://basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png";
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
            layer.saturation = 1.08;
            layer.contrast = 1;
            layer.gamma = 1;
        }
    }

    function applyBasemapTheme() {
        if (!viewer || !Cesium) return;
        const dark = isDark();
        const colors = mapColors();
        const bg =
            cesiumColorFromCss(colors.card, dark ? "#1a1a1a" : "#f5f5f5") ??
            (dark ? Cesium.Color.BLACK : Cesium.Color.WHITE);
        viewer.scene.backgroundColor = bg;
        viewer.scene.globe.baseColor = bg;
        if (viewer.scene.skyAtmosphere) {
            viewer.scene.skyAtmosphere.show = !dark;
        }
        if (viewer.scene.sun) viewer.scene.sun.show = !dark;
        if (viewer.scene.moon) viewer.scene.moon.show = !dark;
        if (viewer.scene.skyBox) viewer.scene.skyBox.show = !dark;

        const url = basemapTemplateUrl();
        const layers = viewer.imageryLayers;
        const existing = layers.length > 0 ? layers.get(0) : null;
        const currentUrl = existing?.imageryProvider?.url as string | undefined;
        if (currentUrl === url && existing) {
            tuneBasemapLayer(existing, dark);
            return;
        }
        while (layers.length > 0) {
            layers.remove(layers.get(0), true);
        }
        const layer = layers.addImageryProvider(
            new Cesium.UrlTemplateImageryProvider({
                url,
                maximumLevel: 19,
                credit: "",
            }),
        );
        tuneBasemapLayer(layer, dark);
    }

    let morphRemover: (() => void) | null = null;
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
        if (opts.refocus) void refocusAfterMorph(is3d);
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

        morphRemover = viewer.scene.morphComplete.addEventListener(() => {
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

        // Viewer first on ellipsoid — same as injalak. Do NOT pass
        // Terrain.fromWorldTerrain() here: that helper swaps the provider
        // asynchronously after ready, so early height samples land at Z≈0.
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
            baseLayer: new Cesium.ImageryLayer(
                new Cesium.UrlTemplateImageryProvider({
                    url: basemapTemplateUrl(),
                    maximumLevel: 19,
                    credit: "",
                }),
            ),
        });
        try {
            viewer.resize();
        } catch {
            /* ignore */
        }
        applyBasemapTheme();
        viewer.scene.globe.depthTestAgainstTerrain = false;

        // Terrain must be live before syncLayers / sampleTerrainMostDetailed.
        await attachWorldTerrain(token);
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
            if (measureEnabled) return;
            closeContextMenu();
            const { shift, ctrl, meta: cmd } = lastPointerMods;
            const candidates = collectDrillCandidates(click.position);
            if (candidates.length === 0) {
                clearSelection();
                closePickPager();
                return;
            }
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
            if (measureEnabled) return;
            const picked = viewer.scene.pick(click.position);
            const entity = resolvePickedEntity(picked);
            const meta = entity ? entityMeta.get(entity) : undefined;
            if (entity && meta) {
                // Context menu only — preview highlight OK; do not selectSingle / popup.
                openEntityContextMenu(click.position, entity, meta.layerName, meta.entityId);
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
            if (!want || !m.root_url || dim !== "3d") continue;
            try {
                const resource = new Cesium.Resource({
                    url: m.root_url,
                    queryParameters: accessToken ? { token: accessToken } : {},
                    headers: accessToken
                        ? { Authorization: `Bearer ${accessToken}` }
                        : {},
                });
                const prim = await Cesium.Cesium3DTileset.fromUrl(resource, {
                    enableCollision: false,
                    maximumScreenSpaceError: 4,
                });
                if (gen !== modelLoadGen || !readyHashes.has(m.hash)) {
                    if (!prim.isDestroyed?.()) prim.destroy();
                    continue;
                }
                prim.show = dim === "3d" && isModelVisible(m.hash);
                viewer.scene.primitives.add(prim);
                tilesetPrims.set(m.hash, prim);
                applyTilesetHeightOffset(prim, m.height_offset_m);
                prim.initialTilesLoaded.addEventListener(() => {
                    applyTilesetHeightOffset(prim, m.height_offset_m);
                    viewer.scene.requestRender?.();
                });
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

        if (fly || !hasFramed) await frameScene();
    }

    function toggleModel(hash: string) {
        const next = !isModelVisible(hash);
        modelVis = { ...modelVis, [hash]: next };
        const prim = tilesetPrims.get(hash);
        if (prim) {
            prim.show = next;
            if (next) onSelectTileset?.(hash);
            return;
        }
        if (next) {
            onSelectTileset?.(hash);
            void syncModels(false);
        }
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

        if (!hasFramed) await frameScene();
        applyHiddenVisibility();
        syncAllSelectionStyles();
        if (layerSelection.size > 0) {
            void flyToSelection(false);
        }
    }

    function toggleLayer(idx: number) {
        const layer = layers[idx];
        if (!layer) return;
        layer.visible = !layer.visible;
        const ds = layerSources.get(layer.name);
        if (ds) ds.show = layer.visible;
        else if (layer.visible) void syncLayers();
    }

    onMount(() => {
        if (!browser) return;
        void boot().catch((e) => {
            error = e instanceof Error ? e.message : "Failed to start 3D";
        });
    });

    let modelKey = $derived(
        models.map((m) => m.hash).join("|") + "|" + accessToken,
    );
    let layerContentKey = $derived(
        layers
            .map((l) => `${l.name}:${l.packets?.length ?? 0}`)
            .join("|"),
    );

    $effect(() => {
        modelKey;
        if (!ready || !started) return;
        void syncModels(false);
    });

    $effect(() => {
        layerContentKey;
        if (!ready || !started) return;
        void syncLayers();
    });

    $effect(() => {
        const d = dim;
        if (!ready || !viewer) return;
        if (appliedDim === d) return;
        applySceneMode(d);
    });

    $effect(() => {
        if (!ready || !viewer || !active) return;
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
        if (!ready || !started) return;
        syncAllSelectionStyles();
        const flyKey = selectionFlyKey();
        if (flyKey && flyKey !== lastFlownKey) {
            void flyToSelection(false);
        } else if (!flyKey) {
            lastFlownKey = "";
        }
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

    onDestroy(() => {
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
        for (const name of [...layerSources.keys()]) destroyLayerSource(name);
        try {
            viewer?.destroy?.();
        } catch {
            /* ignore */
        }
        viewer = null;
    });

    function onSceneKey(ev: KeyboardEvent) {
        const action = mapToolShortcut(ev);
        if (!action) return;

        if (action.type === "enter") {
            if (measureEnabled) {
                ev.preventDefault();
                finishDraft3d();
            }
            return;
        }
        if (action.type === "escape") {
            if (measureEnabled) {
                clearDraftMeasure();
                measureStatus = measureHint(measureMode, dim === "2d" ? "2d" : "3d");
                return;
            }
            if (ctxOpen) return;
            if (pickOpen) {
                closePickPager();
                return;
            }
            if (layerSelection.isIsolating) {
                layerSelection.exitIsolate();
                applyHiddenVisibility();
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
            layerSelection.exitIsolate();
            applyHiddenVisibility();
            return;
        }
        if (action.type === "select-tool") {
            ev.preventDefault();
            selectionToolLocal = action.mode;
            return;
        }
        if (action.type === "measure-toggle") {
            ev.preventDefault();
            measureEnabled = !measureEnabled;
            return;
        }
        if (action.type === "measure-mode") {
            ev.preventDefault();
            measureMode = action.mode;
            measureEnabled = true;
        }
    }

    $effect(() => {
        layerSelection.setToolMode(selectionToolLocal);
    });

    $effect(() => {
        if (!ready || !viewer || !Cesium || measureEnabled) return;
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
            if (measureClickTimer) {
                clearTimeout(measureClickTimer);
                measureClickTimer = null;
            }
            clearDraftMeasure();
            setupMeasureHandler();
            viewer.canvas.style.cursor = "crosshair";
            return;
        }
        if (measureClickTimer) {
            clearTimeout(measureClickTimer);
            measureClickTimer = null;
        }
        teardownMeasureHandler();
        clearDraftMeasure();
        measureStatus = "";
        if (viewer?.canvas) {
            viewer.canvas.style.cursor = "";
        }
    });

    $effect(() => {
        measureMode;
        if (!measureEnabled || !ready) return;
        if (measureClickTimer) {
            clearTimeout(measureClickTimer);
            measureClickTimer = null;
        }
        clearDraftMeasure();
        measureStatus = measureHint(measureMode, dim === "2d" ? "2d" : "3d");
    });
</script>

<div class="relative h-full w-full min-h-0 overflow-hidden">
    <div class="absolute top-2 left-2 z-20">
        <MapToolsRail
            bind:enabled={measureEnabled}
            bind:mode={measureMode}
            bind:selectionTool={selectionToolLocal}
            status={measureStatus}
            records={measureRecords}
            {canFinish}
            {dim}
            {fullscreen}
            {selectionCount}
            {isolating}
            onZoomIn={zoomIn3d}
            onZoomOut={zoomOut3d}
            onSetDim={onDimChange}
            onToggleFullscreen={onToggleFullscreen}
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
                layerSelection.exitIsolate();
                applyHiddenVisibility();
            }}
            onClear={() => void clearMeasurements()}
            onFinish={finishDraft3d}
            onRemove={(id) => void removeMeasurement(id)}
        />
    </div>

    <EntityContextMenu
        open={ctxOpen}
        x={ctxX}
        y={ctxY}
        layerName={ctxLayerName}
        entityId={ctxEntityId}
        {selectionCount}
        targetInSelection={layerSelection.isSelected(ctxLayerName, ctxEntityId)}
        {isolating}
        onFlyTo={() => {
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
            if (ctxEntity) {
                hideEntity(ctxEntity, ctxLayerName, ctxEntityId);
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
            layerSelection.exitIsolate();
            applyHiddenVisibility();
        }}
        onClear={() => clearSelection()}
        onClose={closeContextMenu}
    />

    {#if isolating}
        <button
            type="button"
            class="absolute bottom-10 left-3 z-20 rounded-md border border-border bg-background/95 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm hover:text-foreground"
            onclick={() => {
                layerSelection.exitIsolate();
                applyHiddenVisibility();
            }}
        >
            Isolating · Exit
        </button>
    {:else if hiddenCount > 0}
        <button
            type="button"
            class="absolute bottom-10 left-3 z-20 rounded-md border border-border bg-background/95 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm hover:text-foreground"
            onclick={showAllHiddenEntities}
        >
            {hiddenCount} hidden · Show all
        </button>
    {/if}

    {#if !hasFramed}
        <CesiumLoading />
    {/if}

    {#if hasFramed && ready && !loading && (models.length > 0 || layers.length > 0)}
        <div class="absolute top-2 right-2 z-10">
            <SceneGraphPanel
                {layers}
                {models}
                {rows}
                {palette}
                pendingModels={pending}
                modelVisible={isModelVisible}
                onToggleModel={toggleModel}
                onToggleLayer={toggleLayer}
                onApplyHidden={applyHiddenVisibility}
                onFlyTo={() => {
                    lastFlownKey = "";
                    void flyToSelection(true);
                }}
                onFlyToLayer={(name) => {
                    void flyToLayerExtent(name);
                }}
                bind:filterToView
                {inViewEntityKeys}
                {inViewModelHashes}
            />
        </div>
    {/if}

    {#if ready && !loading && models.length === 0 && layers.length === 0}
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
            class="absolute bottom-14 left-3 right-3 z-10 rounded-md border border-destructive/40 bg-background/95 px-3 py-2 text-xs text-destructive"
        >
            {error}
        </div>
    {/if}

    {#if pickOpen}
        <PickPager
            open={pickOpen}
            candidates={pickCandidates}
            bind:index={pickIndex}
            {rows}
            placement="floating"
            x={pickPanelX}
            y={pickPanelY}
            flipBelow={pickFlipBelow}
            onIndexChange={applyPickIndex}
            onClose={() => {
                closePickPager();
            }}
        />
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
        class="cesium-scene absolute inset-0 bg-neutral-900"
    ></div>
    <div bind:this={creditSink} class="sr-only" aria-hidden="true"></div>

    <CesiumAttribution ion={hasIonTerrain} />
</div>

<style>
    :global(.cesium-scene .cesium-viewer-bottom),
    :global(.cesium-scene .cesium-widget-credits),
    :global(.cesium-scene .cesium-credit-lightbox) {
        display: none !important;
    }
</style>
