/**
 * 3D tileset load/destroy helpers for LayerScene.
 */
import type { ProjectTileset } from "./tilesetTypes";

export function destroyTileset(
    viewer: any,
    tilesetPrims: Map<string, any>,
    hash: string,
) {
    const prim = tilesetPrims.get(hash);
    if (!prim) return;
    tilesetPrims.delete(hash);
    try {
        viewer?.scene?.primitives?.remove(prim);
    } catch {
        /* ignore */
    }
    if (prim && !prim.isDestroyed?.()) {
        try {
            prim.destroy();
        } catch {
            /* ignore */
        }
    }
}

/** Shift tileset along ellipsoid normal to match entity ellipsoidal heights. */
export function applyTilesetHeightOffset(
    Cesium: any,
    prim: any,
    offsetM: number | null | undefined,
) {
    if (!prim || !Cesium || offsetM == null || !Number.isFinite(offsetM)) {
        return;
    }
    const apply = () => {
        prim.modelMatrix = Cesium.Matrix4.clone(
            Cesium.Matrix4.IDENTITY,
            new Cesium.Matrix4(),
        );
        const center = prim.boundingSphere?.center;
        if (!center) return false;
        if (offsetM === 0) return true;
        const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(center);
        const translation = Cesium.Cartesian3.multiplyByScalar(
            normal,
            offsetM,
            new Cesium.Cartesian3(),
        );
        prim.modelMatrix = Cesium.Matrix4.fromTranslation(translation);
        return true;
    };
    if (apply()) return;
    void Promise.resolve(prim.readyPromise)
        .then(() => {
            if (!apply()) {
                const remove = prim.initialTilesLoaded?.addEventListener(() => {
                    apply();
                    remove?.();
                });
            }
        })
        .catch(() => {
            /* ignore */
        });
}

export async function loadTilesetPrimitive(
    Cesium: any,
    viewer: any,
    m: ProjectTileset,
    accessToken: string,
    show: boolean,
): Promise<any | null> {
    if (!m.root_url) return null;
    const resource = new Cesium.Resource({
        url: m.root_url,
        queryParameters: accessToken ? { token: accessToken } : {},
        headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {},
    });
    const prim = await Cesium.Cesium3DTileset.fromUrl(resource, {
        enableCollision: false,
        maximumScreenSpaceError: 4,
        skipLevelOfDetail: false,
        immediatelyLoadDesiredLevelOfDetail: false,
        loadSiblings: true,
        loadingDescendantLimit: 128,
    });
    prim.show = show;
    applyTilesetHeightOffset(Cesium, prim, m.height_offset_m);
    prim.initialTilesLoaded.addEventListener(() => {
        applyTilesetHeightOffset(Cesium, prim, m.height_offset_m);
        viewer.scene.requestRender?.();
    });
    return prim;
}
