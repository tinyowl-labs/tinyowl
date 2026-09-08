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
        bboxFromDiffGeoms,
        parseDiffOp,
        type DiffOp,
        type LonLatBbox,
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
        /** Fit bounds from this list so toggling visible features does not jump. */
        envelopeFeatures?: Feature[] | null;
    };

    let {
        features,
        selectedId = null,
        class: klass = "",
        envelopeFeatures = null,
    }: Props = $props();

    let container = $state<HTMLDivElement>();
    let mounted = $state(false);
    let mapReady = $state(false);
    let map = $state<LeafletMap | null>(null);
    let Lref: LeafletNS | null = null;
    let cluster: MarkerClusterGroup | null = null;
    let geoLayer: LeafletGeoJSON | null = null;
    let didFit = false;
    let lastFitKey = "";
    let lastFitArea = 0;
    let stopResize: (() => void) | undefined;
    let stopFitResize: (() => void) | undefined;

    const MIN_FIT_AREA = 80 * 80;

    function envelopeKey(
        box: LonLatBbox | null,
        list: Feature[],
        focusId: string,
    ): string {
        if (!box || list.length === 0) return "";
        const ids = list.map((f) => f.id).join("|");
        return `${focusId}:${list.length}:${box.west.toFixed(6)}:${box.south.toFixed(6)}:${box.east.toFixed(6)}:${box.north.toFixed(6)}:${ids}`;
    }

    function mapArea(m: LeafletMap): number {
        try {
            const s = m.getSize();
            return Math.max(0, s.x) * Math.max(0, s.y);
        } catch {
            return 0;
        }
    }

    function fitToEnvelope(m: LeafletMap, L: LeafletNS, box: LonLatBbox) {
        const pad = 0.00015;
        const west = Math.min(box.west, box.east) - pad;
        const east = Math.max(box.west, box.east) + pad;
        const south = Math.min(box.south, box.north) - pad;
        const north = Math.max(box.south, box.north) + pad;
        m.fitBounds(L.latLngBounds([south, west], [north, east]), {
            padding: [36, 36],
            maxZoom: 19,
            animate: false,
        });
    }

    function tryFit() {
        const L = Lref;
        const m = map;
        if (!L || !m) return;
        const focus =
            envelopeFeatures && envelopeFeatures.length > 0
                ? envelopeFeatures
                : selectedId != null
                  ? features.filter((f) => f.id === selectedId)
                  : features;
        const fitList = focus.length ? focus : features;
        const box = bboxFromDiffGeoms(fitList);
        const key = envelopeKey(box, fitList, envelopeFeatures?.length ? "" : (selectedId ?? ""));
        const area = mapArea(m);
        const needFit =
            Boolean(box) &&
            area >= 64 &&
            (!didFit || key !== lastFitKey || lastFitArea < MIN_FIT_AREA);
        if (!needFit || !box) return;
        try {
            m.invalidateSize({ animate: false });
        } catch {
            /* ignore */
        }
        try {
            fitToEnvelope(m, L, box);
            didFit = true;
            lastFitKey = key;
            lastFitArea = mapArea(m);
        } catch {
            /* empty / invalid bounds */
        }
    }

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
            try {
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
            } catch (err) {
                console.error("ReviewMap: geojson", err);
                geoLayer = null;
            }
        }

        tryFit();
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
                const fitRo = new ResizeObserver(() => {
                    if (!map || !Lref) return;
                    tryFit();
                });
                fitRo.observe(container);
                stopFitResize = () => fitRo.disconnect();
                cluster = createClusterGroup(L, {
                    disableClusteringAtZoom: 16,
                    maxClusterRadius: 44,
                }).addTo(m);
                Lref = L;
                map = m;
                tuneLeafletBasemap(m, isDark());
                m.invalidateSize();
                didFit = false;
                lastFitKey = "";
                lastFitArea = 0;
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
            stopFitResize?.();
            stopFitResize = undefined;
            cluster = null;
            geoLayer = null;
            Lref = null;
            didFit = false;
            lastFitKey = "";
            lastFitArea = 0;
            destroyLeafletMap(map);
            map = null;
        };
    });

    $effect(() => {
        features;
        selectedId;
        envelopeFeatures;
        if (map && Lref) redrawFeatures();
    });

    $effect(() => {
        themePrefs.accentHue;
        themePrefs.bgBase;
        themePrefs.colorScheme;
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
