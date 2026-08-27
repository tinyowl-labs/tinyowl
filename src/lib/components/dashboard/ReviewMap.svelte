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

    function asGeometry(raw: unknown): any | null {
        if (!raw) return null;
        let g: any = raw;
        if (typeof g === "string") {
            try {
                g = JSON.parse(g);
            } catch {
                return null;
            }
        }
        if (!g || typeof g !== "object") return null;
        if (typeof g.type === "string" && Array.isArray(g.coordinates)) return g;
        if (g.type === "Feature" && g.geometry) return asGeometry(g.geometry);
        return null;
    }

    function addPointEntity(
        Cesium: any,
        ds: any,
        id: string,
        lon: number,
        lat: number,
        selected: boolean,
    ) {
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
        ds.entities.add({
            id,
            position: Cesium.Cartesian3.fromDegrees(lon, lat),
            point: {
                pixelSize: selected ? 14 : 10,
                color: selected
                    ? Cesium.Color.YELLOW
                    : Cesium.Color.fromCssColorString("#c45c26"),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: selected ? 2 : 1,
                heightReference: Cesium.HeightReference.NONE,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        });
    }

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

                const otherFeatures: any[] = [];
                const lons: number[] = [];
                const lats: number[] = [];
                for (const f of features) {
                    const geometry = asGeometry(f.geometry);
                    if (!geometry) continue;
                    if (
                        geometry.type === "Point" &&
                        Array.isArray(geometry.coordinates)
                    ) {
                        const lon = Number(geometry.coordinates[0]);
                        const lat = Number(geometry.coordinates[1]);
                        addPointEntity(
                            Cesium,
                            ds,
                            f.id,
                            lon,
                            lat,
                            selectedId === f.id,
                        );
                        if (Number.isFinite(lon) && Number.isFinite(lat)) {
                            lons.push(lon);
                            lats.push(lat);
                        }
                    } else {
                        otherFeatures.push({
                            type: "Feature",
                            id: f.id,
                            properties: { table: f.table, type: f.type },
                            geometry,
                        });
                    }
                }

                if (otherFeatures.length) {
                    try {
                        const gj = await Cesium.GeoJsonDataSource.load(
                            {
                                type: "FeatureCollection",
                                features: otherFeatures,
                            },
                            {
                                clampToGround: false,
                                stroke: Cesium.Color.fromCssColorString(
                                    "#c45c26",
                                ),
                                fill: Cesium.Color.fromCssColorString(
                                    "#c45c26",
                                ).withAlpha(0.35),
                            },
                        );
                        for (const e of gj.entities.values) {
                            ds.entities.add(e);
                        }
                    } catch (err) {
                        console.warn("ReviewMap GeoJSON load:", err);
                    }
                }

                const resize = () => {
                    try {
                        viewer.resize();
                        viewer.scene.requestRender();
                    } catch {
                        /* ignore */
                    }
                };
                resize();
                const ro = new ResizeObserver(resize);
                ro.observe(container);

                if (lons.length > 0) {
                    const pad = 0.08;
                    let west = Math.min(...lons) - pad;
                    let east = Math.max(...lons) + pad;
                    let south = Math.min(...lats) - pad;
                    let north = Math.max(...lats) + pad;
                    if (east - west < 0.15) {
                        west -= 0.08;
                        east += 0.08;
                    }
                    if (north - south < 0.15) {
                        south -= 0.08;
                        north += 0.08;
                    }
                    viewer.camera.setView({
                        destination: Cesium.Rectangle.fromDegrees(
                            west,
                            south,
                            east,
                            north,
                        ),
                    });
                } else if (ds.entities.values.length > 0) {
                    await viewer.zoomTo(ds);
                }

                mapReady = true;
                cleanup = () => {
                    ro.disconnect();
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

<div class="relative h-full w-full min-h-0 overflow-hidden {klass}">
    <div bind:this={container} class="absolute inset-0"></div>
    <div bind:this={creditSink} class="hidden"></div>
    {#if !mapReady}
        <CesiumLoading class="absolute inset-0" />
    {/if}
    <CesiumAttribution class="absolute bottom-1 right-1 z-10" />
</div>
