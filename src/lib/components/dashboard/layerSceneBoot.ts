/**
 * LayerScene Cesium Viewer construction.
 * Click / comment / pick handlers stay in the component.
 */
import { loadCesiumGlobal } from "$lib/components/cesiumBoot";
import {
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
 * Load Cesium, construct the Viewer on ellipsoid, wire render-request
 * listeners. Caller then applies stored imagery/terrain and scene mode.
 */
export async function createLayerViewer(
    opts: CreateLayerViewerOpts,
): Promise<LayerViewerCreated> {
    const Cesium = await loadCesiumGlobal();
    const scratchSphere = new Cesium.BoundingSphere();
    const ionAvailable = Boolean(opts.ionToken);
    if (opts.ionToken) Cesium.Ion.defaultAccessToken = opts.ionToken;

    const nextImagery = resolveImageryId(readStoredImageryId(), ionAvailable);
    const nextTerrain = resolveTerrainId(readStoredTerrainId(), ionAvailable);

    // Viewer first on ellipsoid — same as injalak. Do NOT pass
    // Terrain.fromWorldTerrain() here: that helper swaps the provider
    // asynchronously after ready, so early height samples land at Z≈0.
    const initialImagery =
        nextImagery === "none"
            ? false
            : new Cesium.ImageryLayer(createOsmImageryProvider(Cesium));
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
