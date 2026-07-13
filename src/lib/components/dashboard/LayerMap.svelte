<script lang="ts">
    import { onMount } from "svelte";
    import type * as LType from "leaflet";
    import "leaflet/dist/leaflet.css";
    import {
        isDark,
        mapLayerPalette,
        themePrefs,
    } from "$lib/stores/theme.svelte";

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
    };

    let {
        layers = [],
        loading = false,
        rows = {},
        highlightId = "",
        highlightLayer = "",
    }: Props = $props();

    let mapContainer = $state<HTMLDivElement>();
    let map: import("leaflet").Map | null = $state(null);
    let L: typeof LType | null = $state(null);
    let geoLayers: import("leaflet").GeoJSON[] = [];
    /** Leaflet layer currently selected via highlight deep-link or map click. */
    let selectedLeafletLayer: LType.Layer | null = null;
    let selectedLabel = $state<string | null>(null);

    const palette = $derived(mapLayerPalette(8));

    function colorForIndex(idx: number): string {
        return palette[idx % palette.length]!;
    }

    function idsEqual(a: string, b: string): boolean {
        return a.trim() === b.trim();
    }

    /** Prefer the named highlight layer when it exists; otherwise match by id anywhere. */
    function isHighlighted(layerName: string, entityId: string): boolean {
        if (!highlightId || !entityId) return false;
        if (!idsEqual(entityId, highlightId)) return false;
        if (!highlightLayer) return true;
        const namedExists = layers.some((l) => l.name === highlightLayer);
        if (!namedExists) return true;
        return layerName === highlightLayer;
    }

    function buildPopupContent(layerName: string, entityId: string): string {
        const tableRows = rows[layerName] ?? [];
        const entity = tableRows.find(
            (r) =>
                idsEqual(String(r.source_id ?? r.SOURCE_ID ?? ""), entityId),
        );
        if (!entity) {
            return `<div class="text-sm"><strong>${escapeHtml(layerName)}</strong><br /><span class="font-mono text-xs map-popup-muted">${escapeHtml(entityId)}</span></div>`;
        }

        const fields = Object.entries(entity).filter(
            ([k]) => !k.startsWith("_") && k !== "geom" && k !== "entity_type",
        );

        let html = `<div class="text-sm max-w-xs max-h-64 overflow-y-auto">`;
        html += `<strong class="text-base">${escapeHtml(layerName)}</strong>`;
        html += `<div class="font-mono text-[10px] map-popup-muted mb-2">${escapeHtml(entityId)}</div>`;

        for (const [key, val] of fields) {
            const label = key.replace(/_/g, " ");
            const display =
                val === null || val === undefined || val === ""
                    ? '<span class="map-popup-muted italic">—</span>'
                    : escapeHtml(String(val));
            html += `<div class="mt-1"><span class="font-medium text-[11px]">${escapeHtml(label)}</span><br /><span class="text-xs break-words">${display}</span></div>`;
        }
        html += `</div>`;
        return html;
    }

    function escapeHtml(s: string): string {
        return s
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function featureId(feature: GeoJSON.Feature): string {
        return String(
            feature.properties?.entity_id ??
                feature.properties?.source_id ??
                "",
        );
    }

    function latLngOfLayer(layer: LType.Layer): LType.LatLng | null {
        const any = layer as any;
        if (typeof any.getLatLng === "function") return any.getLatLng();
        if (typeof any.getBounds === "function") {
            const b = any.getBounds();
            if (b?.isValid?.()) return b.getCenter();
        }
        return null;
    }

    function selectEntity(layerName: string, entityId: string, layer: LType.Layer) {
        selectedLeafletLayer = layer;
        selectedLabel = `${layerName.replace(/_/g, " ")} · ${entityId}`;
        const ll = latLngOfLayer(layer);
        if (!map || !ll) {
            (layer as any).openPopup?.();
            return;
        }
        map.invalidateSize();
        const targetZoom = Math.max(map.getZoom(), 16);
        map.flyTo(ll, targetZoom, { duration: 0.55 });
        // Open popup after the fly settles so it anchors correctly.
        map.once("moveend", () => {
            (layer as any).bringToFront?.();
            (layer as any).openPopup?.();
        });
        // Fallback if already at destination (moveend may not fire).
        setTimeout(() => {
            (layer as any).bringToFront?.();
            (layer as any).openPopup?.();
        }, 650);
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
            });

            mapContainer.classList.toggle("leaflet-dark", isDark());

            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: "&copy; OpenStreetMap contributors",
                maxZoom: 19,
            }).addTo(map);

            // Layout may still be settling when first shown.
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
                    const id = featureId(feature);
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
                    const id = featureId(feature ?? ({ properties: {} } as any));
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
                    const id = featureId(feature);
                    layer.bindPopup(buildPopupContent(name, id), {
                        maxWidth: 320,
                    });
                    layer.on("click", () => {
                        selectedLabel = `${name.replace(/_/g, " ")} · ${id}`;
                        selectedLeafletLayer = layer;
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

        if (pendingSelect) {
            selectEntity(
                pendingSelect.layerName,
                pendingSelect.entityId,
                pendingSelect.layer,
            );
        } else {
            selectedLabel = highlightId
                ? `Entity ${highlightId} not found on map`
                : null;
            if (allBounds.isValid()) {
                map.fitBounds(allBounds, { padding: [40, 40], maxZoom: 16 });
            }
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

    $effect(() => {
        themePrefs.accentHue;
        themePrefs.bgBase;
        highlightId;
        highlightLayer;
        layers;
        rows;
        if (mapContainer) {
            mapContainer.classList.toggle("leaflet-dark", isDark());
        }
        if (layers.length > 0 && map && L) {
            updateLayers();
        }
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
