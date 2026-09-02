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
    import type { LayerGroup, Map as LeafletMap, MarkerClusterGroup } from "leaflet";
    import {
        createClusterGroup,
        createLeafletMap,
        destroyLeafletMap,
        haversineMetres,
        loadLeafletWithCluster,
        observeLeafletResize,
        tuneLeafletBasemap,
        viewBounds,
        type LeafletNS,
    } from "./leafletBoot";
    import MapLoading from "./MapLoading.svelte";
    import MapAttribution from "./MapAttribution.svelte";

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
    let mounted = $state(false);
    let mapReady = $state(false);
    let map = $state<LeafletMap | null>(null);
    let Lref: LeafletNS | null = null;
    let overlay: LayerGroup | null = null;
    let resultsCluster: MarkerClusterGroup | null = null;
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

    function syncSpatialGraphics() {
        const L = Lref;
        if (!map || !L || !overlay) return;
        overlay.clearLayers();
        const colors = mapColors();
        const fill = colors.marker || "#3b82f6";
        const stroke = colors.stroke || "#1d4ed8";
        const fillOpacity = 0.12;

        if (searchBBox) {
            overlay.addLayer(
                L.rectangle(
                    [
                        [searchBBox.south, searchBBox.west],
                        [searchBBox.north, searchBBox.east],
                    ],
                    {
                        color: stroke,
                        weight: 2,
                        fillColor: fill,
                        fillOpacity,
                        interactive: false,
                    },
                ),
            );
            return;
        }

        if (centerLat == null || centerLng == null) return;

        overlay.addLayer(
            L.circleMarker([centerLat, centerLng], {
                radius: 6,
                color: stroke,
                weight: 2,
                fillColor: fill,
                fillOpacity: 0.9,
                interactive: false,
            }),
        );
        const r =
            pointStep === "radius" && previewRadius != null
                ? previewRadius
                : radius;
        overlay.addLayer(
            L.circle([centerLat, centerLng], {
                radius: r,
                color: stroke,
                weight: 2,
                fillColor: fill,
                fillOpacity,
                interactive: false,
            }),
        );
    }

    function syncResultMarkers() {
        const L = Lref;
        if (!map || !L || !resultsCluster) return;
        resultsCluster.clearLayers();
        const colors = mapColors();
        const fill = colors.marker || "#3b82f6";
        const stroke = colors.stroke || "#1d4ed8";

        for (const r of results) {
            if (!r.bbox) continue;
            const c = bboxCentroid(r.bbox);
            if (!c) continue;
            const marker = L.circleMarker([c.lat, c.lng], {
                radius: 6,
                color: "#fff",
                weight: 2,
                fillColor: fill,
                fillOpacity: 1,
            });
            marker.bindTooltip(
                `<div class="text-[13px]"><strong>${escapeHTML(r.title)}</strong></div>`,
                {
                    direction: "top",
                    offset: [0, -8],
                    className: "leaflet-map-label",
                    opacity: 1,
                },
            );
            const slug = r.slug;
            marker.on("click", (e) => {
                L.DomEvent.stopPropagation(e);
                if (pointStep !== "idle") return;
                goto(`/${slug}`);
            });
            resultsCluster.addLayer(marker);
        }
    }

    function fitToContent() {
        const L = Lref;
        if (!map || !L) return;
        if (searchBBox) {
            map.fitBounds(
                [
                    [searchBBox.south, searchBBox.west],
                    [searchBBox.north, searchBBox.east],
                ],
                { padding: [16, 16], maxZoom: 12, animate: false },
            );
            return;
        }
        if (centerLat != null && centerLng != null) {
            const circle = L.circle([centerLat, centerLng], { radius });
            map.fitBounds(circle.getBounds(), {
                padding: [24, 24],
                maxZoom: 12,
                animate: false,
            });
            return;
        }
        const rb = resultsCluster?.getBounds();
        if (rb?.isValid()) {
            map.fitBounds(rb, { padding: [40, 40], maxZoom: 8, animate: false });
        }
    }

    function useMapArea() {
        if (!map) return;
        pointStep = "idle";
        previewRadius = null;
        const rect = viewBounds(map);
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

    function handleMapClick(lat: number, lng: number) {
        if (pointStep === "idle" && mode !== "point") return;

        if (pointStep === "idle") {
            pointStep = "centre";
        }

        if (pointStep === "centre") {
            searchBBox = null;
            centerLat = parseFloat(lat.toFixed(6));
            centerLng = parseFloat(lng.toFixed(6));
            previewRadius = DEFAULT_SEARCH_RADIUS;
            pointStep = "radius";
            syncSpatialGraphics();
            return;
        }

        if (pointStep === "radius" && centerLat != null && centerLng != null) {
            const metres = haversineMetres(centerLat, centerLng, lat, lng);
            radius = clampRadius(metres);
            previewRadius = null;
            pointStep = "idle";
            syncSpatialGraphics();
            onChange();
        }
    }

    function handleMapMove(lat: number, lng: number) {
        if (pointStep !== "radius" || centerLat == null || centerLng == null)
            return;
        const metres = haversineMetres(centerLat, centerLng, lat, lng);
        previewRadius = clampRadius(metres);
        syncSpatialGraphics();
    }

    $effect(() => {
        if (!mounted || !container || !browser) return;
        let cancelled = false;
        let cleanup: (() => void) | undefined;
        mapReady = false;

        void (async () => {
            try {
                const L = await loadLeafletWithCluster();
                if (cancelled || !container) return;

                const m = createLeafletMap(L, container);
                const stopResize = observeLeafletResize(m, container);
                overlay = L.layerGroup().addTo(m);
                resultsCluster = createClusterGroup(L, {
                    disableClusteringAtZoom: 12,
                    maxClusterRadius: 48,
                }).addTo(m);
                Lref = L;
                map = m;
                tuneLeafletBasemap(m, isDark());
                m.invalidateSize();

                m.on("click", (e) => {
                    handleMapClick(e.latlng.lat, e.latlng.lng);
                });
                m.on("mousemove", (e) => {
                    handleMapMove(e.latlng.lat, e.latlng.lng);
                });

                if (centerLat != null && centerLng != null) {
                    m.setView([centerLat, centerLng], 7);
                } else if (searchBBox) {
                    m.fitBounds(
                        [
                            [searchBBox.south, searchBBox.west],
                            [searchBBox.north, searchBBox.east],
                        ],
                        { animate: false },
                    );
                }

                syncResultMarkers();
                syncSpatialGraphics();
                fitToContent();
                if (!cancelled) mapReady = true;

                cleanup = () => {
                    stopResize();
                    overlay = null;
                    resultsCluster = null;
                    Lref = null;
                    destroyLeafletMap(m);
                    map = null;
                };
            } catch (e) {
                console.warn("SpatialMap Leaflet failed", e);
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
        if (map && Lref) {
            tuneLeafletBasemap(map, isDark());
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
        if (map && Lref) {
            tuneLeafletBasemap(map, isDark());
            syncSpatialGraphics();
        }
    });

    $effect(() => {
        if (!map) return;
        map.getContainer().style.cursor = drafting ? "crosshair" : "";
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
        class="leaflet-locator relative rounded-lg border border-border overflow-hidden bg-secondary/20 h-72 {drafting
            ? 'ring-2 ring-primary/40 cursor-crosshair'
            : ''}"
    >
        <div bind:this={container} class="w-full h-full"></div>
        {#if !mapReady}
            <MapLoading />
        {/if}
        {#if mapReady}
            <MapAttribution />
        {/if}
        {#if mode === "none" || drafting}
            <div
                class="leaflet-map-chrome pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-background/90 to-transparent px-3 pb-3 pt-8"
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
