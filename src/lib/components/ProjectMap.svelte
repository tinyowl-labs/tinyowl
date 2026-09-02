<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";
    import { isDark, mapColors, themePrefs } from "$lib/stores/theme.svelte";
    import { searchHref } from "$lib/search/params";
    import type { Centroid } from "../../routes/+page.server";
    import type { Map as LeafletMap } from "leaflet";
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

    type Props = {
        centroids: Centroid[];
        class?: string;
        /** Show "Search this area" control that navigates to /search */
        enableAreaSearch?: boolean;
    };

    let {
        centroids,
        class: klass = "",
        enableAreaSearch = true,
    }: Props = $props();

    let container = $state<HTMLDivElement>();
    let mounted = $state(false);
    let map: LeafletMap | null = null;
    let error = $state("");
    let mapReady = $state(false);

    onMount(() => {
        mounted = true;
    });

    function searchThisArea() {
        if (!map) return;
        const rect = viewBounds(map);
        goto(
            searchHref({
                bbox: {
                    west: parseFloat(rect.west.toFixed(6)),
                    south: parseFloat(rect.south.toFixed(6)),
                    east: parseFloat(rect.east.toFixed(6)),
                    north: parseFloat(rect.north.toFixed(6)),
                },
            }),
        );
    }

    function escapeHTML(str: string): string {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function hasCoord(c: Centroid): boolean {
        return Number.isFinite(c.lat) && Number.isFinite(c.lng);
    }

    $effect(() => {
        themePrefs.accentHue;
        themePrefs.bgBase;
        const list = centroids.filter(hasCoord);
        if (!mounted || !container || !browser) return;

        let cancelled = false;
        let cleanup: (() => void) | undefined;
        mapReady = false;

        void (async () => {
            try {
                const L: LeafletNS = await loadLeafletWithCluster();
                if (cancelled || !container) return;

                map = createLeafletMap(L, container);
                const stopResize = observeLeafletResize(map, container);
                cleanup = () => {
                    stopResize();
                    destroyLeafletMap(map);
                    map = null;
                };
                if (cancelled) {
                    cleanup();
                    return;
                }
                tuneLeafletBasemap(map, isDark());
                map.invalidateSize();

                if (list.length > 0) {
                    const colors = mapColors();
                const fill = colors.marker || "#3b82f6";
                const showLabels = list.length <= 40;
                const latlngs: [number, number][] = [];
                const cluster = createClusterGroup(L, {
                    disableClusteringAtZoom: 12,
                    maxClusterRadius: 56,
                });

                for (const c of list) {
                    latlngs.push([c.lat, c.lng]);
                    const detail =
                        c.entity_count > 0
                            ? `${c.entity_count.toLocaleString()} entities across ${c.table_count} tables`
                            : `${c.table_count} tables`;
                    const marker = L.circleMarker([c.lat, c.lng], {
                        radius: 7,
                        color: "#fff",
                        weight: 2,
                        fillColor: fill,
                        fillOpacity: 1,
                        opacity: 1,
                    });
                    if (showLabels) {
                        marker.on("add", () => {
                            marker.getElement()?.setAttribute("title", detail);
                        });
                    }
                    cluster.addLayer(marker);

                    marker.bindTooltip(
                        showLabels
                            ? escapeHTML(c.title)
                            : `<div class="text-[13px]"><strong>${escapeHTML(c.title)}</strong><br/><span class="opacity-60">${escapeHTML(detail)}</span></div>`,
                        {
                            permanent: showLabels,
                            direction: "top",
                            offset: [0, -8],
                            className: "leaflet-map-label",
                            opacity: 1,
                        },
                    );

                    const slug = c.slug;
                    marker.on("click", () => goto(`/${slug}`));
                }

                cluster.addTo(map);

                if (latlngs.length === 1) {
                    map.setView(latlngs[0]!, 6);
                } else {
                    const bounds = cluster.getBounds();
                    if (bounds.isValid()) {
                        map.fitBounds(bounds, {
                            padding: [40, 40],
                            maxZoom: 8,
                            animate: true,
                            duration: 0.8,
                        });
                    }
                }
                }

                if (!cancelled) mapReady = true;

                map.invalidateSize();
                error = "";
            } catch (e) {
                error =
                    e instanceof Error ? e.message : "Failed to start map";
                console.warn("ProjectMap Leaflet failed", e);
            }
        })();

        return () => {
            cancelled = true;
            cleanup?.();
        };
    });
</script>

<div class="relative {klass}">
    <div
        class="leaflet-locator relative h-full min-h-0 overflow-hidden rounded-xl border border-border bg-secondary/20"
    >
        <div bind:this={container} class="h-full min-h-0 w-full"></div>
        {#if !mapReady && !error}
            <MapLoading />
        {/if}
        {#if mapReady && !error}
            <MapAttribution />
        {/if}
        {#if error}
            <div
                class="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground"
            >
                {error}
            </div>
        {/if}
    </div>
    {#if enableAreaSearch}
        <button
            type="button"
            onclick={searchThisArea}
            class="absolute bottom-3 left-1/2 z-1000 -translate-x-1/2 rounded-full border border-border glass-overlay px-3.5 py-1.5 text-xs font-medium shadow-sm hover:bg-muted transition-colors"
        >
            Search this area
        </button>
    {/if}
</div>
