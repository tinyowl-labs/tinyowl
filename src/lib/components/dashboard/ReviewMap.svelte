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
    import {
        DIFF_OP_FILL,
        asGeometry,
        parseDiffOp,
        type DiffOp,
    } from "$lib/geoDiff";

    type Feature = {
        id: string;
        table?: string;
        type?: string;
        op?: DiffOp;
        geometry: unknown;
        oldGeometry?: unknown;
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

    function featureOp(f: Feature): DiffOp {
        return parseDiffOp(f.op ?? f.type);
    }

    function paint(op: DiffOp, selected: boolean, role: "after" | "before") {
        const fill = DIFF_OP_FILL[op] ?? "#c45c26";
        const before = role === "before";
        return {
            radius: selected && !before ? 8 : before ? 5 : 6,
            color: selected && !before ? "#fff" : "rgba(255,255,255,0.85)",
            weight: selected && !before ? 3 : 1.5,
            fillColor: fill,
            fillOpacity: before
                ? 0.35
                : op === "head"
                  ? 0.7
                  : op === "delete"
                    ? 0.55
                    : 0.95,
            dashArray:
                before || op === "delete" ? ("6 4" as const) : undefined,
        };
    }

    function addPoint(
        L: LeafletNS,
        lon: number,
        lat: number,
        op: DiffOp,
        selected: boolean,
        role: "after" | "before",
    ) {
        if (!cluster) return;
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
        cluster.addLayer(
            L.circleMarker([lat, lon], paint(op, selected, role)),
        );
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

        const pushGeom = (
            f: Feature,
            raw: unknown,
            role: "after" | "before",
        ) => {
            const geometry = asGeometry(raw);
            if (!geometry) return;
            const op = featureOp(f);
            const selected = selectedId === f.id;
            if (
                geometry.type === "Point" &&
                Array.isArray(geometry.coordinates)
            ) {
                addPoint(
                    L,
                    Number(geometry.coordinates[0]),
                    Number(geometry.coordinates[1]),
                    op,
                    selected,
                    role,
                );
                return;
            }
            otherFeatures.push({
                type: "Feature",
                id: `${f.id}:${role}`,
                properties: {
                    table: f.table,
                    type: op,
                    id: f.id,
                    role,
                },
                geometry: geometry as GeoJSON.Geometry,
            });
        };

        for (const f of features) {
            pushGeom(f, f.oldGeometry, "before");
            pushGeom(f, f.geometry, "after");
        }

        if (otherFeatures.length) {
            geoLayer = L.geoJSON(
                {
                    type: "FeatureCollection",
                    features: otherFeatures,
                } as GeoJSON.FeatureCollection,
                {
                    style: (feat) => {
                        const id = String(feat?.properties?.id ?? "");
                        const op = parseDiffOp(feat?.properties?.type);
                        const role =
                            feat?.properties?.role === "before"
                                ? "before"
                                : "after";
                        const selected =
                            selectedId != null && id === selectedId;
                        const p = paint(op, selected, role);
                        return {
                            color: p.fillColor,
                            weight: selected && role === "after" ? 3 : 2,
                            fillColor: p.fillColor,
                            fillOpacity:
                                role === "before"
                                    ? 0.12
                                    : op === "head"
                                      ? 0.18
                                      : 0.35,
                            dashArray: p.dashArray,
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
</div>
