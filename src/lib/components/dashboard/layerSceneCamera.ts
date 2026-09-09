/**
 * Camera framing for LayerScene: home, selection, search, 2D/3D morph.
 * Viewer lifetime stays in the component; this module owns sphere + fly math.
 */
import {
    collectPacketLonLats,
    preferRealLonLats,
    type PacketLonLat,
} from "./czmlLoad";
import type { LayerData } from "./layerTypes";
import type { ProjectTileset } from "./tilesetTypes";

export type HomeView = {
    destination: any;
    orientation: { heading: number; pitch: number; roll: number };
};

export type CameraSession = {
    homeView: HomeView | null;
    homeSphere: any | null;
    homeFlyStarted: boolean;
    lastInteropFlyKey: string;
};

export type PlaceBBox = {
    west: number;
    south: number;
    east: number;
    north: number;
};

export type LayerSceneCameraCtx = {
    Cesium: any;
    viewer: any;
    layers: LayerData[];
    models: ProjectTileset[];
    tilesetPrims: Map<string, any>;
    layerSources: Map<string, any>;
    bumpRender: () => void;
    pushExtentSphere: (spheres: any[], entity: any) => void;
    findEntitiesByKey: (key: string) => any[];
    session: CameraSession;
    searchQ: string;
    placeBBox: PlaceBBox | null | undefined;
    placeLat: number | null | undefined;
    placeLng: number | null | undefined;
    placeRadius: number | null | undefined;
    focusLayer: string;
    selectionKeys: () => string[];
    loading: boolean;
    getLastFlownKey: () => string;
    setLastFlownKey: (key: string) => void;
    setHasFramed: (framed: boolean) => void;
};

export function createCameraSession(): CameraSession {
    return {
        homeView: null,
        homeSphere: null,
        homeFlyStarted: false,
        lastInteropFlyKey: "",
    };
}

function sphereFromBboxWgs84(
    ctx: LayerSceneCameraCtx,
    bbox: number[],
    heightM: number,
): any | null {
    const { Cesium } = ctx;
    if (
        bbox.length !== 4 ||
        !bbox.every((n) => Number.isFinite(n)) ||
        !Cesium
    ) {
        return null;
    }
    const [west, south, east, north] = bbox;
    if (!(west < east && south < north)) return null;
    const rect = Cesium.Rectangle.fromDegrees(west, south, east, north);
    const sphere = Cesium.BoundingSphere.fromRectangle3D(
        rect,
        Cesium.Ellipsoid.WGS84,
        heightM,
    );
    // Site-scale meshes need a floor so the camera doesn't bury the trench.
    sphere.radius = Math.max(sphere.radius * 1.5, 30);
    return sphere;
}

function sphereFromLonLats(
    Cesium: any,
    pts: PacketLonLat[],
): any | null {
    if (!Cesium || pts.length === 0) return null;
    const cartesians = pts.map((p) =>
        Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 0),
    );
    const sphere = Cesium.BoundingSphere.fromPoints(cartesians);
    if (!sphere?.center || !(sphere.radius >= 0)) return null;
    sphere.radius = Math.max(sphere.radius * 1.5, 30);
    return sphere;
}

function sphereFromPackets(Cesium: any, packets: Record<string, unknown>[] | undefined) {
    return sphereFromLonLats(
        Cesium,
        preferRealLonLats(collectPacketLonLats(packets)),
    );
}

function sphereFromVisibleLayerPackets(ctx: LayerSceneCameraCtx): any | null {
    const pts: PacketLonLat[] = [];
    for (const layer of ctx.layers) {
        if (!layer.visible) continue;
        pts.push(...collectPacketLonLats(layer.packets));
    }
    return sphereFromLonLats(ctx.Cesium, preferRealLonLats(pts));
}

function frameHeightM(Cesium: any, prim: any | undefined): number {
    const c = prim?.boundingSphere?.center;
    if (c && Cesium) {
        const h = Cesium.Cartographic.fromCartesian(c).height;
        if (Number.isFinite(h)) return h;
    }
    return 100;
}

