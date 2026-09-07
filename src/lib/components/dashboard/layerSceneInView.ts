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
}): InViewKeys | null {
    const { Cesium, viewer, prev } = opts;
    if (!viewer || !Cesium) return null;
    const canvas = viewer.scene?.canvas;
    const width = canvas?.clientWidth ?? canvas?.width ?? 0;
    const height = canvas?.clientHeight ?? canvas?.height ?? 0;
    if (width === 0 || height === 0) return null;

    const entityKeys: string[] = [];
    const time = viewer.clock.currentTime;
    for (const ds of opts.entityDataSources()) {
        for (const entity of ds.entities.values) {
            const meta = opts.entityMeta.get(entity);
            if (!meta) continue;
            try {
                if (entity.show === false) continue;
            } catch {
                /* ignore */
            }
            const key = toSelectionKey(meta.layerName, meta.entityId);
            const positionSets = entityPositionSets(entity, time);
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
