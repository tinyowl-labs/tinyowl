<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";
    import { isDark } from "$lib/stores/theme.svelte";

    type ResultMarker = {
        slug: string;
        title: string;
        bbox: string | null;
    };

    type Props = {
        centerLat: number | null;
        centerLng: number | null;
        radius: number;
        results: ResultMarker[];
        onChange: () => void;
    };

    let {
        centerLat = $bindable(null),
        centerLng = $bindable(null),
        radius = $bindable(5000),
        results = [],
        onChange,
    }: Props = $props();

    let container = $state<HTMLDivElement>();
    let mounted = $state(false);
    let circle: any = null;

    onMount(() => {
        mounted = true;
    });

    function formatRadius(m: number): string {
        if (m < 1000) return `${m}m`;
        if (m < 100000) return `${(m / 1000).toFixed(0)}km`;
        return `${(m / 1000).toFixed(0)}km`;
    }

    function bboxCentroid(bbox: string): { lat: number; lng: number } | null {
        try {
            const geojson = JSON.parse(bbox);
            const coords = geojson?.coordinates?.[0];
            if (!coords || coords.length < 4) return null;
            let minLat = Infinity,
                maxLat = -Infinity,
                minLng = Infinity,
                maxLng = -Infinity;
            for (const c of coords) {
                if (c[1] < minLat) minLat = c[1];
                if (c[1] > maxLat) maxLat = c[1];
                if (c[0] < minLng) minLng = c[0];
                if (c[0] > maxLng) maxLng = c[0];
            }
            return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
        } catch {
            return null;
        }
    }

    $effect(() => {
        if (!mounted || !container || !browser) return;

        let cleanup: (() => void) | undefined;

        import("leaflet").then(async ({ default: L }) => {
            await import("leaflet/dist/leaflet.css");

            const map = L.map(container!, {
                attributionControl: true,
                zoomControl: true,
                scrollWheelZoom: true,
            }).setView(
                centerLat && centerLng ? [centerLat, centerLng] : [20, 0],
                centerLat && centerLng ? 10 : 2,
            );

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
            let marker: L.CircleMarker | null = null;
            let localCircle: L.Circle | null = null;

            // Result markers
            const resultColor = dark ? "#f59e0b" : "#d97706"; // amber
            for (const r of results) {
                if (!r.bbox) continue;
                const c = bboxCentroid(r.bbox);
                if (!c) continue;

                const m = L.circleMarker([c.lat, c.lng], {
                    radius: 5,
                    fillColor: resultColor,
                    color: resultColor,
                    weight: 1.5,
                    fillOpacity: 0.6,
                }).addTo(map);

                m.bindPopup(
                    `<div style="font-family: system-ui, sans-serif; font-size: 13px;">
                        <strong>${escapeHTML(r.title)}</strong><br/>
                        <a href="/${r.slug}" style="color: #2563eb; font-size: 12px;">View project →</a>
                    </div>`,
                    { closeButton: false },
                );

                m.on("click", () => goto(`/${r.slug}`));

                bounds.extend([c.lat, c.lng]);
            }

            function updateMarker() {
                if (!centerLat || !centerLng) return;

                if (marker) map.removeLayer(marker);
                if (localCircle) map.removeLayer(localCircle);

                const color = dark ? "#93c5fd" : "#2563eb";

                marker = L.circleMarker([centerLat, centerLng], {
                    radius: 6,
                    fillColor: color,
                    color: color,
                    weight: 2,
                    fillOpacity: 0.8,
                }).addTo(map);

                localCircle = L.circle([centerLat, centerLng], {
                    radius: radius,
                    fillColor: color,
                    color: color,
                    weight: 1,
                    fillOpacity: 0.1,
                }).addTo(map);
                circle = localCircle;

                bounds.extend([centerLat, centerLng]);
            }

            if (centerLat && centerLng) {
                updateMarker();
            }

            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
            }

            map.on("click", (e: L.LeafletMouseEvent) => {
                centerLat = parseFloat(e.latlng.lat.toFixed(6));
                centerLng = parseFloat(e.latlng.lng.toFixed(6));
                updateMarker();
                onChange();
            });

            cleanup = () => map.remove();
        });

        return () => cleanup?.();
    });

    // Update circle radius reactively when the slider moves
    $effect(() => {
        if (circle && centerLat && centerLng) {
            circle.setRadius(radius);
        }
    });

    function escapeHTML(str: string): string {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }
</script>

<div
    class="rounded-lg border border-border overflow-hidden bg-secondary/20 h-64"
>
    <div bind:this={container} class="w-full h-full"></div>
</div>

<div class="mt-3 flex items-center gap-3">
    <label for="radius-slider" class="text-xs text-muted-foreground shrink-0">
        Radius: <span class="font-medium text-foreground"
            >{formatRadius(radius)}</span
        >
    </label>
    <input
        id="radius-slider"
        type="range"
        min="1000"
        max="100000"
        step="1000"
        bind:value={radius}
        oninput={onChange}
        class="flex-1 h-1.5 accent-primary"
    />
</div>