function poseForSphere(
    ctx: LayerSceneCameraCtx,
    sphere: any,
): { destination: any; orientation: any } | null {
    const { Cesium, viewer } = ctx;
    if (!viewer || !Cesium || !sphere?.center) return null;
    const mag = Cesium.Cartesian3.magnitude(sphere.center);
    if (!Number.isFinite(mag) || mag < 1_000_000) return null;
    try {
        const c = Cesium.Cartographic.fromCartesian(sphere.center);
        const lon = Cesium.Math.toDegrees(c.longitude);
        const lat = Cesium.Math.toDegrees(c.latitude);
        if (Math.abs(lon) < 1e-4 && Math.abs(lat) < 1e-4) return null;
    } catch {
        return null;
    }
    const is3d = viewer.scene.mode === Cesium.SceneMode.SCENE3D;
    const pitch = is3d
        ? Cesium.Math.toRadians(-45)
        : Cesium.Math.toRadians(-90);
    const range = Math.max(
        sphere.radius * (is3d ? 2.5 : 2.2),
        is3d ? 40 : 800,
    );
    const a = Math.abs(pitch);
    const local = new Cesium.Cartesian3(
        0,
        -range * Math.cos(a),
        range * Math.sin(a),
    );
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(sphere.center);
    const destination = Cesium.Matrix4.multiplyByPoint(
        enu,
        local,
        new Cesium.Cartesian3(),
    );
    return {
        destination,
        orientation: { heading: 0, pitch, roll: 0 },
    };
}

/** World-frame fly/setView — never lookAt / flyToBoundingSphere (those snap to 0,0). */
export async function flyCameraToSphere(
    ctx: LayerSceneCameraCtx,
    sphere: any,
    duration = 1.0,
) {
    const { Cesium, viewer } = ctx;
    if (!viewer || !Cesium || !sphere) return;
    const pose = poseForSphere(ctx, sphere);
    if (!pose) return;
    try {
        viewer.camera.cancelFlight();
    } catch {
        /* ignore */
    }
    try {
        viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    } catch {
        /* ignore */
    }
    if (duration <= 0) {
        viewer.camera.setView(pose);
        ctx.bumpRender();
        return;
    }
    const restoreRR = viewer.scene.requestRenderMode;
    viewer.scene.requestRenderMode = false;
    await new Promise<void>((resolve) => {
        viewer.camera.flyTo({
            ...pose,
            duration,
            complete: () => resolve(),
            cancel: () => resolve(),
        });
    });
    viewer.scene.requestRenderMode = restoreRR;
    ctx.bumpRender();
}

function captureHomeView(ctx: LayerSceneCameraCtx) {
    const { Cesium, viewer, session } = ctx;
    if (!viewer || !Cesium) return;
    try {
        session.homeView = {
            destination: Cesium.Cartesian3.clone(viewer.camera.positionWC),
            orientation: {
                heading: viewer.camera.heading,
                pitch: viewer.camera.pitch,
                roll: viewer.camera.roll,
            },
        };
    } catch {
        session.homeView = null;
    }
}

/** Entity-layer extent for Home. Tilesets are backdrop only — not part of home. */
function computeHomeSphere(ctx: LayerSceneCameraCtx): any | null {
    const { Cesium, viewer, layers, tilesetPrims, models } = ctx;
    if (!viewer || !Cesium) return null;
    const fromPackets = sphereFromVisibleLayerPackets(ctx);
    if (fromPackets) return fromPackets;
    // Visualizer spheres are not used — clamp-to-ground reports 0,0.
    // Tileset-only projects: fall back to mesh / bbox.
    const hasEntityLayers = layers.some(
        (l) =>
            (l.packets?.length ?? 0) > 0 || (l.entityIds?.length ?? 0) > 0,
    );
    if (hasEntityLayers) return null;
    for (const [hash, prim] of tilesetPrims) {
        if (!prim?.show) continue;
        try {
            if (prim.boundingSphere?.radius > 0) {
                return Cesium.BoundingSphere.clone(prim.boundingSphere);
            }
        } catch {
            /* ignore */
        }
        const m = models.find((x) => x.hash === hash);
        const bbox = m?.bbox_wgs84;
        if (Array.isArray(bbox)) {
            const s = sphereFromBboxWgs84(ctx, bbox, frameHeightM(Cesium, prim));
            if (s) return s;
        }
    }
    return null;
}

