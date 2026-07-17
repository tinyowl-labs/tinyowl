<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";
    import { isDark, mapColors, themePrefs } from "$lib/stores/theme.svelte";
    import { searchHref } from "$lib/search/params";
    import type { Centroid } from "../../routes/+page.server";
    import {
        cesiumColorFromCss,
        createCesiumMap,
        destroyCesiumViewer,
        loadCesiumGlobal,
        tuneCesiumBasemap,
        viewRectangle,
    } from "./cesiumBoot";
    import CesiumLoading from "./CesiumLoading.svelte";
    import CesiumAttribution from "./CesiumAttribution.svelte";

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
    let creditSink = $state<HTMLDivElement>();
    let mounted = $state(false);
    let viewer: any = null;
    let Cesium: any = null;
    let clickHandler: any = null;
    let error = $state("");
    let mapReady = $state(false);

    onMount(() => {
        mounted = true;
    });

    function searchThisArea() {
        if (!viewer || !Cesium) return;
        const rect = viewRectangle(viewer, Cesium);
        if (!rect) return;
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
        if (!mounted || !container || !creditSink || !browser || list.length === 0)
            return;

        let cancelled = false;
        let cleanup: (() => void) | undefined;
        let resizeObs: ResizeObserver | undefined;
        mapReady = false;

        void (async () => {
            try {
                Cesium = await loadCesiumGlobal();
                if (cancelled || !container || !creditSink) return;

                viewer = createCesiumMap(Cesium, container, creditSink, {
                    requestRenderMode: false,
                });
                tuneCesiumBasemap(viewer, Cesium, isDark());

                const colors = mapColors();
                const marker =
                    cesiumColorFromCss(Cesium, colors.marker, "#3b82f6") ??
                    Cesium.Color.DODGERBLUE;
                const stroke =
                    cesiumColorFromCss(Cesium, colors.stroke, "#1d4ed8") ??
                    Cesium.Color.WHITE;
                const positions: any[] = [];

                for (const c of list) {
                    const position = Cesium.Cartesian3.fromDegrees(
                        c.lng,
                        c.lat,
                        0,
                    );
                    positions.push(position);
                    const detail =
                        c.entity_count > 0
                            ? `${c.entity_count.toLocaleString()} entities across ${c.table_count} tables`
                            : `${c.table_count} tables`;
                    viewer.entities.add({
                        id: `project:${c.slug}`,
                        position,
                        point: {
                            pixelSize: 12,
                            color: marker.withAlpha(0.9),
                            outlineColor: stroke,
                            outlineWidth: 2,
                            heightReference: Cesium.HeightReference.NONE,
                            disableDepthTestDistance: Number.POSITIVE_INFINITY,
                        },
                        label: {
                            text: c.title,
                            font: "12px sans-serif",
                            fillColor: Cesium.Color.WHITE,
                            outlineColor: Cesium.Color.BLACK,
                            outlineWidth: 3,
                            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                            pixelOffset: new Cesium.Cartesian2(0, -14),
                            disableDepthTestDistance: Number.POSITIVE_INFINITY,
                            show: list.length <= 40,
                        },
                        description: `<div class="text-[13px]">
                            <strong>${escapeHTML(c.title)}</strong><br/>
                            <span class="opacity-60">${detail}</span>
                        </div>`,
                        properties: { slug: c.slug },
                    });
                }

                clickHandler = new Cesium.ScreenSpaceEventHandler(
                    viewer.scene.canvas,
                );
                clickHandler.setInputAction(
                    (click: { position: unknown }) => {
                        const picked = viewer.scene.pick(click.position);
                        const entity = picked?.id;
                        const slug =
                            entity?.properties?.slug?.getValue?.() ??
                            entity?.properties?.slug;
                        if (slug) goto(`/${String(slug)}`);
                    },
                    Cesium.ScreenSpaceEventType.LEFT_CLICK,
                );

                if (positions.length === 1) {
                    const only = list[0]!;
                    await viewer.camera.flyTo({
                        destination: Cesium.Cartesian3.fromDegrees(
                            only.lng,
                            only.lat,
                            1_500_000,
                        ),
                        duration: 0.8,
                    });
                } else if (positions.length > 1) {
                    const bs = Cesium.BoundingSphere.fromPoints(positions);
                    await viewer.camera.flyToBoundingSphere(bs, {
                        duration: 0.8,
                        offset: new Cesium.HeadingPitchRange(
                            0,
                            Cesium.Math.toRadians(-90),
                            Math.max(bs.radius * 3, 400_000),
                        ),
                    });
                }

                if (!cancelled) mapReady = true;

                resizeObs = new ResizeObserver(() => {
                    try {
                        viewer?.resize();
                        viewer?.scene?.requestRender();
                    } catch {
                        /* ignore */
                    }
                });
                resizeObs.observe(container);

                viewer.resize();
                viewer.scene.requestRender();
                error = "";
                cleanup = () => {
                    resizeObs?.disconnect();
                    try {
                        clickHandler?.destroy?.();
                    } catch {
                        /* ignore */
                    }
                    clickHandler = null;
                    destroyCesiumViewer(viewer);
                    viewer = null;
                };
            } catch (e) {
                error =
                    e instanceof Error ? e.message : "Failed to start map";
                console.warn("ProjectMap Cesium failed", e);
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
        class="relative rounded-xl border border-border overflow-hidden bg-secondary/20 h-full min-h-70"
    >
        <div bind:this={container} class="w-full h-full min-h-70"></div>
        <div bind:this={creditSink} class="hidden"></div>
        {#if !mapReady && !error}
            <CesiumLoading />
        {/if}
        {#if mapReady}
            <CesiumAttribution />
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
