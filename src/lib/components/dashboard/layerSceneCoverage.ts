/**
 * Coverage/raster paint for LayerScene. Dynamically imported so geotiff
 * stays out of the map chunk until a project actually has rasters.
 */
import {
    coveragePreviewUrl,
    coverageTilesUrlTemplate,
    rectangleFromMeta,
    shouldUseCogProvider,
    type ProjectCoverage,
} from "./coverageTypes";

export type CoverageSyncCtx = {
    Cesium: any;
    viewer: any;
    rasters: ProjectCoverage[];
    accessToken: string;
    coverageLayers: Map<string, any[]>;
    coverageCogDestroy: Map<string, () => void>;
    isCoverageVisible: (hash: string) => boolean;
    stillCurrent: () => boolean;
    setError: (msg: string) => void;
};

export function destroyCoverageLayer(ctx: CoverageSyncCtx, hash: string) {
    const layers = ctx.coverageLayers.get(hash);
    if (layers && ctx.viewer) {
        for (const layer of layers) {
            try {
                ctx.viewer.imageryLayers.remove(layer, true);
            } catch {
                /* ignore */
            }
        }
    }
    ctx.coverageLayers.delete(hash);
    const destroy = ctx.coverageCogDestroy.get(hash);
    if (destroy) {
        try {
            destroy();
        } catch {
            /* ignore */
        }
        ctx.coverageCogDestroy.delete(hash);
    }
}

export async function syncCoverageImagery(ctx: CoverageSyncCtx) {
    const { Cesium, viewer, rasters } = ctx;
    if (!viewer || !Cesium) return;

    const geotiffMods = rasters.some((c) => {
        if (shouldUseCogProvider(c)) return true;
        if (!rectangleFromMeta(c)) return true;
        if (
            !coveragePreviewUrl(c, ctx.accessToken || null) &&
            !coverageTilesUrlTemplate(c, ctx.accessToken || null)
        ) {
            return true;
        }
        return false;
    })
        ? await import("./coverageGeotiff")
        : null;
    if (!ctx.stillCurrent()) return;

    const want = new Set(rasters.map((c) => c.hash));

    for (const hash of [...ctx.coverageLayers.keys()]) {
        if (!want.has(hash)) destroyCoverageLayer(ctx, hash);
    }

    for (const cov of rasters) {
        if (!ctx.stillCurrent()) return;
        const existing = ctx.coverageLayers.get(cov.hash);
        if (existing) {
            const show = ctx.isCoverageVisible(cov.hash);
            for (const layer of existing) layer.show = show;
            continue;
        }
        if (!ctx.isCoverageVisible(cov.hash)) continue;
        try {
            const added: any[] = [];
            let rect = rectangleFromMeta(cov);
            if (!rect && geotiffMods) {
                rect = await geotiffMods.resolveCoverageRectangle(
                    cov,
                    ctx.accessToken || null,
                );
            }

            const previewUrl = coveragePreviewUrl(cov, ctx.accessToken || null);
            const tilesTpl = coverageTilesUrlTemplate(
                cov,
                ctx.accessToken || null,
            );

            if (tilesTpl && rect) {
                const tileProvider = new Cesium.UrlTemplateImageryProvider({
                    url: tilesTpl,
                    rectangle: Cesium.Rectangle.fromDegrees(
                        rect.west,
                        rect.south,
                        rect.east,
                        rect.north,
                    ),
                });
                if (!ctx.stillCurrent()) return;
                const tileLayer =
                    viewer.imageryLayers.addImageryProvider(tileProvider);
                tileLayer.show = ctx.isCoverageVisible(cov.hash);
                added.push(tileLayer);
                ctx.coverageLayers.set(cov.hash, added);
                continue;
            }

            if (previewUrl && rect) {
                const previewProvider =
                    await Cesium.SingleTileImageryProvider.fromUrl(previewUrl, {
                        rectangle: Cesium.Rectangle.fromDegrees(
                            rect.west,
                            rect.south,
                            rect.east,
                            rect.north,
                        ),
                    });
                if (!ctx.stillCurrent()) return;
                const previewLayer =
                    viewer.imageryLayers.addImageryProvider(previewProvider);
                previewLayer.show = ctx.isCoverageVisible(cov.hash);
                added.push(previewLayer);
            }

            if (shouldUseCogProvider(cov)) {
                if (!rect) {
                    throw new Error(
                        `Coverage ${cov.label || cov.hash.slice(0, 8)} has no geographic bbox`,
                    );
                }
                if (!geotiffMods) {
                    throw new Error("COG provider requested without geotiff module");
                }
                const handle = await geotiffMods.createCogImageryProvider(
                    Cesium,
                    cov,
                    ctx.accessToken || null,
                    rect,
                    { minimumLevel: previewUrl ? 2 : 0 },
                );
                if (!ctx.stillCurrent()) {
                    handle.destroy();
                    return;
                }
                const cogLayer = viewer.imageryLayers.addImageryProvider(
                    handle.provider,
                );
                cogLayer.show = ctx.isCoverageVisible(cov.hash);
                added.push(cogLayer);
                ctx.coverageCogDestroy.set(cov.hash, handle.destroy);
            } else if (!previewUrl && geotiffMods) {
                const loaded = await geotiffMods.loadCoverageImagery(
                    cov,
                    ctx.accessToken || null,
                );
                if (!ctx.stillCurrent()) return;
                const provider =
                    await Cesium.SingleTileImageryProvider.fromUrl(
                        loaded.dataUrl,
                        {
                            rectangle: Cesium.Rectangle.fromDegrees(
                                loaded.rectangle.west,
                                loaded.rectangle.south,
                                loaded.rectangle.east,
                                loaded.rectangle.north,
                            ),
                        },
                    );
                if (!ctx.stillCurrent()) return;
                const layer = viewer.imageryLayers.addImageryProvider(provider);
                layer.show = ctx.isCoverageVisible(cov.hash);
                added.push(layer);
            }

            if (added.length > 0) {
                ctx.coverageLayers.set(cov.hash, added);
            }
        } catch (e) {
            if (ctx.stillCurrent()) {
                const msg =
                    e instanceof Error
                        ? e.message
                        : "Failed to load coverage imagery";
                ctx.setError(msg);
                console.warn("coverage imagery", cov.hash, e);
            }
        }
    }
}