export async function flyHome(ctx: LayerSceneCameraCtx, duration = 1.0) {
    const { Cesium, viewer, session } = ctx;
    if (!viewer || !Cesium) return;
    const sphere = computeHomeSphere(ctx) ?? session.homeSphere;
    if (sphere) {
        session.homeSphere = Cesium.BoundingSphere.clone(sphere);
        await flyCameraToSphere(ctx, sphere, duration);
        captureHomeView(ctx);
        return;
    }
    if (session.homeView) {
        viewer.camera.flyTo({
            destination: session.homeView.destination,
            orientation: session.homeView.orientation,
            duration,
        });
    }
}

/** After 2D↔3D morph, reset camera frame and reframe to project data. */
export async function refocusAfterMorph(
    ctx: LayerSceneCameraCtx,
    is3d: boolean,
) {
    const { Cesium, viewer } = ctx;
    if (!viewer || !Cesium) return;
    try {
        viewer.camera.cancelFlight();
    } catch {
        /* ignore */
    }
    // Morph from SCENE2D can leave a non-identity transform; 3D flies then miss.
    try {
        viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    } catch {
        /* ignore */
    }
    // Let the scene settle one frame after morphComplete.
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    if (!viewer || viewer.isDestroyed?.()) return;
    await flyHome(ctx, is3d ? 0.85 : 0.5);
}

export async function flyToLayerExtent(
    ctx: LayerSceneCameraCtx,
    layerName: string,
) {
    const { Cesium, viewer, layers, layerSources } = ctx;
    if (!viewer || !Cesium) return;
    const layer = layers.find((l) => l.name === layerName);
    const fromPackets = sphereFromPackets(Cesium, layer?.packets);
    if (fromPackets) {
        await flyCameraToSphere(ctx, fromPackets, 1.0);
        return;
    }
    const ds = layerSources.get(layerName);
    if (!ds) return;
    const spheres: any[] = [];
    for (const entity of ds.entities.values) {
        ctx.pushExtentSphere(spheres, entity);
    }
    if (spheres.length === 0) return;
    const combined =
        spheres.length === 1
            ? spheres[0]
            : Cesium.BoundingSphere.fromBoundingSpheres(spheres);
    await flyCameraToSphere(ctx, combined, 1.0);
}

function searchInteropFlyKey(ctx: LayerSceneCameraCtx): string {
    if (ctx.searchQ.trim()) return "";
    const { placeBBox, placeLat, placeLng, placeRadius, focusLayer } = ctx;
    if (placeBBox) {
        return `bbox:${placeBBox.west},${placeBBox.south},${placeBBox.east},${placeBBox.north}`;
    }
    if (placeLat != null && placeLng != null) {
        return `pt:${placeLat},${placeLng},${placeRadius ?? 0}`;
    }
    if (focusLayer) return `layer:${focusLayer}`;
    return "";
}

async function flyToSearchPlace(
    ctx: LayerSceneCameraCtx,
    duration = 1.0,
) {
    const { Cesium, viewer, placeBBox, placeLat, placeLng, placeRadius } = ctx;
    if (!viewer || !Cesium) return;
    if (placeBBox) {
        const sphere = sphereFromBboxWgs84(
            ctx,
            [placeBBox.west, placeBBox.south, placeBBox.east, placeBBox.north],
            0,
        );
        if (sphere) await flyCameraToSphere(ctx, sphere, duration);
        return;
    }
    if (placeLat == null || placeLng == null) return;
    const center = Cesium.Cartesian3.fromDegrees(placeLng, placeLat);
    const radiusM = Math.max(placeRadius ?? 5000, 80);
    await flyCameraToSphere(
        ctx,
        new Cesium.BoundingSphere(center, radiusM),
        duration,
    );
}

