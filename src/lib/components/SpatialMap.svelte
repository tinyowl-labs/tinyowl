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
    let mapRef: any = null;
    let Lref: any = null;
    let centerMarker: any = null;
    let radiusCircle: any = null;
    let bboxRect: any = null;
    let resultLayer: any = null;
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
        if (!mapRef) return;
        if (centerMarker) {
            mapRef.removeLayer(centerMarker);
            centerMarker = null;
        }
        if (radiusCircle) {
            mapRef.removeLayer(radiusCircle);
            radiusCircle = null;
        }
        if (bboxRect) {
            mapRef.removeLayer(bboxRect);
            bboxRect = null;
        }
    }

    function syncSpatialGraphics() {
        if (!mapRef || !Lref) return;
        const colors = mapColors();
        clearOverlay();

        if (searchBBox) {
            const bounds = Lref.latLngBounds(
                [searchBBox.south, searchBBox.west],
                [searchBBox.north, searchBBox.east],
            );
            bboxRect = Lref.rectangle(bounds, {
                color: colors.stroke,
                weight: 2,
                fillColor: colors.marker,
                fillOpacity: 0.12,
            }).addTo(mapRef);
            return;
        }

        if (centerLat == null || centerLng == null) return;

        centerMarker = Lref.circleMarker([centerLat, centerLng], {
            radius: 7,
            fillColor: colors.marker,
            color: colors.stroke,
            weight: 2,
            fillOpacity: 1,
        }).addTo(mapRef);

        const r =
            pointStep === "radius" && previewRadius != null
                ? previewRadius
                : radius;
        radiusCircle = Lref.circle([centerLat, centerLng], {
            radius: r,
            fillColor: colors.marker,
            color: colors.stroke,
            weight: 2,
            fillOpacity: 0.12,
            dashArray: pointStep === "radius" ? "6 6" : undefined,
        }).addTo(mapRef);
    }

    function syncResultMarkers() {
        if (!mapRef || !Lref) return;
        if (resultLayer) {
            mapRef.removeLayer(resultLayer);
            resultLayer = null;
        }
        const colors = mapColors();
        resultLayer = Lref.layerGroup().addTo(mapRef);

        for (const r of results) {
            if (!r.bbox) continue;
            const c = bboxCentroid(r.bbox);
            if (!c) continue;
            const m = Lref.circleMarker([c.lat, c.lng], {
                radius: 5,
                fillColor: colors.marker,
                color: colors.stroke,
                weight: 1.5,
                fillOpacity: 0.75,
            });
            m.bindPopup(
                `<div class="text-[13px]">
                    <strong>${escapeHTML(r.title)}</strong><br/>
                    <a href="/${r.slug}" class="text-xs">View project →</a>
                </div>`,
                { closeButton: false },
            );
            m.on("click", () => goto(`/${r.slug}`));
            resultLayer.addLayer(m);
        }
    }

    function fitToContent() {
        if (!mapRef || !Lref) return;
        if (searchBBox) {
            mapRef.fitBounds(
                [
                    [searchBBox.south, searchBBox.west],
                    [searchBBox.north, searchBBox.east],
                ],
                { padding: [24, 24], maxZoom: 12 },
            );
            return;
        }
        const bounds = Lref.latLngBounds([]);
        if (centerLat != null && centerLng != null) {
            bounds.extend([centerLat, centerLng]);
            const deg = radius / 111320;
            bounds.extend([centerLat + deg, centerLng]);
            bounds.extend([centerLat - deg, centerLng]);
        }
        for (const r of results) {
            if (!r.bbox) continue;
            const c = bboxCentroid(r.bbox);
            if (c) bounds.extend([c.lat, c.lng]);
        }
        if (bounds.isValid()) {
            mapRef.fitBounds(bounds, { padding: [36, 36], maxZoom: 12 });
        }
    }

    function useMapArea() {
        if (!mapRef) return;
        pointStep = "idle";
        previewRadius = null;
        const bounds = mapRef.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        searchBBox = {
            west: parseFloat(sw.lng.toFixed(6)),
            south: parseFloat(sw.lat.toFixed(6)),
            east: parseFloat(ne.lng.toFixed(6)),
            north: parseFloat(ne.lat.toFixed(6)),
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
        // Drop bbox from the URL so the page sync effect cannot restore it.
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

    function handleMapClick(e: any) {
        if (pointStep === "idle" && mode !== "point") return;

        // Restart placement when already committed, or continue the two-click flow.
        if (pointStep === "idle") {
            pointStep = "centre";
        }

        if (pointStep === "centre") {
            searchBBox = null;
            centerLat = parseFloat(e.latlng.lat.toFixed(6));
            centerLng = parseFloat(e.latlng.lng.toFixed(6));
            previewRadius = DEFAULT_SEARCH_RADIUS;
            pointStep = "radius";
            syncSpatialGraphics();
            return;
        }

        if (pointStep === "radius" && centerLat != null && centerLng != null && mapRef) {
            const metres = mapRef.distance(
                [centerLat, centerLng],
                [e.latlng.lat, e.latlng.lng],
            );
            radius = clampRadius(metres);
            previewRadius = null;
            pointStep = "idle";
            syncSpatialGraphics();
            onChange();
        }
    }

    function handleMapMove(e: any) {
        if (pointStep !== "radius" || centerLat == null || centerLng == null || !mapRef)
            return;
        const metres = mapRef.distance(
            [centerLat, centerLng],
            [e.latlng.lat, e.latlng.lng],
        );
        previewRadius = clampRadius(metres);
        syncSpatialGraphics();
    }

    $effect(() => {
        if (!mounted || !container || !browser) return;
        let cancelled = false;
        let cleanup: (() => void) | undefined;

        import("leaflet").then(async ({ default: L }) => {
            if (cancelled || !container) return;
            await import("leaflet/dist/leaflet.css");
            Lref = L;

            const map = L.map(container, {
                attributionControl: true,
                zoomControl: true,
                scrollWheelZoom: true,
            }).setView(
                centerLat != null && centerLng != null
                    ? [centerLat, centerLng]
                    : searchBBox
                      ? [
                            (searchBBox.south + searchBBox.north) / 2,
                            (searchBBox.west + searchBBox.east) / 2,
                        ]
                      : [20, 0],
                centerLat != null || searchBBox ? 10 : 2,
            );
            mapRef = map;

            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            }).addTo(map);

            if (isDark()) container.classList.add("leaflet-dark");
            else container.classList.remove("leaflet-dark");

            map.on("click", (e: any) => handleMapClick(e));
            map.on("mousemove", (e: any) => handleMapMove(e));

            syncResultMarkers();
            syncSpatialGraphics();
            fitToContent();

            cleanup = () => {
                map.remove();
                mapRef = null;
                Lref = null;
                centerMarker = null;
                radiusCircle = null;
                bboxRect = null;
                resultLayer = null;
            };
        });

        return () => {
            cancelled = true;
            cleanup?.();
        };
    });

    $effect(() => {
        results;
        themePrefs.accentHue;
        themePrefs.bgBase;
        if (mapRef && Lref) syncResultMarkers();
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
        if (mapRef && Lref) {
            container?.classList.toggle("leaflet-dark", isDark());
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
