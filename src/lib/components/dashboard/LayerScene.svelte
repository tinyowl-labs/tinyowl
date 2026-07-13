<script lang="ts">
    import { browser } from "$app/environment";
    import { env as publicEnv } from "$env/dynamic/public";
    import { onDestroy, onMount } from "svelte";
    import BoxIcon from "@lucide/svelte/icons/box";
    import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
    import LayersIcon from "@lucide/svelte/icons/layers";
    import LoaderIcon from "@lucide/svelte/icons/loader";
    import type { ProjectTileset } from "./tilesetTypes";
    import { mapLayerPalette, themePrefs } from "$lib/stores/theme.svelte";
    import {
        buildEntityPopupHtml,
        featureEntityId,
        isEntityHighlighted,
    } from "./mapEntityPopup";

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
        highlightId?: string;
        highlightLayer?: string;
        onSelectTileset?: (hash: string) => void;
        onSelectEntity?: (layerName: string, entityId: string) => void;
        onClearEntity?: () => void;
    };

    let {
        projectSlug,
        accessToken = "",
        tilesets = [],
        selectedHash = "",
        loading = false,
        layers = [],
        rows = {},
        highlightId = "",
        highlightLayer = "",
        onSelectTileset,
        onSelectEntity,
        onClearEntity,
    }: Props = $props();

    let el = $state<HTMLDivElement>();
    let creditSink = $state<HTMLDivElement>();
    let error = $state("");
    let ready = $state(false);
    let modelsOpen = $state(true);
    let layersOpen = $state(true);
    let modelVis = $state<Record<string, boolean>>({});
    let selectedLabel = $state<string | null>(null);
    let popupHtml = $state("");
    let popupX = $state(0);
    let popupY = $state(0);
    let popupVisible = $state(false);

    let Cesium: any;
    let viewer: any;
    let clickHandler: any;
    let postRenderRemover: (() => void) | null = null;
    const tilesetPrims = new Map<string, any>();
    const layerSources = new Map<string, any>();
    const entityMeta = new WeakMap<object, EntityMeta>();
    let selectedEntity: any = null;
    let layerLoadGen = 0;
    let modelLoadGen = 0;
    let started = false;
    let appliedHighlight = "";
    let scratchSphere: any;

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

    function color(css: string, a = 0.75) {
        try {
            return Cesium.Color.fromCssColorString(css).withAlpha(a);
        } catch {
            return Cesium.Color.DODGERBLUE.withAlpha(a);
        }
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

    function clearSelection(notify = true) {
        if (selectedEntity) applyEntityStyle(selectedEntity, false);
        selectedEntity = null;
        popupVisible = false;
        popupHtml = "";
        selectedLabel = null;
        if (notify) onClearEntity?.();
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

    function selectEntity(
        entity: any,
        layerName: string,
        entityId: string,
        notify = true,
    ) {
        if (selectedEntity && selectedEntity !== entity) {
            applyEntityStyle(selectedEntity, false);
        }
        selectedEntity = entity;
        applyEntityStyle(entity, true);
        selectedLabel = `${layerName.replace(/_/g, " ")} · ${entityId}`;
        popupHtml = buildEntityPopupHtml(layerName, entityId, rows);
        popupVisible = true;
        updatePopupPosition();
        appliedHighlight = `${layerName}:${entityId}`;
        if (notify) {
            onSelectEntity?.(layerName, entityId);
        }
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
            if (z !== 0) return true;
        }
        return false;
    }

    function posDegrees(c: GeoJSON.Position) {
        return Cesium.Cartesian3.fromDegrees(
            c[0],
            c[1],
            c.length > 2 && typeof c[2] === "number" ? c[2] : 0,
        );
    }

    function applyEntityStyle(entity: any, selected: boolean) {
        const meta = entityMeta.get(entity);
        if (!meta || !Cesium) return;
        const c = meta.base;
        if (meta.kind === "point" && entity.point) {
            entity.point.pixelSize = selected ? 14 : 8;
            entity.point.color = selected ? c : c;
            entity.point.outlineColor = selected
                ? Cesium.Color.WHITE
                : Cesium.Color.WHITE.withAlpha(0.85);
            entity.point.outlineWidth = selected ? 3 : 1;
        } else if (meta.kind === "polyline" && entity.polyline) {
            entity.polyline.width = selected ? 5 : 2;
            entity.polyline.material = selected
                ? Cesium.Color.WHITE
                : c;
        } else if (meta.kind === "polygon" && entity.polygon) {
            entity.polygon.material = c.withAlpha(selected ? 0.55 : 0.35);
            entity.polygon.outlineColor = selected
                ? Cesium.Color.WHITE
                : c;
            entity.polygon.outlineWidth = selected ? 3 : 2;
        }
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
        entity.name = `${layerName}:${entityId}`;
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
                    outline: true,
                    outlineColor: stroke,
                    outlineWidth: 2,
                    // Drape on terrain + 3D tiles so polygons are pickable on the mesh
                    ...(useHeights
                        ? { perPositionHeight: true }
                        : {
                              classificationType:
                                  Cesium.ClassificationType.BOTH,
                          }),
                },
            });
            trackEntity(entity, layerName, entityId, "polygon", stroke);
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

    function findHighlightEntity(): {
        entity: any;
        layerName: string;
        entityId: string;
    } | null {
        if (!highlightId) return null;
        const names = layers.map((l) => l.name);
        for (const [, ds] of layerSources) {
            for (const entity of ds.entities.values) {
                const meta = entityMeta.get(entity);
                if (!meta) continue;
                if (
                    isEntityHighlighted(
                        meta.layerName,
                        meta.entityId,
                        highlightId,
                        highlightLayer,
                        names,
                    )
                ) {
                    return {
                        entity,
                        layerName: meta.layerName,
                        entityId: meta.entityId,
                    };
                }
            }
        }
        return null;
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
                    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                    maximumLevel: 19,
                    credit: "",
                }),
            ),
            ...(token && Cesium.Terrain?.fromWorldTerrain
                ? { terrain: Cesium.Terrain.fromWorldTerrain() }
                : {}),
        });
        viewer.scene.globe.depthTestAgainstTerrain = false;

        clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        clickHandler.setInputAction((click: { position: unknown }) => {
            const picked = viewer.scene.pick(click.position);
            const entity = resolvePickedEntity(picked);
            const meta = entity ? entityMeta.get(entity) : undefined;
            if (entity && meta) {
                void selectEntity(entity, meta.layerName, meta.entityId);
                return;
            }
            clearSelection();
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        postRenderRemover = viewer.scene.postRender.addEventListener(() => {
            if (selectedEntity && popupHtml) updatePopupPosition();
        });

        ready = true;
        await syncModels(true);
        await syncLayers();
        started = true;
        tryHighlight();
    }

    function tryHighlight() {
        if (!highlightId) {
            if (appliedHighlight) {
                clearSelection(false);
                appliedHighlight = "";
            }
            return;
        }
        const key = `${highlightLayer || ""}:${highlightId}`;
        if (key === appliedHighlight && selectedEntity) return;
        const hit = findHighlightEntity();
        if (!hit) {
            selectedLabel = `Entity ${highlightId} not found on map`;
            return;
        }
        selectEntity(hit.entity, hit.layerName, hit.entityId, false);
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
                });
                if (gen !== modelLoadGen || !readyHashes.has(m.hash)) {
                    if (!prim.isDestroyed?.()) prim.destroy();
                    continue;
                }
                prim.show = isModelVisible(m.hash);
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

        // Default camera: selected tileset overview (not entity zoom).
        const focus = selected?.hash
            ? tilesetPrims.get(selected.hash)
            : undefined;
        if (fly && focus) {
            await viewer.flyTo(focus, { duration: 1.2 });
        }
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

        if (started) tryHighlight();
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
        highlightId;
        highlightLayer;
        if (!ready || !started) return;
        tryHighlight();
    });

    onDestroy(() => {
        clearSelection(false);
        postRenderRemover?.();
        postRenderRemover = null;
        try {
            clickHandler?.destroy?.();
        } catch {
            /* ignore */
        }
        clickHandler = null;
        for (const hash of [...tilesetPrims.keys()]) destroyTileset(hash);
        for (const name of [...layerSources.keys()]) destroyLayerSource(name);
        try {
            viewer?.destroy?.();
        } catch {
            /* ignore */
        }
        viewer = null;
    });
