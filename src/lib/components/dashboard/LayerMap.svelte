<script lang="ts">
    import { onMount } from "svelte";
    import type * as LType from "leaflet";
    import "leaflet/dist/leaflet.css";
    import { isDark } from "$lib/stores/theme.svelte";

    type LayerData = {
        name: string;
        geojson: GeoJSON.FeatureCollection;
        visible: boolean;
    };

    type Props = {
        layers?: LayerData[];
        loading?: boolean;
        rows?: Record<string, Record<string, unknown>[]>;
    };

    let { layers = [], loading = false, rows = {} }: Props = $props();

    let mapContainer = $state<HTMLDivElement>();
    let map: import("leaflet").Map | null = $state(null);
    let L: typeof LType | null = $state(null);
    let geoLayers: import("leaflet").GeoJSON[] = [];

    const LAYER_COLORS = [
        "#ef4444",
        "#3b82f6",
        "#22c55e",
        "#f59e0b",
        "#8b5cf6",
        "#ec4899",
        "#06b6d4",
        "#f97316",
    ];

    function colorForIndex(idx: number): string {
        return LAYER_COLORS[idx % LAYER_COLORS.length]!;
    }

    function buildPopupContent(layerName: string, entityId: string): string {
        const tableRows = rows[layerName] ?? [];
        const entity = tableRows.find((r) => (r.source_id ?? "") === entityId);
        if (!entity) {
            return `<div class="text-sm"><strong>${layerName}</strong><br /><span class="font-mono text-xs">${entityId}</span></div>`;
        }

        const fields = Object.entries(entity).filter(
            ([k]) => !k.startsWith("_") && k !== "geom" && k !== "entity_type",
        );

        let html = `<div class="text-sm max-w-xs max-h-64 overflow-y-auto">`;
        html += `<strong class="text-base">${layerName}</strong>`;
        html += `<div class="font-mono text-[10px] text-muted-foreground mb-2">${entityId}</div>`;

        for (const [key, val] of fields) {
            const label = key.replace(/_/g, " ");
            const display =
                val === null || val === undefined || val === ""
                    ? '<span class="text-muted-foreground italic">—</span>'
                    : String(val);
            html += `<div class="mt-1"><span class="font-medium text-[11px]">${label}</span><br /><span class="text-xs break-words">${display}</span></div>`;
        }
        html += `</div>`;
        return html;
    }

    onMount(async () => {
        if (!mapContainer) return;

        const leaflet = await import("leaflet");
        L = leaflet;

        map = L.map(mapContainer, {
            center: [-12.3, 133.0],
            zoom: 13,
            zoomControl: true,
        });

        if (isDark()) {
            mapContainer.classList.add("leaflet-dark");
        }

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors",
            maxZoom: 19,
        }).addTo(map);

        if (layers.length > 0) updateLayers();
    });

    function updateLayers() {
        if (!map || !L) return;

        for (const gl of geoLayers) map.removeLayer(gl);
        geoLayers = [];

        const allBounds = L.latLngBounds([]);

        for (let i = 0; i < layers.length; i++) {
            const { name, geojson, visible } = layers[i];
            const color = colorForIndex(i);

            const gl = L.geoJSON(geojson, {
                pointToLayer: (
                    _feature: GeoJSON.Feature,
                    latlng: LType.LatLng,
                ) => {
                    return L!.circleMarker(latlng, {
                        radius: 4,
                        fillColor: color,
                        color: color,
                        weight: 1.5,
                        opacity: 1,
                        fillOpacity: 0.7,
                    });
                },
                style: {
                    color: color,
                    weight: 1.5,
                    fillOpacity: 0.15,
                },
                onEachFeature: (
                    feature: GeoJSON.Feature,
                    layer: LType.Layer,
                ) => {
                    const props = feature.properties ?? {};
                    const id = (props.entity_id ?? "") as string;
                    layer.bindPopup(buildPopupContent(name, id), {
                        maxWidth: 320,
                    });
                },
            });

            if (visible) gl.addTo(map);
            geoLayers.push(gl);

            const b = gl.getBounds();
            if (b.isValid()) allBounds.extend(b);
        }

        if (allBounds.isValid()) {
            map.fitBounds(allBounds, { padding: [40, 40], maxZoom: 16 });
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
        if (layers.length > 0 && map && L) {
            updateLayers();
        }
    });

    onMount(() => {
        return () => map?.remove();
    });
</script>

<div class="relative w-full h-full">
    {#if loading}
        <div
            class="absolute inset-0 z-1000 flex items-center justify-center bg-background/50"
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

    <!-- Layer toggle -->
    {#if layers.length > 0}
        <div
            class="absolute top-2 right-2 z-999 bg-card border border-border rounded-lg shadow-lg p-2 min-w-35"
        >
            <div
                class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1"
            >
                Layers
            </div>
            {#each layers as layer, idx}
                <button
                    onclick={() => toggleLayer(idx)}
                    class="flex items-center gap-2 w-full rounded px-1.5 py-1 text-xs hover:bg-secondary transition-colors"
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
