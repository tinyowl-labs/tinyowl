<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";
    import { isDark, mapColors, themePrefs } from "$lib/stores/theme.svelte";
    import {
        DEFAULT_SEARCH_RADIUS,
        formatRadius,
        bboxFromGeoJSON,
        type SearchBBox,
    } from "$lib/search/params";
    import CrosshairIcon from "@lucide/svelte/icons/crosshair";
    import MapIcon from "@lucide/svelte/icons/map";
    import XIcon from "@lucide/svelte/icons/x";
    import type {
        CircleMarker,
        CircleMarkerOptions,
        FeatureGroup,
        GeoJSON as LeafletGeoJSON,
        Layer,
        LayerGroup,
        Map as LeafletMap,
        MarkerClusterGroup,
        PathOptions,
    } from "leaflet";
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
    type DisplayMode = "area" | "point";
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
        /** How result geometry is drawn. */
        displayMode?: DisplayMode;
        hoveredSlug?: string | null;
        selectedSlug?: string | null;
        onResultClick?: (slug: string) => void;
        onResultHover?: (slug: string | null) => void;
        onCursor?: (lat: number | null, lng: number | null, zoom: number | null) => void;
        onViewBounds?: (bounds: SearchBBox) => void;
        /** Skip camera fit when the user is driving the view (search-as-I-move). */
        lockView?: boolean;
        /** Hide the built-in Area/Point chrome (sidebar owns those controls). */
        chrome?: boolean;
        fullBleed?: boolean;
        showAttribution?: boolean;
        /** Extra left padding so fly-to clears a floating sidebar. */
        flyPaddingLeft?: number;
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
        displayMode = "area",
        hoveredSlug = null,
        selectedSlug = null,
        onResultClick,
        onResultHover,
        onCursor,
        onViewBounds,
        lockView = false,
        chrome = true,
        fullBleed = false,
        showAttribution = true,
        flyPaddingLeft = 0,
    }: Props = $props();

    const MIN_RADIUS_M = 200;

    let container = $state<HTMLDivElement>();
    let mounted = $state(false);
    let mapReady = $state(false);
    let map = $state<LeafletMap | null>(null);
    let Lref: LeafletNS | null = null;
    let overlay: LayerGroup | null = null;
    let resultsCluster: MarkerClusterGroup | null = null;
    let resultsPolygons: FeatureGroup | null = null;
    let pointStep = $state<PointStep>("idle");
    /** Live radius while dragging/moving before second click. */
    let previewRadius = $state<number | null>(null);
    const markerBySlug = new Map<string, CircleMarker>();
    const polygonBySlug = new Map<string, LeafletGeoJSON>();

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

    function resultPoint(r: ResultMarker): { lat: number; lng: number } | null {
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
            return null;
        return { lat, lng };
    }

    function accentStyle(kind: "idle" | "hover" | "selected"): PathOptions {
        const colors = mapColors();
        const fill = colors.marker || "#3b82f6";
        const stroke = colors.stroke || "#1d4ed8";
        if (kind === "selected") {
            return {
                color: "#f8fafc",
                weight: 3,
                fillColor: fill,
                fillOpacity: 0.45,
                opacity: 1,
            };
        }
        if (kind === "hover") {
            return {
                color: "#fff",
                weight: 2.5,
                fillColor: fill,
                fillOpacity: 0.38,
                opacity: 1,
            };
        }
        return {
            color: stroke,
            weight: 1.5,
            fillColor: fill,
            fillOpacity: 0.16,
            opacity: 0.9,
        };
    }

    function markerStyle(kind: "idle" | "hover" | "selected"): CircleMarkerOptions {
        const colors = mapColors();
        const fill = colors.marker || "#3b82f6";
        if (kind === "selected") {
            return {
                radius: 9,
                color: "#fff",
                weight: 3,
                fillColor: fill,
                fillOpacity: 1,
            };
        }
        if (kind === "hover") {
            return {
                radius: 8,
                color: "#fff",
                weight: 2,
                fillColor: fill,
                fillOpacity: 1,
            };
        }
        return {
            radius: 6,
            color: "#fff",
            weight: 2,
            fillColor: fill,
            fillOpacity: 1,
        };
    }

    function emphasis(slug: string): "idle" | "hover" | "selected" {
        if (selectedSlug && slug === selectedSlug) return "selected";
        if (hoveredSlug && slug === hoveredSlug) return "hover";
        return "idle";
    }

    function applyEmphasis() {
        for (const [slug, marker] of markerBySlug) {
            marker.setStyle(markerStyle(emphasis(slug)));
            if (emphasis(slug) !== "idle") marker.bringToFront();
        }
        for (const [slug, layer] of polygonBySlug) {
            layer.setStyle(accentStyle(emphasis(slug)));
            if (emphasis(slug) !== "idle") layer.bringToFront();
        }
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

    function bindResultLayer(slug: string, layer: Layer) {
        layer.on("click", (e) => {
            Lref?.DomEvent.stopPropagation(e);
            if (pointStep !== "idle") return;
            if (onResultClick) onResultClick(slug);
            else goto(`/${slug}`);
        });
        layer.on("mouseover", () => onResultHover?.(slug));
        layer.on("mouseout", () => onResultHover?.(null));
    }

    function syncResultMarkers() {
        const L = Lref;
        if (!map || !L || !resultsCluster || !resultsPolygons) return;
        resultsCluster.clearLayers();
        resultsPolygons.clearLayers();
        markerBySlug.clear();
        polygonBySlug.clear();

        const showArea = displayMode === "area";
        const outlineSlug = selectedSlug;

        for (const r of results) {
            const pt = resultPoint(r);
            let drewPolygon = false;
            const wantPoly = (showArea || r.slug === outlineSlug) && Boolean(r.bbox);
            if (wantPoly && r.bbox) {
                try {
                    const geom = JSON.parse(r.bbox);
                    if (geom?.type && geom?.coordinates) {
                        const poly = L.geoJSON(geom, {
                            style: () => accentStyle(emphasis(r.slug)),
                            interactive: true,
                        });
                        bindResultLayer(r.slug, poly);
                        poly.bindTooltip(
                            `<div class="text-[13px]"><strong>${escapeHTML(r.title)}</strong></div>`,
                            {
                                direction: "top",
                                offset: [0, -8],
                                className: "leaflet-map-label",
                                opacity: 1,
                                sticky: true,
                            },
                        );
                        resultsPolygons.addLayer(poly);
                        polygonBySlug.set(r.slug, poly);
                        drewPolygon = true;
                    }
                } catch {
                    /* fall through to pin */
                }
            }

            if (!showArea || !drewPolygon) {
                if (!pt) continue;
                const marker = L.circleMarker([pt.lat, pt.lng], markerStyle(emphasis(r.slug)));
                marker.bindTooltip(
                    `<div class="text-[13px]"><strong>${escapeHTML(r.title)}</strong></div>`,
                    {
                        direction: "top",
                        offset: [0, -8],
                        className: "leaflet-map-label",
                        opacity: 1,
                    },
                );
                bindResultLayer(r.slug, marker);
                resultsCluster.addLayer(marker);
                markerBySlug.set(r.slug, marker);
            }
        }
        applyEmphasis();
    }

    function fitSpatialFilter(animate = false) {
        const L = Lref;
        if (!map || !L || lockView) return;
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
            const pb = resultsPolygons?.getBounds();
            const bounds =
                rb?.isValid() && pb?.isValid()
                    ? rb.extend(pb)
                    : rb?.isValid()
                      ? rb
                      : pb?.isValid()
                        ? pb
                        : null;
            if (bounds?.isValid()) {
                map.fitBounds(bounds, {
                    padding: [40, 40],
                    maxZoom: 8,
                    animate,
                });
            }
        }
    }

    function flyPadding() {
        return {
            paddingTopLeft: [Math.max(24, flyPaddingLeft), 56] as [number, number],
            paddingBottomRight: [28, 56] as [number, number],
        };
    }

    export function flyToSlug(slug: string) {
        const r = results.find((x) => x.slug === slug);
        if (!r || !map) return;
        const pad = flyPadding();
        if (r.bbox) {
            const env = bboxFromGeoJSON(r.bbox);
            if (env) {
                map.flyToBounds(
                    [
                        [env.south, env.west],
                        [env.north, env.east],
                    ],
                    { ...pad, maxZoom: 14, duration: 0.7 },
                );
                return;
            }
        }
        const pt = resultPoint(r);
        if (pt) {
            map.flyTo([pt.lat, pt.lng], Math.max(map.getZoom(), 11), {
                duration: 0.7,
            });
        }
    }

    export function useMapArea() {
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

    export function startPointMode() {
        previewRadius = null;
        pointStep = "centre";
        syncSpatialGraphics();
    }

    export function clearSpatial() {
        centerLat = null;
        centerLng = null;
        searchBBox = null;
        radius = DEFAULT_SEARCH_RADIUS;
        pointStep = "idle";
        previewRadius = null;
        syncSpatialGraphics();
        onChange?.();
    }

    export function zoomIn() {
        map?.zoomIn();
    }

    export function zoomOut() {
        map?.zoomOut();
    }

    export function currentBounds(): SearchBBox | null {
        if (!map) return null;
        const rect = viewBounds(map);
        return {
            west: parseFloat(rect.west.toFixed(6)),
            south: parseFloat(rect.south.toFixed(6)),
            east: parseFloat(rect.east.toFixed(6)),
            north: parseFloat(rect.north.toFixed(6)),
        };
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

    function emitCursor(lat: number | null, lng: number | null) {
        onCursor?.(lat, lng, map?.getZoom() ?? null);
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
                resultsPolygons = L.featureGroup().addTo(m);
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
                    emitCursor(e.latlng.lat, e.latlng.lng);
                });
                m.on("mouseout", () => emitCursor(null, null));
                m.on("zoomend", () => {
                    emitCursor(null, null);
                    onCursor?.(null, null, m.getZoom());
                });
                m.on("moveend", () => {
                    const rect = viewBounds(m);
                    onViewBounds?.({
                        west: parseFloat(rect.west.toFixed(6)),
                        south: parseFloat(rect.south.toFixed(6)),
                        east: parseFloat(rect.east.toFixed(6)),
                        north: parseFloat(rect.north.toFixed(6)),
                    });
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
                if (!lockView) fitSpatialFilter();
                if (!cancelled) mapReady = true;

                cleanup = () => {
                    stopResize();
                    overlay = null;
                    resultsCluster = null;
                    resultsPolygons = null;
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
        displayMode;
        selectedSlug;
        themePrefs.accentHue;
        themePrefs.bgBase;
        if (map && Lref) {
            tuneLeafletBasemap(map, isDark());
            syncResultMarkers();
        }
    });

    $effect(() => {
        hoveredSlug;
        selectedSlug;
        if (map && Lref) applyEmphasis();
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
        if (!map || !Lref || pointStep !== "idle" || lockView) return;
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
        class="leaflet-locator relative h-full min-h-0 overflow-hidden bg-secondary/20 {fullBleed
            ? ''
            : 'rounded-lg border border-border'} {drafting
            ? 'ring-2 ring-primary/40 cursor-crosshair'
            : ''}"
    >
        <div bind:this={container} class="absolute inset-0"></div>
        {#if !mapReady}
            <MapLoading />
        {/if}
        {#if mapReady && showAttribution}
            <MapAttribution />
        {/if}

        {#if chrome}
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
                    <span
                        class="hidden shrink-0 px-1.5 text-muted-foreground sm:inline"
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
        {/if}
    </div>
</div>
