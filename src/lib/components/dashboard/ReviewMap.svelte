<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { themePrefs } from "$lib/stores/theme.svelte";
    import {
        createCesiumMap,
        destroyCesiumViewer,
        loadCesiumGlobal,
        tuneCesiumBasemap,
    } from "../cesiumBoot";
    import CesiumLoading from "../CesiumLoading.svelte";
    import CesiumAttribution from "../CesiumAttribution.svelte";

    type Feature = {
        id: string;
        table: string;
        type: string;
        geometry: any;
    };

    type Props = {
        features: Feature[];
        selectedId: string | null;
        class?: string;
    };

    let { features, selectedId = null, class: klass = "" }: Props = $props();

    let container = $state<HTMLDivElement>();
    let creditSink = $state<HTMLDivElement>();
    let mounted = $state(false);
    let mapReady = $state(false);

    onMount(() => {
        mounted = true;
    });

    $effect(() => {
        themePrefs.accentHue;
        themePrefs.bgBase;
        void features;
        void selectedId;
        if (!mounted || !container || !creditSink || !browser) return;

        let cancelled = false;
        let cleanup: (() => void) | undefined;
        mapReady = false;

        void (async () => {
            try {
                const Cesium = await loadCesiumGlobal();
                if (cancelled || !container || !creditSink) return;

                const viewer = createCesiumMap(Cesium, container, creditSink, {
                    interactive: true,
                    requestRenderMode: false,
                });
                tuneCesiumBasemap(viewer, Cesium, false);

                const ds = new Cesium.CustomDataSource("review");
                await viewer.dataSources.add(ds);

                for (const f of features) {
                    if (!f.geometry) continue;
                    try {
                        const data = {
                            type: "Feature",
                            id: f.id,
                            properties: { table: f.table, type: f.type },
                            geometry: f.geometry,
                        };
                        const gj = await Cesium.GeoJsonDataSource.load(data, {
                            clampToGround: true,
                            stroke: Cesium.Color.fromCssColorString("#c45c26"),
                            fill: Cesium.Color.fromCssColorString(
                                "#c45c26",
                            ).withAlpha(0.35),
                            markerColor: Cesium.Color.fromCssColorString("#c45c26"),
                            markerSize: 48,
                        });
                        for (const e of gj.entities.values) {
                            e.id = f.id;
                            const isSel = selectedId === f.id;
                            if (e.point) {
                                e.point.pixelSize = isSel ? 14 : 10;
                                e.point.color = isSel
                                    ? Cesium.Color.YELLOW
                                    : Cesium.Color.fromCssColorString("#c45c26");
                                e.point.outlineColor = Cesium.Color.WHITE;
                                e.point.outlineWidth = isSel ? 2 : 1;
                            }
                            if (e.polygon) {
                                e.polygon.material = (
                                    isSel
                                        ? Cesium.Color.YELLOW
                                        : Cesium.Color.fromCssColorString(
                                              "#c45c26",
                                          )
                                ).withAlpha(0.4);
                            }
                            if (e.polyline) {
                                e.polyline.width = isSel ? 4 : 2;
                                e.polyline.material = isSel
                                    ? Cesium.Color.YELLOW
                                    : Cesium.Color.fromCssColorString("#c45c26");
                            }
                            ds.entities.add(e);
                        }
                    } catch {
                        /* skip bad geom */
                    }
                }

                if (ds.entities.values.length > 0) {
                    viewer.zoomTo(ds);
                }

                mapReady = true;
                cleanup = () => {
                    destroyCesiumViewer(viewer);
                };
            } catch (err) {
                console.error("ReviewMap:", err);
            }
        })();

        return () => {
            cancelled = true;
            cleanup?.();
        };
    });
</script>

<div class="relative w-full h-full min-h-[240px] {klass}">
    <div bind:this={container} class="absolute inset-0"></div>
    <div bind:this={creditSink} class="hidden"></div>
    {#if !mapReady}
        <CesiumLoading class="absolute inset-0" />
    {/if}
    <CesiumAttribution class="absolute bottom-1 right-1 z-10" />
</div>
