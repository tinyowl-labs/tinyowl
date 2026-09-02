<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { isDark, mapColors, themePrefs } from "$lib/stores/theme.svelte";
    import {
        createLeafletMap,
        destroyLeafletMap,
        loadLeaflet,
        observeLeafletResize,
        paddedLatLngBounds,
        tuneLeafletBasemap,
    } from "../leafletBoot";
    import MapLoading from "../MapLoading.svelte";
    import MapAttribution from "../MapAttribution.svelte";

    type Props = {
        bbox: string;
        href?: string;
        class?: string;
    };

    let { bbox, href = "", class: klass = "" }: Props = $props();

    let container = $state<HTMLDivElement>();
    let mounted = $state(false);
    let mapReady = $state(false);

    onMount(() => {
        mounted = true;
    });

    function asPolygon(raw: unknown): GeoJSON.Polygon | GeoJSON.Feature | null {
        if (!raw || typeof raw !== "object") return null;
        const g = raw as Record<string, unknown>;
        if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
            return raw as GeoJSON.Polygon;
        }
        if (g.type === "Feature" && asPolygon(g.geometry)) {
            return raw as GeoJSON.Feature;
        }
        return null;
    }

    $effect(() => {
        themePrefs.accentHue;
        themePrefs.bgBase;
        if (!mounted || !container || !browser) return;

        let cancelled = false;
        let cleanup: (() => void) | undefined;
        mapReady = false;

        void (async () => {
            try {
                const L = await loadLeaflet();
                if (cancelled || !container) return;

                const map = createLeafletMap(L, container, {
                    interactive: false,
                });
                const stopResize = observeLeafletResize(map, container);
                cleanup = () => {
                    stopResize();
                    destroyLeafletMap(map);
                };
                if (cancelled) {
                    cleanup();
                    return;
                }
                tuneLeafletBasemap(map, isDark());
                map.invalidateSize();

                const colors = mapColors();
                const fill = colors.marker || "#3b82f6";
                const stroke = colors.stroke || "#1d4ed8";

                try {
                    const parsed = asPolygon(JSON.parse(bbox));
                    if (parsed) {
                        const layer = L.geoJSON(parsed, {
                            style: {
                                color: stroke,
                                weight: 2,
                                fillColor: fill,
                                fillOpacity: isDark() ? 0.25 : 0.18,
                                opacity: 1,
                            },
                            interactive: false,
                        }).addTo(map);
                        const tight = layer.getBounds();
                        if (tight.isValid()) {
                            map.fitBounds(paddedLatLngBounds(L, tight), {
                                animate: true,
                                duration: 0.6,
                            });
                        }
                    }
                } catch {
                    /* ignore bad bbox */
                }

                map.invalidateSize();
                if (!cancelled) mapReady = true;
            } catch (e) {
                console.warn("BboxMap Leaflet failed", e);
                if (!cancelled) mapReady = true;
            }
        })();

        return () => {
            cancelled = true;
            cleanup?.();
        };
    });
</script>

{#if href}
    <a
        {href}
        class="leaflet-locator relative block rounded-lg border border-border overflow-hidden hover:border-primary/50 transition-colors {klass}"
        aria-label="Project boundary map"
    >
        <div bind:this={container} class="w-full h-full bg-secondary/20"></div>
        {#if !mapReady}
            <MapLoading />
        {/if}
        {#if mapReady}
            <MapAttribution />
        {/if}
    </a>
{:else}
    <div
        class="leaflet-locator relative rounded-lg border border-border overflow-hidden bg-secondary/20 {klass}"
    >
        <div bind:this={container} class="w-full h-full"></div>
        {#if !mapReady}
            <MapLoading />
        {/if}
        {#if mapReady}
            <MapAttribution />
        {/if}
    </div>
{/if}
