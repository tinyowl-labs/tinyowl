<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { isDark, mapColors, themePrefs } from "$lib/stores/theme.svelte";

    type Props = {
        bbox: string;
        href?: string;
        class?: string;
    };

    let { bbox, href = "", class: klass = "" }: Props = $props();

    let container = $state<HTMLDivElement>();
    let mounted = $state(false);

    onMount(() => {
        mounted = true;
    });

    $effect(() => {
        themePrefs.accentHue;
        themePrefs.bgBase;
        if (!mounted || !container || !browser) return;

        let cleanup: (() => void) | undefined;
        let cancelled = false;

        import("leaflet").then(async ({ default: L }) => {
            if (cancelled || !container) return;
            await import("leaflet/dist/leaflet.css");

            const map = L.map(container!, {
                attributionControl: false,
                zoomControl: false,
                dragging: false,
                scrollWheelZoom: false,
                touchZoom: false,
                doubleClickZoom: false,
            }).setView([0, 0], 1);

            const dark = isDark();
            const colors = mapColors();
            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
            }).addTo(map);
            container!.classList.toggle("leaflet-dark", dark);

            try {
                const geojson = JSON.parse(bbox);
                L.geoJSON(geojson, {
                    style: {
                        color: colors.stroke,
                        weight: 3,
                        fillColor: colors.marker,
                        fillOpacity: dark ? 0.2 : 0.15,
                    },
                }).addTo(map);
                map.fitBounds(L.geoJSON(geojson).getBounds(), {
                    padding: [20, 20],
                });
            } catch (_) {}

            cleanup = () => map.remove();
        });

        return () => {
            cancelled = true;
            cleanup?.();
        };
    });
</script>

{#if href}
    <a
        {href}
        class="block rounded-lg border border-border overflow-hidden hover:border-primary/50 transition-colors {klass}"
        aria-label="Project boundary map"
    >
        <div bind:this={container} class="w-full h-full bg-secondary/20"></div>
    </a>
{:else}
    <div
        class="rounded-lg border border-border overflow-hidden bg-secondary/20 {klass}"
    >
        <div bind:this={container} class="w-full h-full"></div>
    </div>
{/if}
