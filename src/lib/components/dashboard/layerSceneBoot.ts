/**
 * LayerScene Cesium Viewer construction.
 * Click / comment / pick handlers stay in the component.
 */
import { loadCesiumGlobal } from "$lib/components/cesiumBoot";
import {
    createImageryProvider,
    createOsmImageryProvider,
    readStoredImageryId,
    readStoredTerrainId,
    resolveImageryId,
    resolveTerrainId,
    type ImageryId,
    type TerrainId,
} from "$lib/components/cesiumProviders";

export type LayerViewerCreated = {
    Cesium: any;
    viewer: any;
    scratchSphere: any;
    ionAvailable: boolean;
    basemapLayer: any;
    nextImagery: ImageryId;
    nextTerrain: TerrainId;
    renderRequestRemovers: Array<() => void>;
};

export type CreateLayerViewerOpts = {
    container: HTMLElement;
    creditSink: HTMLElement;
    ionToken: string;
    bumpRender: () => void;
};

/**
 * Load Cesium and construct the Viewer with the user's stored basemap already
 * applied (no OSM warm-up when preference is aerial/topo/…). Terrain stays
 * ellipsoid here — world/bathy is applied after by the caller so height samples
 * do not race an async Terrain.fromWorldTerrain swap.
 */
export async function createLayerViewer(
    opts: CreateLayerViewerOpts,
): Promise<LayerViewerCreated> {
    const Cesium = await loadCesiumGlobal();
    const scratchSphere = new Cesium.BoundingSphere();
    const ionAvailable = Boolean(opts.ionToken);
    if (opts.ionToken) Cesium.Ion.defaultAccessToken = opts.ionToken;

    let nextImagery = resolveImageryId(readStoredImageryId(), ionAvailable);
    const nextTerrain = resolveTerrainId(readStoredTerrainId(), ionAvailable);

    let initialImagery: any = false;
    if (nextImagery !== "none") {
        try {
            const provider = await createImageryProvider(Cesium, nextImagery);
            initialImagery = provider
                ? new Cesium.ImageryLayer(provider)
                : false;
            if (!provider) nextImagery = "none";
        } catch (e) {
            console.warn(
                "[createLayerViewer] preferred imagery failed; falling back to OSM",
                nextImagery,
                e,
            );
            nextImagery = "osm";
            initialImagery = new Cesium.ImageryLayer(
                createOsmImageryProvider(Cesium),
            );
        }
    }

    const viewer = new Cesium.Viewer(opts.container, {
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        selectionIndicator: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        creditContainer: opts.creditSink,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
        skyBox: false,
        // Default true → 1× CSS pixels (soft/aliased on HiDPI).
        useBrowserRecommendedResolution: false,
        msaaSamples: 4,
        baseLayer: initialImagery,
    });

    let basemapLayer: any = null;
    if (nextImagery === "none") {
        while (viewer.imageryLayers.length > 0) {
            viewer.imageryLayers.remove(viewer.imageryLayers.get(0), true);
        }
        basemapLayer = null;
    } else {
        basemapLayer = viewer.imageryLayers.length
            ? viewer.imageryLayers.get(0)
            : null;
    }
    try {
        viewer.resize();
        viewer.scene.postProcessStages.fxaa.enabled = true;
    } catch {
        /* ignore */
    }
    viewer.scene.globe.depthTestAgainstTerrain = false;
    // Photogrammetry / 3D Tiles often don't write opaque depth; without this,
    // pickPosition falls through to the globe (terrain) under the mesh.
    viewer.scene.pickTranslucentDepth = true;
    try {
        viewer.screenSpaceEventHandler.removeInputAction(
            Cesium.ScreenSpaceEventType.LEFT_CLICK,
        );
    } catch {
        /* ignore */
    }

    const renderRequestRemovers: Array<() => void> = [];
    try {
        renderRequestRemovers.push(
            viewer.camera.changed.addEventListener(opts.bumpRender),
        );
        renderRequestRemovers.push(
            viewer.scene.globe.tileLoadProgressEvent.addEventListener(
                opts.bumpRender,
            ),
        );
    } catch {
        /* ignore */
    }

    return {
        Cesium,
        viewer,
        scratchSphere,
        ionAvailable,
        basemapLayer,
        nextImagery,
        nextTerrain,
        renderRequestRemovers,
    };
}
