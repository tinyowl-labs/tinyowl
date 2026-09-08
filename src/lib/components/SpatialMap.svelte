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
    import { fetchCountryOutline } from "$lib/search/photon";
    import CrosshairIcon from "@lucide/svelte/icons/crosshair";
    import MapIcon from "@lucide/svelte/icons/map";
    import XIcon from "@lucide/svelte/icons/x";
    import type {
        CircleMarker,
        CircleMarkerOptions,
        FeatureGroup,
        GeoJSON as LeafletGeoJSON,
        LatLngBounds,
        Layer,
        Map as LeafletMap,
        MarkerClusterGroup,
        PathOptions,
    } from "leaflet";
    import { haversineMetres } from "$lib/geo/haversine";
    import {
        createClusterGroup,
        createLeafletMap,
        destroyLeafletMap,
        loadLeafletWithCluster,
        observeLeafletResize,
        tuneLeafletBasemap,
        viewBounds,
        type LeafletNS,
    } from "./leafletBoot";
    import MapLoading from "./MapLoading.svelte";
    import MapAttribution from "./MapAttribution.svelte";

    const outlineCache = new Map<
        string,
        { type: string; coordinates: unknown }
    >();

    type ResultMarker = {
        slug: string;
        title: string;
        bbox?: string | null;
        lat?: number | null;
        lng?: number | null;
    };

    type SpatialMode = "none" | "area" | "point" | "polygon";
    type DisplayMode = "area" | "point";
    /** Point-mode gesture: wait for centre, then radius edge. */
    type PointStep = "idle" | "centre" | "radius";
    type DrawKind = "none" | "area" | "polygon";
    type LatLng = { lat: number; lng: number };

    type Props = {
        centerLat: number | null;
        centerLng: number | null;
        radius: number;
        searchBBox: SearchBBox | null;
        countryCode?: string | null;
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
        /** Skip camera fit when a parent is driving the view. */
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
        countryCode = $bindable(null),
        results = [],
        onChange,
        fitResults = false,
        class: klass = "",
        displayMode = "point",
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
    let overlay: FeatureGroup | null = null;
    let resultsCluster: MarkerClusterGroup | null = null;
    let resultsPolygons: FeatureGroup | null = null;
    let pointStep = $state<PointStep>("idle");
    /** Live radius while dragging/moving before second click. */
    let previewRadius = $state<number | null>(null);
    let drawKind = $state<DrawKind>("none");
    let areaOrigin = $state<LatLng | null>(null);
    let areaCurrent = $state<LatLng | null>(null);
    let polyVerts = $state<LatLng[]>([]);
    let polyCursor = $state<LatLng | null>(null);
    let drawnRing = $state<LatLng[] | null>(null);
    let lastFitKey = "";
    let lastCountryFit = "";
    const markerBySlug = new Map<string, CircleMarker>();
    const polygonBySlug = new Map<string, LeafletGeoJSON>();
    let outlineGeom = $state.raw<{
        type: string;
        coordinates: unknown;
    } | null>(null);

    const mode = $derived.by((): SpatialMode => {
        if (drawKind === "polygon") return "polygon";
        if (drawKind === "area" || areaOrigin) return "area";
        if (pointStep !== "idle") return "point";
        if (drawnRing && drawnRing.length >= 3) return "polygon";
        if (searchBBox) return "area";
        if (centerLat != null && centerLng != null) return "point";
        return "none";
    });

    const drafting = $derived(
        pointStep === "centre" ||
            pointStep === "radius" ||
            drawKind === "area" ||
            drawKind === "polygon",
    );

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

    function cornersToBBox(a: LatLng, b: LatLng): SearchBBox {
        return {
            west: parseFloat(Math.min(a.lng, b.lng).toFixed(6)),
            south: parseFloat(Math.min(a.lat, b.lat).toFixed(6)),
            east: parseFloat(Math.max(a.lng, b.lng).toFixed(6)),
            north: parseFloat(Math.max(a.lat, b.lat).toFixed(6)),
        };
    }

    function ringToBBox(ring: LatLng[]): SearchBBox | null {
        if (ring.length < 3) return null;
        let west = Infinity,
            south = Infinity,
            east = -Infinity,
            north = -Infinity;
        for (const p of ring) {
            if (p.lng < west) west = p.lng;
            if (p.lng > east) east = p.lng;
            if (p.lat < south) south = p.lat;
            if (p.lat > north) north = p.lat;
        }
        return {
            west: parseFloat(west.toFixed(6)),
            south: parseFloat(south.toFixed(6)),
            east: parseFloat(east.toFixed(6)),
            north: parseFloat(north.toFixed(6)),
        };
    }

    function enableMapGestures() {
        map?.dragging.enable();
        map?.boxZoom.enable();
        map?.doubleClickZoom.enable();
    }

    function cancelDraw() {
        drawKind = "none";
        areaOrigin = null;
        areaCurrent = null;
        polyVerts = [];
        polyCursor = null;
        enableMapGestures();
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
            weight: 2,
            fillColor: fill,
            fillOpacity: 0.28,
            opacity: 0.95,
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
        }
        for (const [slug, layer] of polygonBySlug) {
            layer.setStyle(accentStyle(emphasis(slug)));
            if (emphasis(slug) !== "idle") raiseLayer(layer);
        }
    }

    function raiseLayer(layer: Layer | null | undefined) {
        const raise = (layer as Layer & { bringToFront?: () => void })
            ?.bringToFront;
        if (typeof raise === "function") raise.call(layer);
    }

    function bringOverlayFront() {
        raiseLayer(overlay);
        overlay?.eachLayer(raiseLayer);
    }

    function syncSpatialGraphics() {
        const L = Lref;
        if (!map || !L || !overlay) return;
        overlay.clearLayers();
        const colors = mapColors();
        const fill = colors.marker || "#3b82f6";
        const stroke = colors.stroke || "#1d4ed8";
        const fillOpacity = 0.12;
        const path = {
            color: stroke,
            weight: 2,
            fillColor: fill,
            fillOpacity,
            interactive: false,
        };

        if (areaOrigin && areaCurrent) {
            overlay.addLayer(
                L.rectangle(
                    [
                        [areaOrigin.lat, areaOrigin.lng],
                        [areaCurrent.lat, areaCurrent.lng],
                    ],
                    path,
                ),
            );
            bringOverlayFront();
            return;
        }

        if (drawKind === "polygon" && polyVerts.length > 0) {
            const pts = polyCursor
                ? [...polyVerts, polyCursor]
                : polyVerts;
            overlay.addLayer(
                L.polyline(
                    pts.map((p) => [p.lat, p.lng] as [number, number]),
                    { color: stroke, weight: 2, interactive: false },
                ),
            );
            if (pts.length >= 3) {
                overlay.addLayer(
                    L.polygon(
                        pts.map((p) => [p.lat, p.lng] as [number, number]),
                        { ...path, fillOpacity: 0.08 },
                    ),
                );
            }
            for (const p of polyVerts) {
                overlay.addLayer(
                    L.circleMarker([p.lat, p.lng], {
                        radius: 4,
                        color: stroke,
                        weight: 2,
                        fillColor: fill,
                        fillOpacity: 1,
                        interactive: false,
                    }),
                );
            }
            bringOverlayFront();
            return;
        }

        // Country filter: only the Natural Earth outline. Never fall through to
        // the envelope rectangle — that bbox is often overseas-inclusive and
        // appears for a frame before the polygon arrives.
        if (countryCode) {
            if (outlineGeom) {
                overlay.addLayer(
                    L.geoJSON(outlineGeom as never, {
                        style: {
                            color: stroke,
                            weight: 2,
                            fillColor: fill,
                            fillOpacity,
                        },
                        interactive: false,
                    }),
                );
            }
            bringOverlayFront();
            return;
        }

        if (drawnRing && drawnRing.length >= 3) {
            overlay.addLayer(
                L.polygon(
                    drawnRing.map((p) => [p.lat, p.lng] as [number, number]),
                    path,
                ),
            );
            bringOverlayFront();
            return;
        }

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
            bringOverlayFront();
            return;
        }

        if (centerLat == null || centerLng == null) {
            bringOverlayFront();
            return;
        }

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
        bringOverlayFront();
    }

    function bindResultLayer(slug: string, layer: Layer) {
        layer.on("click", (e) => {
            Lref?.DomEvent.stopPropagation(e);
            if (pointStep !== "idle" || drawKind !== "none") return;
            if (onResultClick) onResultClick(slug);
            else goto(`/${slug}`);
        });
        layer.on("mouseover", () => onResultHover?.(slug));
        layer.on("mouseout", () => onResultHover?.(null));
    }

    function syncResultMarkers() {
        const L = Lref;
        if (!map || !L || !resultsCluster || !resultsPolygons) return;
        if (!map.hasLayer(resultsCluster)) return;
        if (!Number.isFinite(map.getZoom())) return;

        resultsCluster.clearLayers();
        resultsPolygons.clearLayers();
        markerBySlug.clear();
        polygonBySlug.clear();

        const showArea = displayMode === "area";
        const outlineSlug = selectedSlug;
        const pins: CircleMarker[] = [];

        for (const r of results) {
            const pt = resultPoint(r);
            let drewPolygon = false;
            const wantPoly = (showArea || r.slug === outlineSlug) && Boolean(r.bbox);
            if (wantPoly && r.bbox) {
                try {
                    const geom = JSON.parse(r.bbox);
                    const g =
                        geom?.type === "Feature" ? geom.geometry : geom;
                    if (g?.type && (g.coordinates || g.geometries)) {
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

            if (!drewPolygon) {
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
                pins.push(marker);
                markerBySlug.set(r.slug, marker);
            }
        }
        if (pins.length) {
            try {
                resultsCluster.addLayers(pins);
            } catch {
                for (const pin of pins) resultsPolygons.addLayer(pin);
            }
        }
        applyEmphasis();
        bringOverlayFront();
    }

    function resultBounds() {
        const rb = resultsCluster?.getBounds();
        const pb = resultsPolygons?.getBounds();
        if (rb?.isValid() && pb?.isValid()) return rb.extend(pb);
        if (rb?.isValid()) return rb;
        if (pb?.isValid()) return pb;
        return null;
    }

    function applyFit(bounds: LatLngBounds | null | undefined, animate: boolean, maxZoom: number) {
        if (!map || !bounds?.isValid()) return false;
        const padded = bounds.pad(0.2);
        const opts = {
            ...flyPadding(),
            maxZoom,
            animate,
        };
        if (animate) {
            map.flyToBounds(padded, { ...opts, duration: 0.55 });
        } else {
            map.fitBounds(padded, { ...opts, animate: false });
        }
        return true;
    }

    function outlineBounds(): LatLngBounds | null {
        if (!Lref || !outlineGeom) return null;
        const b = Lref.geoJSON(outlineGeom as never).getBounds();
        return b?.isValid() ? b : null;
    }

    function fitCountryOutline(animate: boolean): boolean {
        if (!countryCode) return false;
        const cc = countryCode.trim().toUpperCase();
        if (applyFit(outlineBounds(), animate, 8)) {
            lastCountryFit = cc;
            return true;
        }
        return false;
    }

    /** Zoom to every result pin (and the selected footprint, if any), with a buffer. */
    export function fitAllResults(animate = true) {
        if (!map || lockView) return;
        lastFitKey = results.map((r) => r.slug).join("\0");
        if (countryCode) {
            fitCountryOutline(false);
            return;
        }
        if (applyFit(resultBounds(), animate, 12)) return;
        fitSearchShape(animate);
    }

    function fitSearchShape(animate = false) {
        if (!map || lockView) return;
        if (countryCode) {
            fitCountryOutline(animate);
            return;
        }
        if (searchBBox) {
            applyFit(
                Lref?.latLngBounds(
                    [searchBBox.south, searchBBox.west],
                    [searchBBox.north, searchBBox.east],
                ) ?? null,
                animate,
                12,
            );
            return;
        }
        if (centerLat != null && centerLng != null) {
            const r = radius > 0 ? radius : DEFAULT_SEARCH_RADIUS;
            const dLat = (r / 6371000) * (180 / Math.PI);
            const cos = Math.cos((centerLat * Math.PI) / 180);
            const dLng = cos > 1e-6 ? dLat / cos : 180;
            applyFit(
                Lref?.latLngBounds(
                    [centerLat - dLat, centerLng - dLng],
                    [centerLat + dLat, centerLng + dLng],
                ) ?? null,
                animate,
                16,
            );
        }
    }

    function flyPadding() {
        return {
            paddingTopLeft: [Math.max(48, flyPaddingLeft), 72] as [number, number],
            paddingBottomRight: [40, 72] as [number, number],
        };
    }

    export function flyToSlug(slug: string) {
        const r = results.find((x) => x.slug === slug);
        if (!r || !map || !Lref) return;
        const pad = flyPadding();
        if (r.bbox) {
            const env = bboxFromGeoJSON(r.bbox);
            if (env) {
                const box = Lref.latLngBounds(
                    [env.south, env.west],
                    [env.north, env.east],
                ).pad(0.08);
                map.flyToBounds(box, { ...pad, maxZoom: 14, duration: 0.7 });
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

    export function startAreaMode() {
        pointStep = "idle";
        previewRadius = null;
        polyVerts = [];
        polyCursor = null;
        areaOrigin = null;
        areaCurrent = null;
        drawKind = "area";
        map?.dragging.disable();
        map?.boxZoom.disable();
        map?.doubleClickZoom.disable();
        syncSpatialGraphics();
    }

    export function startPolygonMode() {
        pointStep = "idle";
        previewRadius = null;
        areaOrigin = null;
        areaCurrent = null;
        polyVerts = [];
        polyCursor = null;
        drawKind = "polygon";
        map?.boxZoom.disable();
        map?.doubleClickZoom.disable();
        syncSpatialGraphics();
    }

    export function startPointMode() {
        cancelDraw();
        drawnRing = null;
        previewRadius = null;
        pointStep = "centre";
        syncSpatialGraphics();
    }

    export function clearSpatial() {
        cancelDraw();
        drawnRing = null;
        centerLat = null;
        centerLng = null;
        searchBBox = null;
        radius = DEFAULT_SEARCH_RADIUS;
        countryCode = null;
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

    function commitBBox(box: SearchBBox) {
        searchBBox = box;
        centerLat = null;
        centerLng = null;
        countryCode = null;
        cancelDraw();
        syncSpatialGraphics();
        onChange?.();
    }

    function closePolygon() {
        if (polyVerts.length < 3) return;
        const ring = polyVerts.slice();
        const box = ringToBBox(ring);
        if (!box) return;
        drawnRing = ring;
        commitBBox(box);
    }

    function handleMapClick(lat: number, lng: number) {
        if (drawKind === "area") return;

        if (drawKind === "polygon") {
            const next = { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
            if (polyVerts.length >= 3 && map && Lref) {
                const first = polyVerts[0]!;
                const a = map.latLngToContainerPoint([first.lat, first.lng]);
                const b = map.latLngToContainerPoint([next.lat, next.lng]);
                if (a.distanceTo(b) < 14) {
                    closePolygon();
                    return;
                }
            }
            polyVerts = [...polyVerts, next];
            syncSpatialGraphics();
            return;
        }

        if (pointStep === "idle") return;

        if (pointStep === "centre") {
            drawnRing = null;
            searchBBox = null;
            countryCode = null;
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
        if (drawKind === "area" && areaOrigin) {
            areaCurrent = { lat, lng };
            syncSpatialGraphics();
            return;
        }
        if (drawKind === "polygon" && polyVerts.length > 0) {
            polyCursor = { lat, lng };
            syncSpatialGraphics();
            return;
        }
        if (pointStep !== "radius" || centerLat == null || centerLng == null)
            return;
        const metres = haversineMetres(centerLat, centerLng, lat, lng);
        previewRadius = clampRadius(metres);
        syncSpatialGraphics();
    }

    function handleAreaDown(lat: number, lng: number) {
        if (drawKind !== "area") return;
        areaOrigin = { lat, lng };
        areaCurrent = { lat, lng };
        syncSpatialGraphics();
    }

    function handleAreaUp() {
        if (drawKind !== "area" || !areaOrigin || !areaCurrent || !map) return;
        const a = map.latLngToContainerPoint([areaOrigin.lat, areaOrigin.lng]);
        const b = map.latLngToContainerPoint([areaCurrent.lat, areaCurrent.lng]);
        if (a.distanceTo(b) < 12) {
            areaOrigin = null;
            areaCurrent = null;
            syncSpatialGraphics();
            return;
        }
        drawnRing = null;
        commitBBox(cornersToBBox(areaOrigin, areaCurrent));
    }

    function onKey(e: KeyboardEvent) {
        if (e.key !== "Escape") return;
        if (drawKind === "none" && pointStep === "idle") return;
        e.preventDefault();
        cancelDraw();
        pointStep = "idle";
        previewRadius = null;
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

                const m = createLeafletMap(L, container, { wrapLng: true });
                const stopResize = observeLeafletResize(m, container);
                resultsPolygons = L.featureGroup().addTo(m);
                resultsCluster = createClusterGroup(L, {
                    disableClusteringAtZoom: 12,
                    maxClusterRadius: 48,
                }).addTo(m);
                overlay = L.featureGroup().addTo(m);
                Lref = L;
                tuneLeafletBasemap(m, isDark());
                m.invalidateSize({ animate: false });
                map = m;

                m.on("click", (e) => {
                    handleMapClick(e.latlng.lat, e.latlng.lng);
                });
                m.on("dblclick", (e) => {
                    if (drawKind !== "polygon") return;
                    L.DomEvent.stop(e);
                    if (polyVerts.length > 3) {
                        polyVerts = polyVerts.slice(0, -1);
                    }
                    closePolygon();
                });
                m.on("mousedown", (e) => {
                    if (drawKind !== "area") return;
                    if (e.originalEvent.button !== 0) return;
                    L.DomEvent.stop(e);
                    handleAreaDown(e.latlng.lat, e.latlng.lng);
                });
                m.on("mouseup", () => {
                    handleAreaUp();
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

                syncResultMarkers();
                syncSpatialGraphics();
                if (!lockView && !selectedSlug && fitResults) fitAllResults(false);
                const rect = viewBounds(m);
                onViewBounds?.({
                    west: parseFloat(rect.west.toFixed(6)),
                    south: parseFloat(rect.south.toFixed(6)),
                    east: parseFloat(rect.east.toFixed(6)),
                    north: parseFloat(rect.north.toFixed(6)),
                });
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
        themePrefs.colorScheme;
        if (mapReady && map && Lref) {
            tuneLeafletBasemap(map, isDark());
            syncResultMarkers();
        }
    });

    $effect(() => {
        hoveredSlug;
        selectedSlug;
        if (mapReady && map && Lref) applyEmphasis();
    });

    $effect(() => {
        const cc = (countryCode ?? "").trim().toUpperCase();
        if (!cc) {
            lastCountryFit = "";
            if (outlineGeom) outlineGeom = null;
            return;
        }
        if (drawnRing) drawnRing = null;
        const cached = outlineCache.get(cc);
        if (cached) {
            if (outlineGeom !== cached) outlineGeom = cached;
            return;
        }
        if (outlineGeom) outlineGeom = null;
        let cancelled = false;
        void fetchCountryOutline(cc).then((o) => {
            if (cancelled || !o?.geometry) return;
            outlineCache.set(cc, o.geometry);
            if (outlineGeom !== o.geometry) outlineGeom = o.geometry;
        });
        return () => {
            cancelled = true;
        };
    });

    $effect(() => {
        centerLat;
        centerLng;
        radius;
        searchBBox;
        countryCode;
        outlineGeom;
        pointStep;
        previewRadius;
        drawKind;
        areaOrigin;
        areaCurrent;
        polyVerts;
        polyCursor;
        drawnRing;
        themePrefs.accentHue;
        themePrefs.bgBase;
        themePrefs.colorScheme;
        if (mapReady && map && Lref) {
            tuneLeafletBasemap(map, isDark());
            syncSpatialGraphics();
        }
    });

    /** Fit once to the country outline; do not later jump to the pin cluster. */
    $effect(() => {
        if (!mapReady || !map || !Lref || lockView || selectedSlug || drafting || !fitResults)
            return;
        const cc = (countryCode ?? "").trim().toUpperCase();
        if (!cc || !outlineGeom) return;
        if (cc === lastCountryFit) return;
        lastFitKey = results.map((r) => r.slug).join("\0");
        fitCountryOutline(false);
    });

    /** Fit result pins when the hit set changes, not while a project is selected or drawing. */
    $effect(() => {
        if (!mapReady || !map || !Lref || lockView || selectedSlug || drafting || !fitResults)
            return;
        if (countryCode) return;
        const key = results.map((r) => r.slug).join("\0");
        if (key === lastFitKey) return;
        fitAllResults(true);
    });

    $effect(() => {
        if (!map) return;
        map.getContainer().style.cursor = drafting ? "crosshair" : "";
    });
</script>

<svelte:window onkeydown={onKey} onmouseup={handleAreaUp} />

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
                class="leaflet-map-chrome surface pointer-events-auto absolute inset-x-2 top-2 z-10 flex items-center gap-1 rounded-lg border border-border p-0.5 text-[11px] shadow-sm"
            >
                <div
                    class="grid min-w-0 flex-1 grid-cols-2 gap-0.5 rounded-md bg-muted/50 p-0.5"
                >
                    <button
                        type="button"
                        onclick={startPointMode}
                        class="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 font-medium transition-colors {mode ===
                            'point' || pointStep !== 'idle'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'}"
                        title="Click once for the centre, again for the radius"
                    >
                        <CrosshairIcon class="size-3 shrink-0" />
                        Point
                    </button>
                    <button
                        type="button"
                        onclick={startAreaMode}
                        class="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 font-medium transition-colors {mode ===
                        'area'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'}"
                        title="Drag a rectangle"
                    >
                        <MapIcon class="size-3 shrink-0" />
                        Area
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
