/**
 * Length-profile / area / volume sampling: downward GPU picks.
 * Click heights stay authoritative for length; overlays must not be pickable.
 */
import {
    elevationProfile,
    sampledElevationProfile,
    sampledSurfaceArea,
    sampledVolume,
    type MeasureVertex,
    type ProfilePoint,
    type VolumeBreakdown,
} from "$lib/measure";

const CEILING_PAD_M = 50;
const FLOOR_PAD_M = 200;

export type ProfileSnap = "mesh" | "terrain" | "ellipsoid";

export type SampleGlobeOpts = {
    snap: ProfileSnap;
    isGlobePick: (obj: any) => boolean;
    /** Measure data source — hide + exclude so the overlay plane is not a hit. */
    overlay?: { show: boolean; entities?: { values: any[] } } | null;
};

function heightAtCartesian(Cesium: any, cartesian: any): number | undefined {
    if (!Cesium.defined(cartesian)) return undefined;
    const c = Cesium.Cartographic.fromCartesian(cartesian);
    if (!c || !Number.isFinite(c.height)) return undefined;
    return c.height;
}

function isOverlayPick(obj: any, overlay: SampleGlobeOpts["overlay"]): boolean {
    if (!obj) return false;
    const ent = obj.id ?? obj.primitive?.id ?? obj;
    if (overlay) {
        const coll = (
            overlay as { entities?: { contains?: (e: any) => boolean } }
        ).entities;
        try {
            if (coll?.contains?.(ent)) return true;
        } catch {
            /* ignore */
        }
        if (ent?.entityCollection?.owner === overlay) return true;
    }
    // Entity graphics (measure plane, CZML, labels) — never the tileset.
    if (
        ent &&
        (ent.polygon ||
            ent.polyline ||
            ent.point ||
            ent.label ||
            ent.billboard ||
            ent.entityCollection)
    ) {
        return true;
    }
    return false;
}

function pickExcludeList(scene: any, overlay: SampleGlobeOpts["overlay"]): any[] {
    const exclude: any[] = [scene.globe];
    if (overlay) {
        exclude.push(overlay);
        const vals = overlay.entities?.values;
        if (vals) {
            for (const e of vals) exclude.push(e);
        }
    }
    return exclude;
}

/** First tileset/glTF hit on a downward ray; globe + measure overlay skipped. */
function pickMeshFromRay(
    Cesium: any,
    scene: any,
    ray: any,
    opts: SampleGlobeOpts,
): number | undefined {
    const exclude = pickExcludeList(scene, opts.overlay);
    const hits = scene.drillPickFromRay
        ? scene.drillPickFromRay(ray, 24, exclude)
        : scene.pickFromRay
          ? [scene.pickFromRay(ray, exclude)].filter(Boolean)
          : [];
    for (const hit of hits ?? []) {
        if (!hit || hit.exclude) continue;
        if (!Cesium.defined(hit.position)) continue;
        if (opts.isGlobePick(hit.object)) continue;
        if (isOverlayPick(hit.object, opts.overlay)) continue;
        const h = heightAtCartesian(Cesium, hit.position);
        if (h != null) return h;
    }
    return undefined;
}

function pickGlobeFromRay(Cesium: any, scene: any, ray: any): number | undefined {
    const hit = scene.globe?.pick?.(ray, scene);
    return heightAtCartesian(Cesium, hit);
}

function withOverlayHidden<T>(
    viewer: any,
    overlay: SampleGlobeOpts["overlay"],
    fn: () => T,
): T {
    if (!overlay) return fn();
    const prev = overlay.show;
    overlay.show = false;
    try {
        // Pick uses the last GPU pass; hide then render or the overlay plane is still a hit.
        try {
            viewer?.render?.();
        } catch {
            /* requestRenderMode / no-op */
        }
        return fn();
    } finally {
        overlay.show = prev !== false;
    }
}

export function sampleSurfaceHeightAt(
    Cesium: any,
    viewer: any,
    lon: number,
    lat: number,
    bounds: { maxH: number; minH: number },
    opts: SampleGlobeOpts,
): number | undefined {
    if (!viewer || !Cesium) return undefined;
    const scene = viewer.scene;
    if (scene.mode !== Cesium.SceneMode.SCENE3D) return undefined;
    if (opts.snap === "ellipsoid") return undefined;

    const origin = Cesium.Cartesian3.fromDegrees(
        lon,
        lat,
        bounds.maxH + CEILING_PAD_M,
    );
    const dest = Cesium.Cartesian3.fromDegrees(
        lon,
        lat,
        bounds.minH - FLOOR_PAD_M,
    );
    const direction = Cesium.Cartesian3.subtract(
        dest,
        origin,
        new Cesium.Cartesian3(),
    );
    if (Cesium.Cartesian3.magnitude(direction) < 1e-6) return undefined;
    Cesium.Cartesian3.normalize(direction, direction);
    const ray = new Cesium.Ray(origin, direction);

    try {
        if (opts.snap === "mesh") {
            return pickMeshFromRay(Cesium, scene, ray, opts);
        }
        return pickGlobeFromRay(Cesium, scene, ray);
    } catch {
        return undefined;
    }
}

function runSample<T>(
    Cesium: any,
    viewer: any,
    vertices: MeasureVertex[],
    opts: SampleGlobeOpts,
    fn: (
        sampleHeight: (lon: number, lat: number) => number | undefined,
    ) => T,
): T {
    const heights = vertices.map((v) => v.height ?? 0);
    const bounds = {
        maxH: Math.max(...heights),
        minH: Math.min(...heights),
    };
    return withOverlayHidden(viewer, opts.overlay, () =>
        fn((lon, lat) =>
            sampleSurfaceHeightAt(Cesium, viewer, lon, lat, bounds, opts),
        ),
    );
}

/** Sample tileset/terrain between clicks; fall back to vertex chord if picks miss. */
export function sampleLengthProfileOnGlobe(
    Cesium: any,
    viewer: any,
    vertices: MeasureVertex[],
    opts: SampleGlobeOpts,
): ProfilePoint[] | null {
    if (!viewer || !Cesium) return elevationProfile(vertices);
    return (
        runSample(Cesium, viewer, vertices, opts, (sampleHeight) =>
            sampledElevationProfile(vertices, sampleHeight),
        ) ?? elevationProfile(vertices)
    );
}

/** Sample tileset/terrain inside a ring; fall back to vertex TIN if picks miss. */
export function sampleAreaSurfaceOnGlobe(
    Cesium: any,
    viewer: any,
    vertices: MeasureVertex[],
    opts: SampleGlobeOpts,
): number | null {
    if (!viewer || !Cesium) return null;
    return runSample(Cesium, viewer, vertices, opts, (sampleHeight) =>
        sampledSurfaceArea(vertices, sampleHeight),
    );
}

/** Cut/fill vs mean edge Z from interior tileset/terrain picks. */
export function sampleVolumeOnGlobe(
    Cesium: any,
    viewer: any,
    vertices: MeasureVertex[],
    opts: SampleGlobeOpts,
): VolumeBreakdown | null {
    if (!viewer || !Cesium) return null;
    return runSample(Cesium, viewer, vertices, opts, (sampleHeight) =>
        sampledVolume(vertices, sampleHeight),
    );
}
