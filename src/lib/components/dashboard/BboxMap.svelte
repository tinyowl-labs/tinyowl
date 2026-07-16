<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { isDark, mapColors, themePrefs } from "$lib/stores/theme.svelte";
    import {
        cesiumColorFromCss,
        createCesiumMap,
        destroyCesiumViewer,
        loadCesiumGlobal,
        tuneCesiumBasemap,
    } from "../cesiumBoot";

    type Props = {
        bbox: string;
        href?: string;
        class?: string;
    };

    let { bbox, href = "", class: klass = "" }: Props = $props();

    let container = $state<HTMLDivElement>();
    let creditSink = $state<HTMLDivElement>();
    let mounted = $state(false);

    onMount(() => {
        mounted = true;
    });

    function ringFromGeoJSON(geojson: any): number[] | null {
        const coords = geojson?.coordinates?.[0];
        if (!Array.isArray(coords) || coords.length < 3) return null;
        const flat: number[] = [];
        for (const c of coords) {
            if (!Array.isArray(c) || c.length < 2) continue;
            flat.push(Number(c[0]), Number(c[1]), 0);
        }
        return flat.length >= 9 ? flat : null;
    }

    /** Expand a tight project bbox so the thumbnail shows context. */
    function paddedViewRectangle(Cesium: any, rect: any) {
        const west = Cesium.Math.toDegrees(rect.west);
        const south = Cesium.Math.toDegrees(rect.south);
        const east = Cesium.Math.toDegrees(rect.east);
        const north = Cesium.Math.toDegrees(rect.north);
        let dw = Math.max(east - west, 0.008);
        let dh = Math.max(north - south, 0.008);
        // Generous pad — site bboxes are tiny and looked "too zoomed in".
        dw *= 2.4;
        dh *= 2.4;
        // Match the wide banner aspect (~2.8:1) so height isn't cropped oddly.
        const aspect = 2.8;
        if (dw / dh < aspect) dw = dh * aspect;
        else dh = dw / aspect;
        const cx = (west + east) / 2;
        const cy = (south + north) / 2;
        return Cesium.Rectangle.fromDegrees(
            cx - dw / 2,
            cy - dh / 2,
            cx + dw / 2,
            cy + dh / 2,
        );
    }

    $effect(() => {
        themePrefs.accentHue;
        themePrefs.bgBase;
        if (!mounted || !container || !creditSink || !browser) return;

        let cancelled = false;
        let cleanup: (() => void) | undefined;

        void (async () => {
            try {
                const Cesium = await loadCesiumGlobal();
                if (cancelled || !container || !creditSink) return;

                const viewer = createCesiumMap(Cesium, container, creditSink, {
                    interactive: false,
                    requestRenderMode: false,
                });
                tuneCesiumBasemap(viewer, Cesium, isDark());

                const colors = mapColors();
                const fill = (
                    cesiumColorFromCss(Cesium, colors.marker, "#3b82f6") ??
                    Cesium.Color.DODGERBLUE
                ).withAlpha(isDark() ? 0.25 : 0.18);
                const stroke =
                    cesiumColorFromCss(Cesium, colors.stroke, "#1d4ed8") ??
                    Cesium.Color.WHITE;

                try {
                    const geojson = JSON.parse(bbox);
                    const flat = ringFromGeoJSON(geojson);
                    if (flat) {
                        const positions =
                            Cesium.Cartesian3.fromDegreesArrayHeights(flat);
                        viewer.entities.add({
                            polygon: {
                                hierarchy: positions,
                                material: fill,
                                outline: false,
                                height: 0,
                                heightReference: Cesium.HeightReference.NONE,
                            },
                            polyline: {
                                positions,
                                width: 2,
                                material: stroke,
                                clampToGround: false,
                            },
                        });
                        const tight =
                            Cesium.Rectangle.fromCartesianArray(positions);
                        viewer.camera.setView({
                            destination: paddedViewRectangle(Cesium, tight),
                        });
                    }
                } catch {
                    /* ignore bad bbox */
                }

                viewer.resize();
                viewer.scene.requestRender();
                cleanup = () => destroyCesiumViewer(viewer);
            } catch (e) {
                console.warn("BboxMap Cesium failed", e);
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
        class="block rounded-lg border border-border overflow-hidden hover:border-primary/50 transition-colors {klass}"
        aria-label="Project boundary map"
    >
        <div bind:this={container} class="w-full h-full bg-secondary/20"></div>
        <div bind:this={creditSink} class="hidden"></div>
    </a>
{:else}
    <div
        class="rounded-lg border border-border overflow-hidden bg-secondary/20 {klass}"
    >
        <div bind:this={container} class="w-full h-full"></div>
        <div bind:this={creditSink} class="hidden"></div>
    </div>
{/if}
