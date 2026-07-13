<script lang="ts">
    import { onMount } from "svelte";
    import type * as LType from "leaflet";
    import "leaflet/dist/leaflet.css";
    import {
        isDark,
        mapLayerPalette,
        themePrefs,
    } from "$lib/stores/theme.svelte";
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

    type Props = {
        layers?: LayerData[];
        loading?: boolean;
        rows?: Record<string, Record<string, unknown>[]>;
        highlightId?: string;
        highlightLayer?: string;
        onSelectEntity?: (layerName: string, entityId: string) => void;
    };

    let {
        layers = [],
        loading = false,
        rows = {},
        highlightId = "",
        highlightLayer = "",
        onSelectEntity,
    }: Props = $props();

    let mapContainer = $state<HTMLDivElement>();
    let map: import("leaflet").Map | null = $state(null);
    let L: typeof LType | null = $state(null);
    let geoLayers: import("leaflet").GeoJSON[] = [];
    /** Leaflet layer currently selected via highlight deep-link or map click. */
    let selectedLeafletLayer: LType.Layer | null = null;
    let selectedLabel = $state<string | null>(null);
    /** Frame to layer bounds only once — never again on selection / rebuild. */
    let hasFramed = false;

    const palette = $derived(mapLayerPalette(8));

    function colorForIndex(idx: number): string {
        return palette[idx % palette.length]!;
    }

    function isHighlighted(layerName: string, entityId: string): boolean {
        return isEntityHighlighted(
            layerName,
            entityId,
            highlightId,
            highlightLayer,
            layers.map((l) => l.name),
        );
    }

    function selectEntity(
        layerName: string,
        entityId: string,
        layer: LType.Layer,
        notify = true,
    ) {
        selectedLeafletLayer = layer;
        selectedLabel = `${layerName.replace(/_/g, " ")} · ${entityId}`;
        if (notify) onSelectEntity?.(layerName, entityId);
        (layer as any).bringToFront?.();
        (layer as any).openPopup?.();
    }

    function applyHighlightFromUrl() {
        if (!map || !L || !highlightId) {
            if (!highlightId) selectedLabel = null;
            return;
        }
        const prefer = highlightLayer || "";
        let match: { name: string; layer: LType.Layer } | null = null;
        for (let i = 0; i < geoLayers.length; i++) {
            const name = layers[i]?.name;
            if (!name) continue;
            geoLayers[i]!.eachLayer((lyr) => {
                if (match && prefer && match.name === prefer) return;
                const feat = (lyr as any).feature as GeoJSON.Feature | undefined;
                if (!feat) return;
                if (featureEntityId(feat).trim() !== highlightId.trim()) return;
                if (!match || name === prefer) {
                    match = { name, layer: lyr };
                }
            });
        }
        if (!match) {
            selectedLabel = `Entity ${highlightId} not found on map`;
            return;
        }
        selectEntity(match.name, highlightId, match.layer, false);
    }

    onMount(() => {
        let cancelled = false;
        (async () => {
            if (!mapContainer) return;

            const leaflet = await import("leaflet");
            if (cancelled || !mapContainer) return;
            L = leaflet;

            map = L.map(mapContainer, {
                center: [20, 0],
                zoom: 2,
                zoomControl: true,
                maxZoom: 22,
            });

            mapContainer.classList.toggle("leaflet-dark", isDark());

            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: "&copy; OpenStreetMap contributors",
                maxZoom: 22,
                maxNativeZoom: 19,
            }).addTo(map);

            requestAnimationFrame(() => map?.invalidateSize());

            if (layers.length > 0) updateLayers();
        })();

        return () => {
            cancelled = true;
            map?.remove();
            map = null;
        };
    });

    function updateLayers() {
        if (!map || !L) return;

        for (const gl of geoLayers) map.removeLayer(gl);
        geoLayers = [];
        selectedLeafletLayer = null;

        const allBounds = L.latLngBounds([]);
        let pendingSelect: {
            layerName: string;
            entityId: string;
            layer: LType.Layer;
        } | null = null;

        for (let i = 0; i < layers.length; i++) {
            const { name, geojson, visible } = layers[i];
            const color = colorForIndex(i);

            const gl = L.geoJSON(geojson, {
                pointToLayer: (
                    feature: GeoJSON.Feature,
                    latlng: LType.LatLng,
                ) => {
                    const id = featureEntityId(feature);
                    const hit = isHighlighted(name, id);
                    return L!.circleMarker(latlng, {
                        radius: hit ? 9 : 4,
                        fillColor: color,
                        color: hit ? "#fff" : color,
                        weight: hit ? 3 : 1.5,
                        opacity: 1,
                        fillOpacity: hit ? 1 : 0.7,
                    });
                },
                style: (feature) => {
                    const id = featureEntityId(
                        feature ?? ({ properties: {} } as GeoJSON.Feature),
                    );
                    const hit = isHighlighted(name, id);
                    return {
                        color: color,
                        weight: hit ? 3 : 1.5,
                        fillOpacity: hit ? 0.35 : 0.15,
                    };
                },
                onEachFeature: (
                    feature: GeoJSON.Feature,
                    layer: LType.Layer,
                ) => {
                    const id = featureEntityId(feature);
                    layer.bindPopup(buildEntityPopupHtml(name, id, rows), {
                        maxWidth: 320,
                    });
                    layer.on("click", () => {
                        selectEntity(name, id, layer);
                    });
                    if (isHighlighted(name, id)) {
                        pendingSelect = {
                            layerName: name,
                            entityId: id,
                            layer,
                        };
                    }
                },
            });

            if (visible) gl.addTo(map);
            geoLayers.push(gl);

            const b = gl.getBounds();
            if (b.isValid()) allBounds.extend(b);
        }

        map.invalidateSize();

        // Default framing once only — selection must not move the camera.
        if (!hasFramed && allBounds.isValid()) {
            map.fitBounds(allBounds, { padding: [40, 40], maxZoom: 20 });
            hasFramed = true;
        }

        if (pendingSelect) {
            selectEntity(
                pendingSelect.layerName,
                pendingSelect.entityId,
                pendingSelect.layer,
                false,
            );
        } else if (highlightId) {
            applyHighlightFromUrl();
        } else {
            selectedLabel = null;
        }
    }

    function toggleLayer(idx: number) {
        if (!map) return;
        layers[idx].visible = !layers[idx].visible;
        const gl = geoLayers[idx];
        if (!gl) return;
        if (layers[idx].visible) {
            gl.addTo(map);
        } else {
            map.removeLayer(gl);
        }
    }

    /** Rebuild only when layer data / theme changes — not on ?highlight=. */
    let layersDataKey = $derived(
        layers
            .map(
                (l) =>
                    `${l.name}:${l.visible}:${l.geojson?.features?.length ?? 0}`,
            )
            .join("|"),
    );

    $effect(() => {
        themePrefs.accentHue;
        themePrefs.bgBase;
        layersDataKey;
        if (mapContainer) {
            mapContainer.classList.toggle("leaflet-dark", isDark());
        }
        if (layers.length > 0 && map && L) {
            updateLayers();
        }
    });

    /** Selection sync from URL without tearing down GeoJSON. */
    $effect(() => {
        highlightId;
        highlightLayer;
        layersDataKey;
        if (!map || !L) return;
        applyHighlightFromUrl();
    });
