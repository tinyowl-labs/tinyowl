<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";
    import { isDark, mapColors, themePrefs } from "$lib/stores/theme.svelte";
    import {
        DEFAULT_SEARCH_RADIUS,
        formatRadius,
        type SearchBBox,
    } from "$lib/search/params";
    import LocateFixedIcon from "@lucide/svelte/icons/locate-fixed";
    import Maximize2Icon from "@lucide/svelte/icons/maximize-2";
    import CrosshairIcon from "@lucide/svelte/icons/crosshair";
    import MapIcon from "@lucide/svelte/icons/map";
    import {
        cesiumColorFromCss,
        circlePositions,
        createCesiumMap,
        destroyCesiumViewer,
        haversineMetres,
        loadCesiumGlobal,
        pickLatLng,
        tuneCesiumBasemap,
        viewRectangle,
    } from "./cesiumBoot";
    import CesiumLoading from "./CesiumLoading.svelte";
    import CesiumAttribution from "./CesiumAttribution.svelte";

    type ResultMarker = {
        slug: string;
        title: string;
        bbox: string | null;
    };

    type SpatialMode = "none" | "area" | "point";
    /** Point-mode gesture: wait for centre, then radius edge. */
    type PointStep = "idle" | "centre" | "radius";

    type Props = {
        centerLat: number | null;
        centerLng: number | null;
        radius: number;
        searchBBox: SearchBBox | null;
        results: ResultMarker[];
        onChange: () => void;
    };

    let {
        centerLat = $bindable(null),
        centerLng = $bindable(null),
        radius = $bindable(DEFAULT_SEARCH_RADIUS),
        searchBBox = $bindable(null),
        results = [],
        onChange,
    }: Props = $props();

    const MIN_RADIUS_M = 200;

    let container = $state<HTMLDivElement>();
    let creditSink = $state<HTMLDivElement>();
    let mounted = $state(false);
    let mapReady = $state(false);
    let viewer: any = null;
    let Cesium: any = null;
    let overlayDs: any = null;
    let resultsDs: any = null;
    let clickHandler: any = null;
    let pointStep = $state<PointStep>("idle");
    /** Live radius while dragging/moving before second click. */
    let previewRadius = $state<number | null>(null);

    const mode = $derived<SpatialMode>(
        searchBBox
            ? "area"
            : centerLat != null && centerLng != null && pointStep === "idle"
              ? "point"
              : pointStep !== "idle"
                ? "point"
                : "none",
    );

    const drafting = $derived(pointStep === "centre" || pointStep === "radius");

    onMount(() => {
        mounted = true;
    });

    function bboxCentroid(bbox: string): { lat: number; lng: number } | null {
        try {
            const geojson = JSON.parse(bbox);
            const coords = geojson?.coordinates?.[0];
            if (!coords || coords.length < 4) return null;
            let minLat = Infinity,
                maxLat = -Infinity,
                minLng = Infinity,
                maxLng = -Infinity;
            for (const c of coords) {
                if (c[1] < minLat) minLat = c[1];
                if (c[1] > maxLat) maxLat = c[1];
                if (c[0] < minLng) minLng = c[0];
                if (c[0] > maxLng) maxLng = c[0];
            }
            return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
        } catch {
            return null;
        }
    }

    function escapeHTML(str: string): string {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function clampRadius(m: number): number {
        return Math.max(MIN_RADIUS_M, Math.round(m));
    }

    function clearOverlay() {
        overlayDs?.entities?.removeAll?.();
    }

    function syncSpatialGraphics() {
        if (!viewer || !Cesium || !overlayDs) return;
        const colors = mapColors();
        const marker =
            cesiumColorFromCss(Cesium, colors.marker, "#3b82f6") ??
            Cesium.Color.DODGERBLUE;
        const stroke =
            cesiumColorFromCss(Cesium, colors.stroke, "#1d4ed8") ??
            Cesium.Color.WHITE;
        clearOverlay();

        if (searchBBox) {
            const west = searchBBox.west;
            const south = searchBBox.south;
            const east = searchBBox.east;
            const north = searchBBox.north;
            const ring = Cesium.Cartesian3.fromDegreesArray([
                west,
                south,
                east,
                south,
                east,
                north,
                west,
                north,
                west,
                south,
            ]);
            overlayDs.entities.add({
                polygon: {
                    hierarchy: ring,
                    material: marker.withAlpha(0.12),
                    outline: false,
                    height: 0,
                },
                polyline: {
                    positions: ring,
                    width: 2,
                    material: stroke,
                    clampToGround: true,
                },
            });
            viewer.scene.requestRender();
            return;
        }

        if (centerLat == null || centerLng == null) {
            viewer.scene.requestRender();
            return;
        }

        overlayDs.entities.add({
            position: Cesium.Cartesian3.fromDegrees(centerLng, centerLat, 0),
            point: {
                pixelSize: 12,
                color: marker,
                outlineColor: stroke,
                outlineWidth: 2,
                heightReference: Cesium.HeightReference.NONE,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        });

        const r =
            pointStep === "radius" && previewRadius != null
                ? previewRadius
                : radius;
        const circle = circlePositions(Cesium, centerLat, centerLng, r);
        overlayDs.entities.add({
            polygon: {
                hierarchy: circle,
                material: marker.withAlpha(0.12),
                outline: false,
                height: 0,
            },
            polyline: {
                positions: circle,
                width: 2,
                material: stroke,
                clampToGround: true,
            },
        });
        viewer.scene.requestRender();
    }

    function syncResultMarkers() {
        if (!viewer || !Cesium || !resultsDs) return;
        resultsDs.entities.removeAll();
        const colors = mapColors();
        const marker =
            cesiumColorFromCss(Cesium, colors.marker, "#3b82f6") ??
            Cesium.Color.DODGERBLUE;
        const stroke =
            cesiumColorFromCss(Cesium, colors.stroke, "#1d4ed8") ??
            Cesium.Color.WHITE;

        for (const r of results) {
            if (!r.bbox) continue;
            const c = bboxCentroid(r.bbox);
            if (!c) continue;
            resultsDs.entities.add({
                id: `result:${r.slug}`,
                position: Cesium.Cartesian3.fromDegrees(c.lng, c.lat, 0),
                point: {
                    pixelSize: 9,
                    color: marker.withAlpha(0.85),
                    outlineColor: stroke,
                    outlineWidth: 1.5,
                    heightReference: Cesium.HeightReference.NONE,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
                description: `<div class="text-[13px]">
                    <strong>${escapeHTML(r.title)}</strong><br/>
                    <a href="/${r.slug}" class="text-xs">View project →</a>
                </div>`,
                properties: { slug: r.slug },
            });
        }
        viewer.scene.requestRender();
    }

    function fitToContent() {
        if (!viewer || !Cesium) return;
        if (searchBBox) {
            const rect = Cesium.Rectangle.fromDegrees(
                searchBBox.west,
                searchBBox.south,
                searchBBox.east,
                searchBBox.north,
            );
            viewer.camera.setView({ destination: rect });
            viewer.scene.requestRender();
            return;
        }
        const positions: any[] = [];
        if (centerLat != null && centerLng != null) {
            positions.push(
                Cesium.Cartesian3.fromDegrees(centerLng, centerLat, 0),
            );
            const deg = radius / 111320;
            positions.push(
                Cesium.Cartesian3.fromDegrees(centerLng, centerLat + deg, 0),
            );
            positions.push(
                Cesium.Cartesian3.fromDegrees(centerLng, centerLat - deg, 0),
            );
        }
        for (const r of results) {
            if (!r.bbox) continue;
            const c = bboxCentroid(r.bbox);
            if (c) {
                positions.push(
                    Cesium.Cartesian3.fromDegrees(c.lng, c.lat, 0),
                );
            }
        }
        if (positions.length === 0) return;
        if (positions.length === 1) {
            viewer.camera.setView({
                destination: Cesium.Cartesian3.fromDegrees(
                    Cesium.Cartographic.fromCartesian(positions[0]).longitude *
                        (180 / Math.PI),
                    Cesium.Cartographic.fromCartesian(positions[0]).latitude *
                        (180 / Math.PI),
                    500_000,
                ),
            });
        } else {
            const bs = Cesium.BoundingSphere.fromPoints(positions);
            viewer.camera.flyToBoundingSphere(bs, {
                duration: 0,
                offset: new Cesium.HeadingPitchRange(
                    0,
                    -Cesium.Math.PI_OVER_TWO,
                    Math.max(bs.radius * 2.5, 50_000),
                ),
            });
        }
        viewer.scene.requestRender();
    }

    function useMapArea() {
        if (!viewer || !Cesium) return;
        pointStep = "idle";
        previewRadius = null;
        const rect = viewRectangle(viewer, Cesium);
        if (!rect) return;
        searchBBox = {
            west: parseFloat(rect.west.toFixed(6)),
            south: parseFloat(rect.south.toFixed(6)),
            east: parseFloat(rect.east.toFixed(6)),
            north: parseFloat(rect.north.toFixed(6)),
        };
        centerLat = null;
        centerLng = null;
        syncSpatialGraphics();
        onChange();
    }

    function startPointMode() {
        searchBBox = null;
        centerLat = null;
        centerLng = null;
        previewRadius = null;
        radius = DEFAULT_SEARCH_RADIUS;
        pointStep = "centre";
        syncSpatialGraphics();
        onChange();
    }

    function clearSpatial() {
        centerLat = null;
        centerLng = null;
        searchBBox = null;
        radius = DEFAULT_SEARCH_RADIUS;
        pointStep = "idle";
        previewRadius = null;
        syncSpatialGraphics();
        onChange();
    }

    function handleMapClick(position: { x: number; y: number }) {
        if (!viewer || !Cesium) return;

        // Result marker pick takes priority when not drafting.
        if (pointStep === "idle") {
            const picked = viewer.scene.pick(position);
            const entity = picked?.id;
            const slug =
                entity?.properties?.slug?.getValue?.() ??
                entity?.properties?.slug;
            if (slug) {
                goto(`/${String(slug)}`);
                return;
            }
        }

        if (pointStep === "idle" && mode !== "point") return;

        if (pointStep === "idle") {
            pointStep = "centre";
        }

        const ll = pickLatLng(viewer, Cesium, position);
        if (!ll) return;

        if (pointStep === "centre") {
            searchBBox = null;
            centerLat = parseFloat(ll.lat.toFixed(6));
            centerLng = parseFloat(ll.lng.toFixed(6));
            previewRadius = DEFAULT_SEARCH_RADIUS;
            pointStep = "radius";
            syncSpatialGraphics();
            return;
        }

        if (pointStep === "radius" && centerLat != null && centerLng != null) {
            const metres = haversineMetres(
                centerLat,
                centerLng,
                ll.lat,
                ll.lng,
            );
            radius = clampRadius(metres);
            previewRadius = null;
            pointStep = "idle";
            syncSpatialGraphics();
            onChange();
        }
    }

    function handleMapMove(position: { x: number; y: number }) {
        if (
            pointStep !== "radius" ||
            centerLat == null ||
            centerLng == null ||
            !viewer ||
            !Cesium
        )
            return;
        const ll = pickLatLng(viewer, Cesium, position);
        if (!ll) return;
        const metres = haversineMetres(centerLat, centerLng, ll.lat, ll.lng);
        previewRadius = clampRadius(metres);
        syncSpatialGraphics();
    }

    $effect(() => {
        if (!mounted || !container || !creditSink || !browser) return;
        let cancelled = false;
        let cleanup: (() => void) | undefined;
        mapReady = false;

        void (async () => {
            try {
                Cesium = await loadCesiumGlobal();
                if (cancelled || !container || !creditSink) return;

                viewer = createCesiumMap(Cesium, container, creditSink);
                tuneCesiumBasemap(viewer, Cesium, isDark());

                overlayDs = new Cesium.CustomDataSource("spatial-overlay");
                resultsDs = new Cesium.CustomDataSource("spatial-results");
                await viewer.dataSources.add(overlayDs);
                await viewer.dataSources.add(resultsDs);

                if (centerLat != null && centerLng != null) {
                    await viewer.camera.flyTo({
                        destination: Cesium.Cartesian3.fromDegrees(
                            centerLng,
                            centerLat,
                            500_000,
                        ),
                        duration: 0.6,
                    });
                } else if (searchBBox) {
                    await viewer.camera.flyTo({
                        destination: Cesium.Rectangle.fromDegrees(
                            searchBBox.west,
                            searchBBox.south,
                            searchBBox.east,
                            searchBBox.north,
                        ),
                        duration: 0.6,
                    });
                } else {
                    await viewer.camera.flyTo({
                        destination: Cesium.Cartesian3.fromDegrees(0, 20, 20_000_000),
                        duration: 0.6,
                    });
                }

                clickHandler = new Cesium.ScreenSpaceEventHandler(
                    viewer.scene.canvas,
                );
                clickHandler.setInputAction(
                    (click: { position: { x: number; y: number } }) => {
                        handleMapClick(click.position);
                    },
                    Cesium.ScreenSpaceEventType.LEFT_CLICK,
                );
                clickHandler.setInputAction(
                    (move: { endPosition: { x: number; y: number } }) => {
                        handleMapMove(move.endPosition);
                    },
                    Cesium.ScreenSpaceEventType.MOUSE_MOVE,
                );

                syncResultMarkers();
                syncSpatialGraphics();
                fitToContent();
                if (!cancelled) mapReady = true;

                cleanup = () => {
                    try {
                        clickHandler?.destroy?.();
                    } catch {
                        /* ignore */
                    }
                    clickHandler = null;
                    destroyCesiumViewer(viewer);
                    viewer = null;
                    overlayDs = null;
                    resultsDs = null;
                    Cesium = null;
                };
            } catch (e) {
                console.warn("SpatialMap Cesium failed", e);
                // Release the loading overlay even on failure.
                if (!cancelled) mapReady = true;
            }
        })();

        return () => {
            cancelled = true;
            cleanup?.();
        };
    });

    $effect(() => {
        results;
        themePrefs.accentHue;
        themePrefs.bgBase;
        if (viewer && Cesium) {
            tuneCesiumBasemap(viewer, Cesium, isDark());
            syncResultMarkers();
        }
    });

    $effect(() => {
        centerLat;
        centerLng;
        radius;
        searchBBox;
        pointStep;
        previewRadius;
        themePrefs.accentHue;
        themePrefs.bgBase;
        if (viewer && Cesium) {
            tuneCesiumBasemap(viewer, Cesium, isDark());
            syncSpatialGraphics();
        }
    });
</script>

<div class="space-y-2">
    <div
        class="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1"
    >
        <button
            type="button"
            onclick={useMapArea}
            class="inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors {mode ===
            'area'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'}"
            title="Search projects intersecting the visible map area"
        >
            <MapIcon class="size-3" />
            Map area
        </button>
        <button
            type="button"
            onclick={startPointMode}
            class="inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors {mode ===
                'point' || drafting
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'}"
            title="Click once for the centre, again for the radius"
        >
            <CrosshairIcon class="size-3" />
            Point + radius
        </button>
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
        {#if mode === "area"}
            <button
                type="button"
                onclick={useMapArea}
                class="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Update area to the current viewport"
            >
                <LocateFixedIcon class="size-3" />
                Update to view
            </button>
        {/if}
        <button
            type="button"
            onclick={fitToContent}
            class="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
            <Maximize2Icon class="size-3" />
            Fit
        </button>
        {#if mode !== "none" || drafting}
            <button
                type="button"
                onclick={clearSpatial}
                class="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
            >
                Clear
            </button>
        {/if}
    </div>

    <div
        class="relative rounded-lg border border-border overflow-hidden bg-secondary/20 h-72 {drafting
            ? 'ring-2 ring-primary/40 cursor-crosshair'
            : ''}"
    >
        <div bind:this={container} class="w-full h-full"></div>
        <div bind:this={creditSink} class="hidden"></div>
        {#if !mapReady}
            <CesiumLoading />
        {/if}
        {#if mapReady}
            <CesiumAttribution />
        {/if}
        {#if mode === "none" || drafting}
            <div
                class="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-background/90 to-transparent px-3 pb-3 pt-8"
            >
                <p class="text-xs text-muted-foreground">
                    {#if pointStep === "centre"}
                        Click to set the search centre
                    {:else if pointStep === "radius"}
                        Click again to set the radius
                        {#if previewRadius != null}
                            <span class="text-foreground font-medium">
                                ({formatRadius(previewRadius)})</span
                            >
                        {/if}
                    {:else}
                        Choose Map area or Point + radius
                    {/if}
                </p>
            </div>
        {/if}
    </div>

    {#if mode === "area" && searchBBox}
        <p class="text-[11px] text-muted-foreground">
            Searching the visible map rectangle
            <span class="tabular-nums"
                >({searchBBox.west.toFixed(1)}…{searchBBox.east.toFixed(1)},
                {searchBBox.south.toFixed(1)}…{searchBBox.north.toFixed(1)})</span
            >
        </p>
    {:else if mode === "point" && centerLat != null && centerLng != null && pointStep === "idle"}
        <p class="text-[11px] tabular-nums text-muted-foreground">
            Centre {centerLat.toFixed(4)}, {centerLng.toFixed(4)} · radius
            <span class="text-foreground font-medium">{formatRadius(radius)}</span>
            <button
                type="button"
                onclick={startPointMode}
                class="ml-2 text-muted-foreground hover:text-foreground"
            >
                Redraw
            </button>
        </p>
    {/if}
</div>