</script>

<div class="relative flex h-full min-h-0 flex-col">
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
        <div
            class="absolute top-2 right-2 z-10 max-h-[min(70%,24rem)] w-52 overflow-y-auto rounded-lg border border-border bg-background/95 p-1.5 text-xs shadow-lg backdrop-blur-sm"
        >
            {#if models.length > 0}
                <button
                    type="button"
                    class="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-secondary"
                    onclick={() => (modelsOpen = !modelsOpen)}
                >
                    <ChevronDownIcon
                        class="size-3.5 shrink-0 transition-transform {modelsOpen
                            ? ''
                            : '-rotate-90'}"
                    />
                    <BoxIcon class="size-3.5 shrink-0" />
                    <span class="truncate">3D models</span>
                    <span class="ml-auto tabular-nums opacity-60"
                        >{models.length}</span
                    >
                </button>
                {#if modelsOpen}
                    <div class="mb-1 space-y-0.5">
                        {#each models as m, idx}
                            {@const visible = isModelVisible(m.hash)}
                            <button
                                type="button"
                                class="flex w-full items-center gap-2 rounded-md px-1.5 py-1 hover:bg-secondary"
                                onclick={() => toggleModel(m.hash)}
                                title={m.label || m.hash}
                            >
                                <span
                                    class="size-2.5 shrink-0 rounded-full"
                                    style="background: {palette[
                                        idx % palette.length
                                    ]}; opacity: {visible ? '1' : '0.25'}"
                                ></span>
                                <span
                                    class="truncate {visible ? '' : 'opacity-40'}"
                                >
                                    {m.label || m.hash.slice(0, 12)}
                                </span>
                            </button>
                        {/each}
                        {#if pending > 0}
                            <p
                                class="px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            >
                                {pending} processing…
                            </p>
                        {/if}
                    </div>
                {/if}
            {/if}

            {#if layers.length > 0}
                <button
                    type="button"
                    class="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-secondary"
                    onclick={() => (layersOpen = !layersOpen)}
                >
                    <ChevronDownIcon
                        class="size-3.5 shrink-0 transition-transform {layersOpen
                            ? ''
                            : '-rotate-90'}"
                    />
                    <LayersIcon class="size-3.5 shrink-0" />
                    <span class="truncate">Layers</span>
                    <span class="ml-auto tabular-nums opacity-60"
                        >{layers.length}</span
                    >
                </button>
                {#if layersOpen}
                    <div class="space-y-0.5">
                        {#each layers as layer, idx}
                            <button
                                type="button"
                                class="flex w-full items-center gap-2 rounded-md px-1.5 py-1 hover:bg-secondary"
                                onclick={() => toggleLayer(idx)}
                            >
                                <span
                                    class="size-2.5 shrink-0 rounded-full"
                                    style="background: {palette[
                                        idx % palette.length
                                    ]}; opacity: {layer.visible ? '1' : '0.25'}"
                                ></span>
                                <span
                                    class="truncate {layer.visible
                                        ? ''
                                        : 'opacity-40'}"
                                >
                                    {layer.name.replace(/_/g, " ")}
                                </span>
                                <span
                                    class="ml-auto shrink-0 text-[10px] text-muted-foreground"
                                >
                                    {layer.geojson.features.length}
                                </span>
                            </button>
                        {/each}
                    </div>
                {/if}
            {/if}
        </div>
    {/if}

    {#if ready && !loading && models.length === 0}
        <div
            class="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 bg-background/70 px-6 text-center"
        >
            <BoxIcon class="size-10 text-muted-foreground/30" />
            <p class="text-sm">No 3D models ready</p>
            <p class="max-w-sm text-xs text-muted-foreground">
                Upload a georeferenced <code class="font-mono">.3tz</code> from Artefacts.
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

    {#if selectedLabel}
        <div
            class="absolute bottom-12 left-3 z-10 max-w-sm rounded-md border border-border bg-background/95 px-2.5 py-1.5 text-xs text-foreground shadow-sm backdrop-blur-sm"
        >
            <span class="text-muted-foreground">Selected · </span>{selectedLabel}
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
