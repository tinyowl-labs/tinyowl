<script lang="ts">
    import { browser } from "$app/environment";
    import { env as publicEnv } from "$env/dynamic/public";
    import { onDestroy, onMount } from "svelte";
    import BoxIcon from "@lucide/svelte/icons/box";
    import LoaderIcon from "@lucide/svelte/icons/loader";
    import type { ProjectTileset } from "./tilesetTypes";
    import { isDark, mapColors, mapLayerPalette, themePrefs } from "$lib/stores/theme.svelte";
    import {
        layerSelection,
        parseSelectionKey,
        toSelectionKey,
        type SelectionOp,
        type SelectionToolMode,
    } from "$lib/stores/layerSelection.svelte";
    import {
        buildEntityPopupHtml,
        featureEntityId,
    } from "./mapEntityPopup";
    import MapToolsRail from "./MapToolsRail.svelte";
    import EntityContextMenu from "./EntityContextMenu.svelte";
    import SceneGraphPanel from "./SceneGraphPanel.svelte";
    import { SELECTION_PRIMARY, SELECTION_SECONDARY } from "./selectionStyle";
    import {
        collectKeysInScreenPolygon,
        collectKeysInScreenRect,
        type SelectableEntity,
    } from "./mapSelection";
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

    type LayerData = {
        name: string;
        geojson: GeoJSON.FeatureCollection;
        visible: boolean;
    };

    type EntityMeta = {
        layerName: string;
        entityId: string;
        kind: "point" | "polyline" | "polygon";
        base: any;
    };

    type Props = {
        projectSlug: string;
        accessToken?: string;
        tilesets?: ProjectTileset[];
        selectedHash?: string;
        loading?: boolean;
        layers?: LayerData[];
        rows?: Record<string, Record<string, unknown>[]>;
        onSelectTileset?: (hash: string) => void;
        fullscreen?: boolean;
        onToggleFullscreen?: () => void;
    };

    let {
        projectSlug,
        accessToken = "",
        tilesets = [],
        selectedHash = "",
        loading = false,
        layers = [],
        rows = {},
        onSelectTileset,
        fullscreen = false,
        onToggleFullscreen,
    }: Props = $props();

    let el = $state<HTMLDivElement>();
    let creditSink = $state<HTMLDivElement>();
    let error = $state("");
    let ready = $state(false);
    let modelVis = $state<Record<string, boolean>>({});
    let popupHtml = $state("");
    let popupX = $state(0);
    let popupY = $state(0);
    let popupVisible = $state(false);

    const selectionCount = $derived(layerSelection.size);
    const hiddenCount = $derived(layerSelection.hiddenCount);
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
    /** Frame the project/tileset extent once on boot (like LayerMap.hasFramed). */
    let hasFramed = false;
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
        if ((window as any).Cesium) return (window as any).Cesium;
        (window as any).CESIUM_BASE_URL = "/cesium/";
        if (!document.querySelector('link[href="/cesium/Widgets/widgets.css"]')) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = "/cesium/Widgets/widgets.css";
            document.head.appendChild(link);
        }
        await new Promise<void>((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "/cesium/Cesium.js";
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("Failed to load Cesium.js"));
            document.head.appendChild(s);
        });
        return (window as any).Cesium;
    }

    /** Cesium fromCssColorString misses modern `rgb(r g b)` — parse safely. */
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

    function color(css: string, a = 0.75) {
        const c = cesiumColorFromCss(css, "#3b82f6");
        return c ? c.withAlpha(a) : Cesium.Color.DODGERBLUE.withAlpha(a);
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
        await viewer.camera.flyToBoundingSphere(sphere, {
            duration,
            offset: new Cesium.HeadingPitchRange(
                0,
                -0.45,
                Math.max(sphere.radius * 2.5, 40),
            ),
        });
    }

    async function flyToSphere(sphere: any) {
        await flyCameraToSphere(sphere, 1.2);
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

    /** Union of visible entity + tileset spheres for Home framing. */
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
        for (const [hash, prim] of tilesetPrims) {
            if (!prim?.show) continue;
            try {
                if (prim.boundingSphere?.radius > 0) {
                    spheres.push(
                        Cesium.BoundingSphere.clone(prim.boundingSphere),
                    );
                    continue;
                }
            } catch {
                /* ignore */
            }
            const m = models.find((x) => x.hash === hash);
            const bbox = m?.bbox_wgs84;
            if (Array.isArray(bbox)) {
                const s = sphereFromBboxWgs84(bbox, frameHeightM(prim));
                if (s) spheres.push(s);
            }
        }
        if (spheres.length === 0) return null;
        return spheres.length === 1
            ? spheres[0]
            : Cesium.BoundingSphere.fromBoundingSpheres(spheres);
    }

    async function flyHome() {
        if (!viewer || !Cesium) return;
        // Prefer live project extent so Home never falls back to Cesium's world view.
        const sphere = computeHomeSphere() ?? homeSphere;
        if (sphere) {
            homeSphere = Cesium.BoundingSphere.clone(sphere);
            await flyCameraToSphere(sphere, 1.0);
            captureHomeView();
            return;
        }
        if (homeView) {
            viewer.camera.flyTo({
                destination: homeView.destination,
                orientation: homeView.orientation,
                duration: 1.0,
            });
        }
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

    function findEntityByKey(key: string): any | null {
        if (!key) return null;
        const { layer, id } = parseSelectionKey(key);
        if (!id) return null;
        for (const [name, ds] of layerSources) {
            if (layer && name !== layer) continue;
            try {
                for (const entity of ds.entities.values) {
                    const meta = entityMeta.get(entity);
                    if (!meta) continue;
                    if (meta.entityId === id && (!layer || meta.layerName === layer)) {
                        return entity;
                    }
                }
            } catch {
                /* ignore */
            }
        }
        return null;
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
     * Initial camera once: prefer entity-layer extent (home), then tileset.
     * Selection must not re-frame (mirrors LayerMap).
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

        // Prefer entity extents so Home matches the data, not the mesh alone.
        const entitySpheres: any[] = [];
        try {
            for (const ds of viewer.dataSources) {
                if (!ds?.show) continue;
                // Skip ephemeral measure datasource.
                if (ds === measureDataSource) continue;
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
            await flyToSphere(combined);
            return;
        }

        // Wait for entity visualizers before falling back to tileset extent.
        const expectEntities = layers.some(
            (l) => l.visible && (l.geojson?.features?.length ?? 0) > 0,
        );
        if (expectEntities && attempt < 10) {
            await new Promise<void>((r) =>
                requestAnimationFrame(() => r()),
            );
            await frameScene(attempt + 1);
            return;
        }

        const bbox = m?.bbox_wgs84;
        if (Array.isArray(bbox)) {
            const sphere = sphereFromBboxWgs84(bbox, frameHeightM(prim));
            if (sphere) {
                await flyToSphere(sphere);
                return;
            }
        }

        if (prim?.boundingSphere?.radius > 0) {
            await flyToSphere(Cesium.BoundingSphere.clone(prim.boundingSphere));
            return;
        }

        if (prim) {
            await viewer.flyTo(prim, { duration: 1.2 });
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

        // Nothing to frame yet — retry briefly.
        if (attempt < 10) {
            await new Promise<void>((r) =>
                requestAnimationFrame(() => r()),
            );
            await frameScene(attempt + 1);
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
        measureStatus = `${label} saved · ${measureHint(measureMode, "3d")}`;
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
                ? `${n} point${n === 1 ? "" : "s"} · ${measureHint(measureMode, "3d")}`
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
        measureStatus = measureHint(measureMode, "3d");
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

    /** Show popup for an entity (store selection already updated). */
    function selectEntity(
        entity: any,
        layerName: string,
        entityId: string,
    ) {
        selectedEntity = entity;
        popupHtml = buildEntityPopupHtml(layerName, entityId, rows);
        popupVisible = true;
        updatePopupPosition();
    }

    function hideEntityPopup() {
        selectedEntity = null;
        popupVisible = false;
        popupHtml = "";
    }

    function updatePopupPosition() {
        if (!selectedEntity || !popupHtml) return;
        const win = entityScreenPos(selectedEntity);
        if (!win) {
            popupVisible = false;
            return;
        }
        const canvas = viewer?.scene?.canvas;
        const onScreen =
            win.x >= 0 &&
            win.y >= 0 &&
            (!canvas ||
                (win.x <= canvas.clientWidth && win.y <= canvas.clientHeight));
        popupVisible = onScreen;
        if (onScreen) {
            popupX = win.x;
            popupY = win.y;
        }
    }

    function hasNonZeroHeight(coords: GeoJSON.Position[]): boolean {
        for (const c of coords) {
            const z = c.length > 2 && typeof c[2] === "number" ? c[2] : 0;
            // Ignore tiny Z noise — treat as ground-clamped 2D.
            if (Math.abs(z) > 0.5) return true;
        }
        return false;
    }

    function posDegrees(c: GeoJSON.Position) {
        const useZ =
            c.length > 2 &&
            typeof c[2] === "number" &&
            Math.abs(c[2] as number) > 0.5;
        return Cesium.Cartesian3.fromDegrees(
            c[0],
            c[1],
            useZ ? (c[2] as number) : 0,
        );
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
            entity.point.pixelSize = kind === "primary" ? 14 : selected ? 11 : 8;
            entity.point.color = accent ?? base;
            entity.point.outlineColor = selected
                ? Cesium.Color.WHITE
                : Cesium.Color.WHITE.withAlpha(0.85);
            entity.point.outlineWidth = kind === "primary" ? 3 : selected ? 2 : 1;
        } else if (meta.kind === "polyline" && entity.polyline) {
            entity.polyline.width = kind === "primary" ? 5 : selected ? 3.5 : 2;
            entity.polyline.material = accent ?? base;
        } else if (meta.kind === "polygon" && entity.polygon) {
            const fill = accent ?? base;
            entity.polygon.material = fill.withAlpha(
                kind === "primary" ? 0.45 : selected ? 0.4 : 0.35,
            );
            entity.polygon.outlineColor = selected
                ? Cesium.Color.WHITE
                : base;
            entity.polygon.outlineWidth = kind === "primary" ? 3 : selected ? 2.5 : 2;
        }
    }

    function syncAllSelectionStyles() {
        for (const key of styledSelectionKeys) {
            const entity = findEntityByKey(key);
            if (entity) applyEntitySelectionStyle(entity, null);
        }
        styledSelectionKeys = new Set();

        const primary = layerSelection.primaryKey;
        for (const key of layerSelection.selected) {
            const entity = findEntityByKey(key);
            if (!entity) continue;
            const kind = key === primary ? "primary" : "secondary";
            applyEntitySelectionStyle(entity, kind);
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
    ) {
        if (!entityId) return;
        entityMeta.set(entity, { layerName, entityId, kind, base });
        entity.name = toSelectionKey(layerName, entityId);
        if (layerSelection.isHidden(layerName, entityId)) {
            try {
                entity.show = false;
            } catch {
                /* ignore */
            }
        }
    }

    /** Lamina-style entities (czml.ts): Point + heightReference, clamped lines/polys. */
    function addFeatureEntities(
        ds: any,
        feature: GeoJSON.Feature,
        layerName: string,
        stroke: any,
        fill: any,
    ) {
        const g = feature.geometry;
        if (!g) return;
        const entityId = featureEntityId(feature);

        const addPoint = (coordinates: GeoJSON.Position) => {
            const useHeights = hasNonZeroHeight([coordinates]);
            const entity = ds.entities.add({
                position: posDegrees(coordinates),
                point: {
                    pixelSize: 8,
                    color: stroke,
                    outlineColor: Cesium.Color.WHITE.withAlpha(0.85),
                    outlineWidth: 1,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    ...(useHeights
                        ? {}
                        : {
                              heightReference:
                                  Cesium.HeightReference.CLAMP_TO_GROUND,
                          }),
                },
            });
            trackEntity(entity, layerName, entityId, "point", stroke);
        };

        const addLine = (coordinates: GeoJSON.Position[]) => {
            const useHeights = hasNonZeroHeight(coordinates);
            const entity = ds.entities.add({
                polyline: {
                    positions: coordinates.map(posDegrees),
                    width: 2,
                    material: stroke,
                    ...(useHeights ? {} : { clampToGround: true }),
                },
            });
            trackEntity(entity, layerName, entityId, "polyline", stroke);
        };

        const addPolygon = (rings: GeoJSON.Position[][]) => {
            const exterior = rings[0] ?? [];
            if (exterior.length < 3) return;
            const useHeights = hasNonZeroHeight(exterior);
            const hierarchy = new Cesium.PolygonHierarchy(
                exterior.map(posDegrees),
                rings.slice(1).map(
                    (hole) =>
                        new Cesium.PolygonHierarchy(hole.map(posDegrees)),
                ),
            );
            const entity = ds.entities.add({
                polygon: {
                    hierarchy,
                    material: fill,
                    outline: useHeights,
                    outlineColor: stroke,
                    outlineWidth: 2,
                    ...(useHeights
                        ? { perPositionHeight: true }
                        : {
                              // Drape on terrain + photogrammetry mesh
                              classificationType:
                                  Cesium.ClassificationType.BOTH,
                          }),
                },
            });
            trackEntity(entity, layerName, entityId, "polygon", stroke);
            // Classification polygons often hide outlines — add a ground clamp edge.
            if (!useHeights) {
                const ring = [...exterior.map(posDegrees)];
                const first = exterior[0]!;
                const last = exterior[exterior.length - 1]!;
                if (first[0] !== last[0] || first[1] !== last[1]) {
                    ring.push(posDegrees(first));
                }
                ds.entities.add({
                    polyline: {
                        positions: ring,
                        width: 2,
                        material: stroke,
                        clampToGround: true,
                    },
                });
            }
        };

        switch (g.type) {
            case "Point":
                addPoint(g.coordinates);
                break;
            case "MultiPoint":
                for (const c of g.coordinates) addPoint(c);
                break;
            case "LineString":
                addLine(g.coordinates);
                break;
            case "MultiLineString":
                for (const line of g.coordinates) addLine(line);
                break;
            case "Polygon":
                addPolygon(g.coordinates);
                break;
            case "MultiPolygon":
                for (const poly of g.coordinates) addPolygon(poly);
                break;
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
        // Classic OSM (same as Leaflet) — parks, forest, grass stay visible.
        return "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    }

    function tuneBasemapLayer(layer: { brightness: number; saturation: number; contrast: number; gamma: number }, dark: boolean) {
        // Soft dim in dark mode — keep land-cover greens readable (no Carto dark_all).
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

    async function boot() {
        if (!browser || !el || !creditSink) return;
        Cesium = await loadCesium();
        scratchSphere = new Cesium.BoundingSphere();
        const token = publicEnv.PUBLIC_CESIUM_ION_ACCESS_TOKEN ?? "";
        if (token) Cesium.Ion.defaultAccessToken = token;

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
            ...(token && Cesium.Terrain?.fromWorldTerrain
                ? { terrain: Cesium.Terrain.fromWorldTerrain() }
                : {}),
        });
        applyBasemapTheme();
        viewer.scene.globe.depthTestAgainstTerrain = false;
        // Allow getting close to photogrammetry / context polygons.
        viewer.scene.screenSpaceCameraController.minimumZoomDistance = 0.5;
        viewer.scene.screenSpaceCameraController.maximumZoomDistance =
            40_000_000;

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
            const picked = viewer.scene.pick(click.position);
            const entity = resolvePickedEntity(picked);
            const meta = entity ? entityMeta.get(entity) : undefined;
            if (entity && meta) {
                const { shift, ctrl, meta: cmd } = lastPointerMods;
                if (shift) {
                    layerSelection.addSelection(meta.layerName, meta.entityId);
                    lastFlownKey = selectionFlyKey();
                    syncAllSelectionStyles();
                    return;
                }
                if (ctrl || cmd) {
                    layerSelection.removeSelection(meta.layerName, meta.entityId);
                    lastFlownKey = selectionFlyKey();
                    syncAllSelectionStyles();
                    return;
                }
                layerSelection.selectSingle(meta.layerName, meta.entityId);
                // Mark flown so selectionSig effect does not re-fly on local pick.
                lastFlownKey = selectionFlyKey();
                syncAllSelectionStyles();
                return;
            }
            clearSelection();
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
            if (selectedEntity && popupHtml) updatePopupPosition();
            if (filterToView) scheduleInViewUpdate();
        });

        ready = true;
        await syncModels(false);
        await syncLayers();
        started = true;
        await frameScene();
        syncAllSelectionStyles();
        if (layerSelection.size > 0) {
            void flyToSelection(false);
        }
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

        // enableCollision: required for CLAMP_TO_GROUND against 3D Tiles.
        // Toggle with .show — never destroy on hide.
        for (const m of models) {
            const want = isModelVisible(m.hash);
            const existing = tilesetPrims.get(m.hash);
            if (existing) {
                existing.show = want;
                applyTilesetHeightOffset(existing, m.height_offset_m);
                continue;
            }
            if (!want || !m.root_url) continue;
            try {
                const resource = new Cesium.Resource({
                    url: m.root_url,
                    queryParameters: accessToken ? { token: accessToken } : {},
                    headers: accessToken
                        ? { Authorization: `Bearer ${accessToken}` }
                        : {},
                });
                const prim = await Cesium.Cesium3DTileset.fromUrl(resource, {
                    enableCollision: true,
                    // Sharper mesh when zoomed in on trench-scale models.
                    maximumScreenSpaceError: 4,
                });
                if (gen !== modelLoadGen || !readyHashes.has(m.hash)) {
                    if (!prim.isDestroyed?.()) prim.destroy();
                    continue;
                }
                prim.show = isModelVisible(m.hash);
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

        if (fly) await frameScene();
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
            const featureCount = layer.geojson?.features?.length ?? 0;
            const needsLoad =
                !ds ||
                (ds.__featureCount !== undefined &&
                    ds.__featureCount !== featureCount);

            if (needsLoad && featureCount > 0) {
                if (ds) destroyLayerSource(layer.name);
                const c = color(palette[i % palette.length]!);
                try {
                    ds = new Cesium.CustomDataSource(layer.name);
                    for (const feature of layer.geojson.features) {
                        addFeatureEntities(
                            ds,
                            feature,
                            layer.name,
                            c,
                            c.withAlpha(0.35),
                        );
                    }
                    if (gen !== layerLoadGen) return;
                    ds.__featureCount = featureCount;
                    ds.show = layer.visible;
                    await viewer.dataSources.add(ds);
                    layerSources.set(layer.name, ds);
                } catch (e) {
                    console.warn("layer", layer.name, e);
                }
            } else if (ds) {
                ds.show = layer.visible;
            }
        }

        if (started) {
            if (!hasFramed) void frameScene();
            applyHiddenVisibility();
            syncAllSelectionStyles();
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
            .map((l) => `${l.name}:${l.geojson?.features?.length ?? 0}`)
            .join("|") +
            `|hue:${themePrefs.accentHue}`,
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
        // Do not clear shared layerSelection — table / 2D may still use it.
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
        if (ev.key === "Enter" && measureEnabled) {
            ev.preventDefault();
            finishDraft3d();
            return;
        }
        if (ev.key !== "Escape") return;
        if (measureEnabled) {
            clearDraftMeasure();
            measureStatus = measureHint(measureMode, "3d");
            return;
        }
        if (ctxOpen) return;
        clearSelection();
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
            measureStatus = measureHint(measureMode, "3d");
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
        measureStatus = measureHint(measureMode, "3d");
    });
</script>

<div class="relative flex h-full min-h-0 flex-col">
    <div class="absolute top-2 left-2 z-20">
        <MapToolsRail
            bind:enabled={measureEnabled}
            bind:mode={measureMode}
            bind:selectionTool={selectionToolLocal}
            status={measureStatus}
            records={measureRecords}
            {canFinish}
            dim="3d"
            {fullscreen}
            {selectionCount}
            onZoomIn={zoomIn3d}
            onZoomOut={zoomOut3d}
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
        onClear={() => clearSelection()}
        onClose={closeContextMenu}
    />

    {#if hiddenCount > 0}
        <button
            type="button"
            class="absolute bottom-10 left-3 z-20 rounded-md border border-border bg-background/95 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm hover:text-foreground"
            onclick={showAllHiddenEntities}
        >
            {hiddenCount} hidden · Show all
        </button>
    {/if}

    {#if loading || !ready}
        <div
            class="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-md border border-border bg-background/95 px-2 py-1.5 text-xs shadow-sm backdrop-blur-sm"
        >
            <LoaderIcon class="size-3.5 animate-spin text-muted-foreground" />
            <span class="text-muted-foreground"
                >{loading ? "Loading…" : "Starting 3D…"}</span
            >
        </div>
    {/if}

    {#if ready && !loading && (models.length > 0 || layers.length > 0)}
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
                bind:filterToView
                {inViewEntityKeys}
                {inViewModelHashes}
            />
        </div>
    {/if}

    {#if ready && !loading && models.length === 0 && layers.length === 0}
        <div
            class="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 bg-background/70 px-6 text-center"
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

    {#if popupVisible && popupHtml}
        <div
            class="entity-popup pointer-events-auto absolute z-30 max-w-xs -translate-x-1/2 -translate-y-full rounded-md border border-border bg-background px-2.5 py-2 text-foreground shadow-lg"
            style="left: {popupX}px; top: {popupY - 12}px"
        >
            {@html popupHtml}
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
        class="cesium-scene min-h-0 flex-1 w-full bg-neutral-900"
    ></div>
    <div bind:this={creditSink} class="sr-only" aria-hidden="true"></div>

    <div
        class="absolute bottom-2 right-2 z-20 flex items-center gap-1.5 rounded bg-background/90 px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm ring-1 ring-border/60 backdrop-blur-sm"
    >
        <a
            class="hover:text-foreground hover:underline"
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer">© OpenStreetMap</a
        >
        <span class="opacity-40">·</span>
        <a
            class="inline-flex items-center gap-1 hover:text-foreground hover:underline"
            href="https://cesium.com/"
            target="_blank"
            rel="noopener noreferrer"
        >
            <img
                src="/cesium/Assets/Images/cesium_credit.png"
                alt=""
                class="h-3.5 w-auto"
            />
            Cesium
        </a>
    </div>
</div>

<style>
    :global(.cesium-scene .cesium-viewer-bottom),
    :global(.cesium-scene .cesium-widget-credits),
    :global(.cesium-scene .cesium-credit-lightbox) {
        display: none !important;
    }
    .entity-popup::after {
        content: "";
        position: absolute;
        left: 50%;
        bottom: -6px;
        margin-left: -6px;
        border: 6px solid transparent;
        border-top-color: var(--border);
        border-bottom: 0;
    }
</style>
