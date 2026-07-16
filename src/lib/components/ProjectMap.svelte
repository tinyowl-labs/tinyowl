<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";
    import {
        isDark,
        mapColors,
        themePrefs,
    } from "$lib/stores/theme.svelte";
    import {
        searchHref,
    } from "$lib/search/params";
    import type { Centroid } from "../../routes/+page.server";

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
    let mapRef: any = null;

    onMount(() => {
        mounted = true;
    });

    function searchThisArea() {
        if (!mapRef) return;
        const bounds = mapRef.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        goto(
            searchHref({
                bbox: {
                    west: parseFloat(sw.lng.toFixed(6)),
                    south: parseFloat(sw.lat.toFixed(6)),
                    east: parseFloat(ne.lng.toFixed(6)),
                    north: parseFloat(ne.lat.toFixed(6)),
                },
            }),
        );
    }

    $effect(() => {
        // Re-init when theme accent / bg changes so markers pick up new colors.
        themePrefs.accentHue;
        themePrefs.bgBase;
        if (!mounted || !container || !browser || centroids.length === 0) return;

        let cleanup: (() => void) | undefined;
        let cancelled = false;

        import("leaflet").then(async ({ default: L }) => {
            if (cancelled || !container) return;
            await import("leaflet/dist/leaflet.css");

            const map = L.map(container!, {
                attributionControl: true,
                zoomControl: true,
                scrollWheelZoom: true,
            }).setView([20, 0], 2);
            mapRef = map;

            const dark = isDark();
            const colors = mapColors();
            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            }).addTo(map);

            container!.classList.toggle("leaflet-dark", dark);

            const bounds = L.latLngBounds([]);

            for (const c of centroids) {
                if (!c.lat || !c.lng) continue;

                const marker = L.circleMarker([c.lat, c.lng], {
                    radius: 6,
                    fillColor: colors.marker,
                    color: colors.stroke,
                    weight: 2,
                    fillOpacity: 0.7,
                }).addTo(map);

                const detail =
                    c.entity_count > 0
                        ? `${c.entity_count.toLocaleString()} entities across ${c.table_count} tables`
                        : `${c.table_count} tables`;

                marker.bindPopup(
                    `<div class="text-[13px]">
                        <strong>${escapeHTML(c.title)}</strong><br/>
                        <span class="map-popup-muted">${detail}</span><br/>
                        <a href="/${c.slug}" class="text-xs">View project →</a>
                    </div>`,
                    { closeButton: false },
                );

                marker.on("click", () => {
                    goto(`/${c.slug}`);
                });

                bounds.extend([c.lat, c.lng]);
            }

            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 });
            }

            cleanup = () => {
                mapRef = null;
                map.remove();
            };
        });

        return () => {
            cancelled = true;
            cleanup?.();
        };
    });

    function escapeHTML(str: string): string {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }
</script>

<div class="relative {klass}">
    <div
        class="rounded-xl border border-border overflow-hidden bg-secondary/20 h-full min-h-70"
    >
        <div bind:this={container} class="w-full h-full min-h-70"></div>
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