</script>

<div class="relative w-full h-full">
    {#if loading}
        <div
            class="absolute inset-0 z-1000 flex items-center justify-center glass-overlay"
        >
            <div class="text-sm text-muted-foreground animate-pulse">
                Loading map data…
            </div>
        </div>
    {/if}
    <div
        bind:this={mapContainer}
        class="w-full h-full rounded-lg border border-border"
    ></div>

    {#if selectedLabel}
        <div
            class="absolute bottom-3 left-3 z-999 max-w-sm rounded-md border border-border glass-panel px-2.5 py-1.5 text-xs text-foreground shadow-sm"
        >
            <span class="text-muted-foreground">Selected · </span>{selectedLabel}
        </div>
    {/if}

    {#if layers.length > 0}
        <div
            class="absolute top-2 right-2 z-999 glass-panel border border-border rounded-lg shadow-lg p-2 min-w-35"
        >
            <div
                class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1"
            >
                Layers
            </div>
            {#each layers as layer, idx}
                <button
                    onclick={() => toggleLayer(idx)}
                    class="flex items-center gap-2 w-full rounded-md px-1.5 py-1 text-xs hover:bg-secondary transition-colors"
                >
                    <span
                        class="size-2.5 rounded-full shrink-0"
                        style="background: {colorForIndex(
                            idx,
                        )}; opacity: {layer.visible ? '1' : '0.25'}"
                    ></span>
                    <span
                        class="text-foreground truncate {layer.visible
                            ? ''
                            : 'opacity-40'}"
                    >
                        {layer.name.replace(/_/g, " ")}
                    </span>
                    <span
                        class="text-[10px] text-muted-foreground ml-auto shrink-0"
                    >
                        {layer.geojson.features.length}
                    </span>
                </button>
            {/each}
        </div>
    {/if}
</div>