export async function flySearchInterop(
    ctx: LayerSceneCameraCtx,
    force = false,
) {
    if (ctx.searchQ.trim()) return;
    const key = searchInteropFlyKey(ctx);
    // Layer extent is scene-graph / user only — never an automatic follow-up fly.
    if (!key || key.startsWith("layer:")) return;
    if (!force && key === ctx.session.lastInteropFlyKey) return;
    ctx.session.lastInteropFlyKey = key;
    await flyToSearchPlace(ctx);
}

export function flyTopDown(ctx: LayerSceneCameraCtx) {
    const { Cesium, viewer } = ctx;
    if (!viewer || !Cesium) return;
    viewer.camera.flyTo({
        destination: viewer.camera.position,
        orientation: {
            heading: 0,
            pitch: Cesium.Math.toRadians(-90),
            roll: 0,
        },
        duration: 1.0,
    });
}

export function lockNorthUp(ctx: LayerSceneCameraCtx) {
    const { Cesium, viewer } = ctx;
    if (!viewer || !Cesium) return;
    viewer.camera.flyTo({
        destination: viewer.camera.position,
        orientation: {
            heading: 0,
            pitch: viewer.camera.pitch,
            roll: 0,
        },
        duration: 1.0,
    });
}

export function selectionFlyKey(keys: Iterable<string>): string {
    return [...keys].sort().join("|");
}

export async function flyToSelection(
    ctx: LayerSceneCameraCtx,
    force = true,
) {
    const { Cesium } = ctx;
    const keys = ctx.selectionKeys().sort();
    if (keys.length === 0) return;
    const flyKey = keys.join("|");
    if (!force && flyKey && flyKey === ctx.getLastFlownKey()) return;

    const spheres: any[] = [];
    for (const key of keys) {
        for (const entity of ctx.findEntitiesByKey(key)) {
            ctx.pushExtentSphere(spheres, entity);
        }
    }
    if (spheres.length === 0) return;
    const combined =
        spheres.length === 1
            ? spheres[0]
            : Cesium.BoundingSphere.fromBoundingSpheres(spheres);
    ctx.setLastFlownKey(flyKey);
    await flyCameraToSphere(ctx, combined, 1.0);
}

/** Once after load: same flyHome() as the toolbar button. */
export function flyHomeOnce(ctx: LayerSceneCameraCtx) {
    const { Cesium, viewer, session, layers, models, loading } = ctx;
    if (session.homeFlyStarted || !viewer || !Cesium || loading) return;
    if (computeHomeSphere(ctx)) {
        session.homeFlyStarted = true;
        ctx.setLastFlownKey(selectionFlyKey(ctx.selectionKeys()));
        // First paint should not wait for a decorative camera animation.
        // User-triggered Home and later refocus operations still animate.
        void flyHome(ctx, 0).then(
            () => {
                ctx.setHasFramed(true);
            },
            () => {
                ctx.setHasFramed(true);
            },
        );
        return;
    }
    const expect =
        layers.some((l) => (l.packets?.length ?? 0) > 0) || models.length > 0;
    if (!expect) {
        session.homeFlyStarted = true;
        ctx.setHasFramed(true);
        return;
    }
    // Data is expected but no frameable extent is computable yet (tilesets
    // still loading with show==false, hidden layers, 2D mode). Release the
    // loading gate so the globe stays interactive, but leave homeFlyStarted
    // false so a later sync (tileset prim ready, layer visible) still frames.
    ctx.setHasFramed(true);
}
