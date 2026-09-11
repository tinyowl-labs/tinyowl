/**
 * Camera in-view keys for LayerScene's scene-graph filter.
 */
import { toSelectionKey } from "$lib/stores/layerSelection.svelte";
import { entityPositionSets } from "./mapSelection";

export type InViewKeys = {
    entityKeys: string[];
    modelHashes: string[];
};

function arraysEqual(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Static geometry is cached until Cesium reports an entity change. */
export class InViewBoundsCache {
    private entries = new WeakMap<object, { positions: any[][]; sphere: any }>();
    private subscribed = new WeakSet<object>();
    hasDynamic = false;
    constructor(private invalidate: () => void = () => {}) {}
    get(Cesium: any, entity: any, time: any) {
        const properties = [entity.position, entity.polygon?.hierarchy, entity.polyline?.positions].filter(Boolean);
        const dynamic = properties.some(p => typeof p.getValue === "function" && p.isConstant !== true);
        if (dynamic) this.hasDynamic = true;
        const cached = !dynamic && this.entries.get(entity);
        if (cached) return cached;
        const positions = entityPositionSets(entity, time);
        const points = positions.flat();
        let sphere = null;
        try { sphere = points.length ? Cesium.BoundingSphere.fromPoints(points) : null; } catch { /* Keep the per-position fallback for invalid geometry. */ }
        const entry = { positions, sphere };
        if (!dynamic && entity.definitionChanged?.addEventListener) {
            this.entries.set(entity, entry);
            if (!this.subscribed.has(entity)) {
                this.subscribed.add(entity);
                entity.definitionChanged.addEventListener(() => { this.entries.delete(entity); this.invalidate(); });
            }
        }
        return entry;
    }
}

/** Compare view/projection/size without allocating a camera snapshot per frame. */
export class InViewCameraState {
    private values: number[] = [];
    changed(viewer: any): boolean {
        const camera = viewer.camera;
        const matrices = [camera.viewMatrix, camera.frustum.projectionMatrix];
        let changed = false, index = 0;
        for (const matrix of matrices) for (let i = 0; i < 16; i++) {
            const value = matrix?.[i] ?? 0;
            if (this.values[index] !== value) changed = true;
            this.values[index++] = value;
        }
        for (const value of [viewer.scene.canvas.clientWidth, viewer.scene.canvas.clientHeight]) {
            if (this.values[index] !== value) changed = true;
            this.values[index++] = value;
        }
        return changed;
    }
}

/**
 * Entity keys / tileset hashes whose geometry intersects the current
 * canvas (entities) or camera frustum (tilesets). Returns the previous
 * arrays when unchanged so Svelte $state does not churn.
 */
export function computeInViewKeys(opts: {
    Cesium: any;
    viewer: any;
    entityDataSources: () => any[];
    entityMeta: {
        get(entity: object): { layerName: string; entityId: string } | undefined;
    };
    entityBoundingSphere: (entity: any) => any | null;
    tilesetPrims: Map<string, any>;
    prev: InViewKeys;
    bounds?: InViewBoundsCache;
}): InViewKeys | null {
    const { Cesium, viewer, prev } = opts;
    if (!viewer || !Cesium) return null;
    const canvas = viewer.scene?.canvas;
    const width = canvas?.clientWidth ?? canvas?.width ?? 0;
    const height = canvas?.clientHeight ?? canvas?.height ?? 0;
    if (width === 0 || height === 0) return null;

    const entityKeys: string[] = [];
    if (opts.bounds) opts.bounds.hasDynamic = false;
    const time = viewer.clock.currentTime;
    let cullingVolume: any;
    try {
        const camera = viewer.camera;
        cullingVolume = camera.frustum.computeCullingVolume(camera.position, camera.direction, camera.up);
    } catch { /* Fall back to the existing screen projection check. */ }
    for (const ds of opts.entityDataSources()) {
        if (ds.show === false) continue;
        for (const entity of ds.entities.values) {
            const meta = opts.entityMeta.get(entity);
            if (!meta) continue;
            try {
                if (entity.show === false) continue;
            } catch {
                /* ignore */
            }
            const key = toSelectionKey(meta.layerName, meta.entityId);
            const bounds = opts.bounds?.get(Cesium, entity, time);
            // Earth-fixed bounds match the camera frustum only in 3D.
            if (viewer.scene.mode === Cesium.SceneMode?.SCENE3D && bounds?.sphere && cullingVolume?.computeVisibility(bounds.sphere) === Cesium.Intersect.OUTSIDE) continue;
            const positionSets = bounds ? [...bounds.positions] : entityPositionSets(entity, time);
            if (positionSets.length === 0) {
                const sphere = opts.entityBoundingSphere(entity);
                if (sphere?.center) positionSets.push([sphere.center]);
            }
            let matched = false;
            outer: for (const pts of positionSets) {
                for (const pos of pts) {
                    try {
                        const screenPos =
                            Cesium.SceneTransforms.worldToWindowCoordinates(
                                viewer.scene,
                                pos,
                            );
                        if (
                            screenPos &&
                            screenPos.x >= 0 &&
                            screenPos.x <= width &&
                            screenPos.y >= 0 &&
                            screenPos.y <= height
                        ) {
                            matched = true;
                            break outer;
                        }
                    } catch {
                        /* ignore */
                    }
                }
            }
            if (matched) entityKeys.push(key);
        }
    }

    const modelHashes: string[] = [];
    try {
        const camera = viewer.camera;
        const cullingVolume = camera.frustum.computeCullingVolume(
            camera.position,
            camera.direction,
            camera.up,
        );
        for (const [hash, tileset] of opts.tilesetPrims) {
            if (!tileset?.show) continue;
            const bs = tileset.boundingSphere;
            if (!bs) continue;
            if (
                cullingVolume.computeVisibility(bs) !==
                Cesium.Intersect.OUTSIDE
            ) {
                modelHashes.push(hash);
            }
        }
    } catch {
        /* ignore */
    }

    const nextEntityKeys = [...new Set(entityKeys)].sort();
    modelHashes.sort();
    return {
        entityKeys: arraysEqual(nextEntityKeys, prev.entityKeys)
            ? prev.entityKeys
            : nextEntityKeys,
        modelHashes: arraysEqual(modelHashes, prev.modelHashes)
            ? prev.modelHashes
            : modelHashes,
    };
}
