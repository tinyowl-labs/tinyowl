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
    import CrosshairIcon from "@lucide/svelte/icons/crosshair";
    import MapIcon from "@lucide/svelte/icons/map";
    import XIcon from "@lucide/svelte/icons/x";
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
        bbox?: string | null;
        lat?: number | null;
        lng?: number | null;
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
        onChange?: () => void;
        /** Fit the map to result markers when no spatial filter is set. */
        fitResults?: boolean;
        class?: string;
    };

    let {
        centerLat = $bindable(null),
        centerLng = $bindable(null),
        radius = $bindable(DEFAULT_SEARCH_RADIUS),
        searchBBox = $bindable(null),
        results = [],
        onChange,
        fitResults = false,
        class: klass = "",
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
        pointStep !== "idle"
            ? "point"
            : searchBBox
              ? "area"
              : centerLat != null && centerLng != null
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
            let lat = r.lat ?? null;
            let lng = r.lng ?? null;
            if ((lat == null || lng == null) && r.bbox) {
                const c = bboxCentroid(r.bbox);
                if (c) {
                    lat = c.lat;
                    lng = c.lng;
                }
            }
            if (
                lat == null ||
                lng == null ||
                !Number.isFinite(lat) ||
                !Number.isFinite(lng)
            )
                continue;
            const marker = L.circleMarker([lat, lng], {
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

    function fitSpatialFilter(animate = false) {
        const L = Lref;
        if (!map || !L) return;
        if (searchBBox) {
            map.fitBounds(
                [
                    [searchBBox.south, searchBBox.west],
                    [searchBBox.north, searchBBox.east],
                ],
                { padding: [16, 16], maxZoom: 12, animate },
            );
            return;
        }
        if (centerLat != null && centerLng != null) {
            // Don't use L.circle().getBounds() — an unattached Circle has no
            // `_map` and throws layerPointToLatLng in Leaflet 1.x.
            const r = radius > 0 ? radius : DEFAULT_SEARCH_RADIUS;
            const dLat = (r / 6371000) * (180 / Math.PI);
            const cos = Math.cos((centerLat * Math.PI) / 180);
            const dLng = cos > 1e-6 ? dLat / cos : 180;
            const bounds: [[number, number], [number, number]] = [
                [centerLat - dLat, centerLng - dLng],
                [centerLat + dLat, centerLng + dLng],
            ];
            if (animate) {
                map.flyToBounds(bounds, {
                    padding: [28, 28],
                    maxZoom: 16,
                    duration: 0.55,
                });
            } else {
                map.fitBounds(bounds, {
                    padding: [28, 28],
                    maxZoom: 16,
                    animate: false,
                });
            }
            return;
        }
        if (fitResults) {
            const rb = resultsCluster?.getBounds();
            if (rb?.isValid()) {
                map.fitBounds(rb, {
                    padding: [40, 40],
                    maxZoom: 8,
                    animate,
                });
            }
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
        onChange?.();
    }

    function startPointMode() {
        previewRadius = null;
        pointStep = "centre";
        syncSpatialGraphics();
    }

    function clearSpatial() {
        centerLat = null;
        centerLng = null;
        searchBBox = null;
        radius = DEFAULT_SEARCH_RADIUS;
        pointStep = "idle";
        previewRadius = null;
        syncSpatialGraphics();
        onChange?.();
    }

    function handleMapClick(lat: number, lng: number) {
        if (pointStep === "idle") return;

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
            onChange?.();
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
                fitSpatialFilter();
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

    /** Refit when a committed filter arrives (e.g. a Pleiades place), not while drafting. */
    let lastFitKey = "";
    $effect(() => {
        const key = searchBBox
            ? `b:${searchBBox.west},${searchBBox.south},${searchBBox.east},${searchBBox.north}`
            : centerLat != null && centerLng != null && pointStep === "idle"
              ? `p:${centerLat},${centerLng},${radius}`
              : "";
        if (!key) lastFitKey = "";
        if (!map || !Lref || pointStep !== "idle") return;
        if (key && key !== lastFitKey) {
            lastFitKey = key;
            fitSpatialFilter(true);
        }
    });

    $effect(() => {
        if (!map) return;
        map.getContainer().style.cursor = drafting ? "crosshair" : "";
    });
</script>

<div class="relative min-h-0 {klass || 'h-full'}">
    <div
        class="leaflet-locator relative h-full min-h-0 overflow-hidden rounded-lg border border-border bg-secondary/20 {drafting
            ? 'ring-2 ring-primary/40 cursor-crosshair'
            : ''}"
    >
        <div bind:this={container} class="absolute inset-0"></div>
        {#if !mapReady}
            <MapLoading />
        {/if}
        {#if mapReady}
            <MapAttribution />
        {/if}

        <div
            class="leaflet-map-chrome pointer-events-auto absolute inset-x-2 top-2 z-10 flex items-center gap-1 rounded-lg border border-border bg-background/90 p-0.5 text-[11px] shadow-sm backdrop-blur-sm"
        >
            <div
                class="grid min-w-0 flex-1 grid-cols-2 gap-0.5 rounded-md bg-muted/50 p-0.5"
            >
                <button
                    type="button"
                    onclick={useMapArea}
                    class="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 font-medium transition-colors {mode ===
                    'area'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'}"
                    title={mode === "area"
                        ? "Update search to this view"
                        : "Search the visible map rectangle"}
                >
                    <MapIcon class="size-3 shrink-0" />
                    Area
                </button>
                <button
                    type="button"
                    onclick={startPointMode}
                    class="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 font-medium transition-colors {mode ===
                        'point' || drafting
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'}"
                    title="Click once for the centre, again for the radius"
                >
                    <CrosshairIcon class="size-3 shrink-0" />
                    Point
                </button>
            </div>
            {#if pointStep === "centre"}
                <span class="hidden shrink-0 px-1.5 text-muted-foreground sm:inline"
                    >Click centre</span
                >
            {:else if pointStep === "radius"}
                <span
                    class="hidden shrink-0 px-1.5 tabular-nums text-muted-foreground sm:inline"
                    >{formatRadius(previewRadius ?? radius)}</span
                >
            {:else if mode === "point"}
                <span
                    class="hidden shrink-0 px-1.5 tabular-nums text-muted-foreground sm:inline"
                    >{formatRadius(radius)}</span
                >
            {/if}
            {#if mode !== "none" || drafting}
                <button
                    type="button"
                    onclick={clearSpatial}
                    class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Clear spatial filter"
                >
                    <XIcon class="size-3.5" />
                </button>
            {/if}
        </div>
    </div>
</div>
