<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { isDark } from "$lib/stores/theme.svelte";

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
        if (!mounted || !container || !browser) return;

        let cleanup: (() => void) | undefined;

        import("leaflet").then(async ({ default: L }) => {
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
            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
            }).addTo(map);
            if (dark) {
                container!.classList.add("leaflet-dark");
            }

            try {
                const geojson = JSON.parse(bbox);
                const bboxColor = dark ? "#93c5fd" : "#2563eb";
                L.geoJSON(geojson, {
                    style: {
                        color: bboxColor,
                        weight: 3,
                        fillColor: bboxColor,
                        fillOpacity: dark ? 0.2 : 0.15,
                    },
                }).addTo(map);
                map.fitBounds(L.geoJSON(geojson).getBounds(), {
                    padding: [20, 20],
                });
            } catch (_) {}

            cleanup = () => map.remove();
        });

        return () => cleanup?.();
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
