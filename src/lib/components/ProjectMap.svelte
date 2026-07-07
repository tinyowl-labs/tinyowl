<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";
    import { isDark } from "$lib/stores/theme.svelte";
    import type { Centroid } from "../../routes/+page.server";

    type Props = {
        centroids: Centroid[];
        class?: string;
    };

    let { centroids, class: klass = "" }: Props = $props();

    let container = $state<HTMLDivElement>();
    let mounted = $state(false);

    onMount(() => {
        mounted = true;
    });

    $effect(() => {
        if (!mounted || !container || !browser || centroids.length === 0) return;

        let cleanup: (() => void) | undefined;

        import("leaflet").then(async ({ default: L }) => {
            await import("leaflet/dist/leaflet.css");

            const map = L.map(container!, {
                attributionControl: true,
                zoomControl: true,
                scrollWheelZoom: true,
            }).setView([20, 0], 2);

            const dark = isDark();
            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            }).addTo(map);

            if (dark) {
                container!.classList.add("leaflet-dark");
            }

            const bounds = L.latLngBounds([]);

            for (const c of centroids) {
                if (!c.lat || !c.lng) continue;

                const marker = L.circleMarker([c.lat, c.lng], {
                    radius: 6,
                    fillColor: dark ? "#93c5fd" : "#2563eb",
                    color: dark ? "#60a5fa" : "#1d4ed8",
                    weight: 2,
                    fillOpacity: 0.7,
                }).addTo(map);

                const detail =
                    c.entity_count > 0
                        ? `${c.entity_count.toLocaleString()} entities across ${c.table_count} tables`
                        : `${c.table_count} tables`;

                marker.bindPopup(
                    `<div style="font-family: system-ui, sans-serif; font-size: 13px;">
                        <strong>${escapeHTML(c.title)}</strong><br/>
                        <span style="color: #666;">${detail}</span><br/>
                        <a href="/${c.slug}" style="color: #2563eb; font-size: 12px;">View project →</a>
                    </div>`,
                    { closeButton: false, className: dark ? "leaflet-dark-popup" : "" },
                );

                marker.on("click", () => {
                    goto(`/${c.slug}`);
                });

                bounds.extend([c.lat, c.lng]);
            }

            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 });
            }
        });

        return () => cleanup?.();
    });

    function escapeHTML(str: string): string {
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
</script>

<div
    class="rounded-xl border border-border overflow-hidden bg-secondary/20 {klass}"
>
    <div bind:this={container} class="w-full h-full"></div>
</div>
