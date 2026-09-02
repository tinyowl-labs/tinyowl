<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { isDark, themePrefs } from "$lib/stores/theme.svelte";
    import type {
        GeoJSON as LeafletGeoJSON,
        Map as LeafletMap,
        MarkerClusterGroup,
    } from "leaflet";
    import {
        createClusterGroup,
        createLeafletMap,
        destroyLeafletMap,
        loadLeafletWithCluster,
        observeLeafletResize,
        tuneLeafletBasemap,
        type LeafletNS,
    } from "../leafletBoot";
    import MapLoading from "../MapLoading.svelte";
    import MapAttribution from "../MapAttribution.svelte";

    type Feature = {
        id: string;
        table: string;
        type: string;
        geometry: any;
    };

    type Props = {
        features: Feature[];
        selectedId: string | null;
        class?: string;
    };

    let { features, selectedId = null, class: klass = "" }: Props = $props();

    let container = $state<HTMLDivElement>();
    let mounted = $state(false);
    let mapReady = $state(false);
    let map = $state<LeafletMap | null>(null);
    let Lref: LeafletNS | null = null;
    let cluster: MarkerClusterGroup | null = null;
    let geoLayer: LeafletGeoJSON | null = null;
    let didFit = false;
    let stopResize: (() => void) | undefined;

    onMount(() => {
        mounted = true;
    });

    function asGeometry(raw: unknown): any | null {
        if (!raw) return null;
        let g: any = raw;
        if (typeof g === "string") {
            try {
                g = JSON.parse(g);
            } catch {
                return null;
            }
        }
        if (!g || typeof g !== "object") return null;
        if (typeof g.type === "string" && Array.isArray(g.coordinates)) return g;
        if (g.type === "Feature" && g.geometry) return asGeometry(g.geometry);
        return null;
    }

    const OP_FILL: Record<string, string> = {
        insert: "#34d399",
        update: "#fbbf24",
        delete: "#f87171",
        head: "#64748b",
    };

    function paint(type: string, selected: boolean) {
        const fill = OP_FILL[type.toLowerCase()] ?? "#c45c26";
        return {
            radius: selected ? 8 : 6,
            color: selected ? "#fff" : "rgba(255,255,255,0.85)",
            weight: selected ? 3 : 1.5,
            fillColor: fill,
            fillOpacity: type.toLowerCase() === "head" ? 0.7 : 0.95,
        };
    }

    function redrawFeatures() {
        const L = Lref;
        const m = map;
        if (!L || !m || !cluster) return;

        cluster.clearLayers();
        if (geoLayer) {
            geoLayer.remove();
            geoLayer = null;
        }

        const otherFeatures: GeoJSON.Feature[] = [];
        for (const f of features) {
            const geometry = asGeometry(f.geometry);
            if (!geometry) continue;
            if (
                geometry.type === "Point" &&
                Array.isArray(geometry.coordinates)
            ) {
                const lon = Number(geometry.coordinates[0]);
                const lat = Number(geometry.coordinates[1]);
                if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
                const selected = selectedId === f.id;
                const marker = L.circleMarker([lat, lon], paint(f.type, selected));
                cluster.addLayer(marker);
            } else {
                otherFeatures.push({
                    type: "Feature",
                    id: f.id,
                    properties: { table: f.table, type: f.type, id: f.id },
                    geometry,
                });
            }
        }

        if (otherFeatures.length) {
            geoLayer = L.geoJSON(
                {
                    type: "FeatureCollection",
                    features: otherFeatures,
                } as GeoJSON.FeatureCollection,
                {
                    style: (feat) => {
                        const id = String(feat?.id ?? feat?.properties?.id ?? "");
                        const type = String(feat?.properties?.type ?? "head");
                        const selected = selectedId != null && id === selectedId;
                        const p = paint(type, selected);
                        return {
                            color: p.fillColor,
                            weight: selected ? 3 : 2,
                            fillColor: p.fillColor,
                            fillOpacity: type === "head" ? 0.18 : 0.35,
                        };
                    },
                },
            ).addTo(m);
        }

        if (!didFit) {
            const bounds = cluster.getBounds();
            const geoBounds = geoLayer?.getBounds();
            let combined = bounds.isValid() ? bounds : null;
            if (geoBounds?.isValid()) {
                combined = combined ? combined.extend(geoBounds) : geoBounds;
            }
            if (combined?.isValid()) {
                m.fitBounds(combined, {
                    padding: [28, 28],
                    maxZoom: 16,
                    animate: false,
                });
                didFit = true;
            }
        }
    }

    $effect(() => {
        if (!mounted || !container || !browser) return;
        let cancelled = false;

        void (async () => {
            try {
                const L = await loadLeafletWithCluster();
                if (cancelled || !container) return;
                const m = createLeafletMap(L, container);
                stopResize = observeLeafletResize(m, container);
                cluster = createClusterGroup(L, {
                    disableClusteringAtZoom: 16,
                    maxClusterRadius: 44,
                }).addTo(m);
                Lref = L;
                map = m;
                tuneLeafletBasemap(m, isDark());
                m.invalidateSize();
                didFit = false;
                redrawFeatures();
                if (!cancelled) mapReady = true;
            } catch (err) {
                console.error("ReviewMap:", err);
                if (!cancelled) mapReady = true;
            }
        })();

        return () => {
            cancelled = true;
            stopResize?.();
            stopResize = undefined;
            cluster = null;
            geoLayer = null;
            Lref = null;
            didFit = false;
            destroyLeafletMap(map);
            map = null;
        };
    });

    $effect(() => {
        features;
        selectedId;
        if (map && Lref) redrawFeatures();
    });

    $effect(() => {
        themePrefs.accentHue;
        themePrefs.bgBase;
        if (map) tuneLeafletBasemap(map, isDark());
    });
</script>

<div class="leaflet-locator relative h-full w-full min-h-0 overflow-hidden {klass}">
    <div bind:this={container} class="absolute inset-0"></div>
    {#if !mapReady}
        <MapLoading class="absolute inset-0" />
    {/if}
    <MapAttribution class="bottom-1 right-1" />
    <div
        class="leaflet-map-chrome pointer-events-none absolute left-2 bottom-2 z-10 flex gap-2 rounded bg-background/90 px-1.5 py-1 text-[10px] text-muted-foreground shadow-sm ring-1 ring-border/60"
    >
        <span class="inline-flex items-center gap-1"
            ><i class="size-2 rounded-full bg-emerald-400"></i> insert</span
        >
        <span class="inline-flex items-center gap-1"
            ><i class="size-2 rounded-full bg-amber-400"></i> update</span
        >
        <span class="inline-flex items-center gap-1"
            ><i class="size-2 rounded-full bg-red-400"></i> delete</span
        >
    </div>
</div>
