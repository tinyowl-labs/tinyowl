/**
 * Cesium ImageryProvider that requests COG/GeoTIFF windows via geotiff.js + HTTP Range.
 * Used for large coverage rasters; small files still use SingleTileImageryProvider.
 *
 * Perf notes (zoom stutter):
 * - LRU tile cache + in-flight dedupe
 * - Fixed global stretch (not per-tile min/max)
 * - Concurrency cap on Range reads
 * - Prefer coarser-or-equal overview vs native
 */
import { fromUrl, type GeoTIFF, type GeoTIFFImage } from "geotiff";
import type { ProjectCoverage } from "./coverageTypes";
import { shouldUseCogProvider } from "./coverageTypes";

export { shouldUseCogProvider };

export type CogRect = {
    west: number;
    south: number;
    east: number;
    north: number;
};

const TILE = 256;

/**
 * Finest ground sample distance we request (centimetres per pixel).
 * 10 cm GSD is plenty for draped ortho/geophys without pulling fine COG tiles.
 */
export const MAX_COVERAGE_GSD_CM = 10;

/** Max simultaneous geotiff Range reads per coverage layer. */
const MAX_IN_FLIGHT = 4;

/** Cached decoded tiles kept per coverage. */
const TILE_CACHE_MAX = 96;

const METERS_PER_DEG_LAT = 111_320;

function metersPerDegLon(latDeg: number): number {
    return METERS_PER_DEG_LAT * Math.cos((latDeg * Math.PI) / 180);
}

/** Finest Cesium level whose tile GSD is not finer than maxGsdCm (and not past source). */
export function maxLevelForResolution(opts: {
    west: number;
    south: number;
    east: number;
    north: number;
    fullWidth: number;
    fullHeight: number;
    tileSize?: number;
    maxGsdCm?: number;
}): number {
    const tileSize = opts.tileSize ?? TILE;
    const maxGsdCm = opts.maxGsdCm ?? MAX_COVERAGE_GSD_CM;
    const maxPxPerCm = 1 / maxGsdCm;
    const lonSpan = Math.max(opts.east - opts.west, 1e-12);
    const latSpan = Math.max(opts.north - opts.south, 1e-12);
    const midLat = (opts.south + opts.north) / 2;
    const widthM = lonSpan * metersPerDegLon(midLat);
    const heightM = latSpan * METERS_PER_DEG_LAT;

    const nativePxPerCm = Math.min(
        (opts.fullWidth * 0.01) / widthM,
        (opts.fullHeight * 0.01) / heightM,
    );
    const targetPxPerCm = Math.min(maxPxPerCm, nativePxPerCm);
    if (!(targetPxPerCm > 0) || !Number.isFinite(targetPxPerCm)) {
        return 0;
    }

    const maxByLon = Math.log2(
        (targetPxPerCm * widthM) / (tileSize * 0.01),
    );
    const maxByLat = Math.log2(
        (targetPxPerCm * heightM) / (tileSize * 0.01),
    );
    const byRes = Math.floor(Math.min(maxByLon, maxByLat));
    const bySource = Math.ceil(
        Math.log2(Math.max(opts.fullWidth, opts.fullHeight) / tileSize),
    );
    return Math.max(0, Math.min(byRes, bySource));
}

function mediaUrl(
    cov: ProjectCoverage,
    accessToken: string | null | undefined,
): string {
    const base = cov.url?.startsWith("http")
        ? cov.url
        : cov.url || `/media/${cov.hash}`;
    if (!accessToken) return base;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}token=${encodeURIComponent(accessToken)}`;
}

type Stretch = { min: number; max: number };

function sampleStretch(
    data: ArrayLike<number>,
    nodata?: number,
): Stretch {
    let min = Infinity;
    let max = -Infinity;
    const step = Math.max(1, Math.floor(data.length / 50_000));
    for (let i = 0; i < data.length; i += step) {
        const v = data[i]!;
        if (nodata != null && v === nodata) continue;
        if (!Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
        return { min: 0, max: 255 };
    }
    return { min, max };
}

function applyStretch(v: number, s: Stretch): number {
    const t = (v - s.min) / (s.max - s.min);
    return Math.max(0, Math.min(255, Math.round(t * 255)));
}

/** Single-pass RGBA; uses fixed stretch (no per-tile min/max). */
function rastersToCanvas(
    width: number,
    height: number,
    bands: ArrayLike<number>[],
    stretches: Stretch[],
    nodata?: number,
): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) throw new Error("canvas 2d unavailable");
    const img = ctx.createImageData(width, height);
    const n = width * height;
    const d = img.data;

    if (bands.length >= 3) {
        const r = bands[0]!;
        const g = bands[1]!;
        const b = bands[2]!;
        const sr = stretches[0] ?? { min: 0, max: 255 };
        const sg = stretches[1] ?? sr;
        const sb = stretches[2] ?? sr;
        for (let i = 0; i < n; i++) {
            const o = i * 4;
            if (nodata != null && r[i] === nodata) {
                d[o + 3] = 0;
                continue;
            }
            d[o] = applyStretch(r[i]!, sr);
            d[o + 1] = applyStretch(g[i]!, sg);
            d[o + 2] = applyStretch(b[i]!, sb);
            d[o + 3] = 255;
        }
    } else {
        const band = bands[0]!;
        const s = stretches[0] ?? { min: 0, max: 255 };
        for (let i = 0; i < n; i++) {
            const o = i * 4;
            if (nodata != null && band[i] === nodata) {
                d[o + 3] = 0;
                continue;
            }
            const t = applyStretch(band[i]!, s) / 255;
            d[o] = Math.round(40 + t * 215);
            d[o + 1] = Math.round(80 + t * 160);
            d[o + 2] = Math.round(120 + (1 - t) * 80);
            d[o + 3] = 220;
        }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

/** Prefer coarser-or-equal overview (never finer than needed). */
function pickOverviewIndex(
    images: GeoTIFFImage[],
    tileWest: number,
    tileEast: number,
    tilePixels: number,
    fullWest: number,
    fullEast: number,
    fullWidth: number,
): number {
    const lonPerFullPx = (fullEast - fullWest) / fullWidth;
    const targetLonPerPx = (tileEast - tileWest) / tilePixels;
    let best = images.length - 1;
    let bestDiff = Infinity;
    for (let i = 0; i < images.length; i++) {
        const img = images[i]!;
        const w = img.getWidth();
        const lonPerPx = lonPerFullPx * (fullWidth / w);
        // Prefer overviews that are coarser or equal (lonPerPx >= target).
        if (lonPerPx + 1e-18 < targetLonPerPx * 0.85) continue;
        const diff = Math.abs(Math.log(lonPerPx / targetLonPerPx));
        if (diff < bestDiff) {
            bestDiff = diff;
            best = i;
        }
    }
    // Fallback: coarsest if nothing matched.
    if (!Number.isFinite(bestDiff)) {
        return images.length - 1;
    }
    return best;
}

function lonLatToPixel(
    lon: number,
    lat: number,
    west: number,
    south: number,
    east: number,
    north: number,
    width: number,
    height: number,
): { x: number; y: number } {
    const x = ((lon - west) / (east - west)) * width;
    const y = ((north - lat) / (north - south)) * height;
    return { x, y };
}

class LruCanvasCache {
    private map = new Map<string, HTMLCanvasElement>();
    constructor(private max: number) {}
    get(key: string): HTMLCanvasElement | undefined {
        const v = this.map.get(key);
        if (!v) return undefined;
        this.map.delete(key);
        this.map.set(key, v);
        return v;
    }
    set(key: string, canvas: HTMLCanvasElement) {
        if (this.map.has(key)) this.map.delete(key);
        this.map.set(key, canvas);
        while (this.map.size > this.max) {
            const oldest = this.map.keys().next().value;
            if (oldest == null) break;
            this.map.delete(oldest);
        }
    }
    clear() {
        this.map.clear();
    }
}

class Semaphore {
    private waiters: Array<() => void> = [];
    private active = 0;
    constructor(private limit: number) {}
    async run<T>(fn: () => Promise<T>): Promise<T> {
        if (this.active >= this.limit) {
            await new Promise<void>((resolve) => this.waiters.push(resolve));
        }
        this.active++;
        try {
            return await fn();
        } finally {
            this.active--;
            const next = this.waiters.shift();
            if (next) next();
        }
    }
}

async function estimateStretches(
    images: GeoTIFFImage[],
    bandCount: number,
    nodata?: number,
): Promise<Stretch[]> {
    // Sample coarsest overview for stable, cheap stretch.
    const image = images[images.length - 1] ?? images[0]!;
    const w = Math.min(256, image.getWidth());
    const h = Math.min(256, image.getHeight());
    const rasters = await image.readRasters({
        width: w,
        height: h,
        resampleMethod: "nearest",
    });
    const stretches: Stretch[] = [];
    const n = Math.min(bandCount, Array.isArray(rasters) ? rasters.length : 1);
    for (let i = 0; i < n; i++) {
        const band = rasters[i] as ArrayLike<number>;
        // Byte imagery: skip stretch.
        if (band instanceof Uint8Array || band instanceof Uint8ClampedArray) {
            stretches.push({ min: 0, max: 255 });
        } else {
            stretches.push(sampleStretch(band, nodata));
        }
    }
    while (stretches.length < bandCount) {
        stretches.push(stretches[0] ?? { min: 0, max: 255 });
    }
    return stretches;
}

export type CogProviderHandle = {
    provider: any;
    destroy: () => void;
};

/**
 * Build a Cesium ImageryProvider for a georeferenced COG/TIFF coverage.
 * Cesium is passed in (global from LayerScene boot).
 */
export async function createCogImageryProvider(
    Cesium: any,
    cov: ProjectCoverage,
    accessToken: string | null | undefined,
    rectangle: CogRect,
    opts?: { minimumLevel?: number },
): Promise<CogProviderHandle> {
    const url = mediaUrl(cov, accessToken);
    const headers: Record<string, string> = {};
    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }

    const tiff: GeoTIFF = await fromUrl(url, {
        allowFullFile: false,
        headers,
    });

    const count = await tiff.getImageCount();
    const images: GeoTIFFImage[] = [];
    for (let i = 0; i < count; i++) {
        images.push(await tiff.getImage(i));
    }
    if (images.length === 0) {
        throw new Error("TIFF has no images");
    }

    const full = images[0]!;
    const fullW = full.getWidth();
    const fullH = full.getHeight();
    const { west, south, east, north } = rectangle;

    const nodataRaw = full.getGDALNoData?.();
    const nd =
        typeof nodataRaw === "number" && Number.isFinite(nodataRaw)
            ? nodataRaw
            : undefined;

    const samples = Math.max(1, full.getSamplesPerPixel?.() ?? 1);
    const bandCount = Math.min(3, samples);
    const stretches = await estimateStretches(images, bandCount, nd);

    const cesiumRect = Cesium.Rectangle.fromDegrees(west, south, east, north);
    const tilingScheme = new Cesium.GeographicTilingScheme({
        rectangle: cesiumRect,
        numberOfLevelZeroTilesX: 1,
        numberOfLevelZeroTilesY: 1,
    });

    const maxLevel = maxLevelForResolution({
        west,
        south,
        east,
        north,
        fullWidth: fullW,
        fullHeight: fullH,
    });
    const minimumLevel = Math.max(
        0,
        Math.min(opts?.minimumLevel ?? 0, maxLevel),
    );

    const errorEvent = new Cesium.Event();
    let destroyed = false;
    const cache = new LruCanvasCache(TILE_CACHE_MAX);
    const inFlight = new Map<string, Promise<HTMLCanvasElement | undefined>>();
    const gate = new Semaphore(MAX_IN_FLIGHT);

    async function decodeTile(
        x: number,
        y: number,
        level: number,
    ): Promise<HTMLCanvasElement | undefined> {
        const tileRect = tilingScheme.tileXYToRectangle(x, y, level);
        const tw = Cesium.Math.toDegrees(tileRect.west);
        const te = Cesium.Math.toDegrees(tileRect.east);
        const ts = Cesium.Math.toDegrees(tileRect.south);
        const tn = Cesium.Math.toDegrees(tileRect.north);

        const ovIdx = pickOverviewIndex(
            images,
            tw,
            te,
            TILE,
            west,
            east,
            fullW,
        );
        const image = images[ovIdx]!;
        const iw = image.getWidth();
        const ih = image.getHeight();

        const p0 = lonLatToPixel(tw, tn, west, south, east, north, iw, ih);
        const p1 = lonLatToPixel(te, ts, west, south, east, north, iw, ih);
        let x0 = Math.floor(Math.min(p0.x, p1.x));
        let x1 = Math.ceil(Math.max(p0.x, p1.x));
        let y0 = Math.floor(Math.min(p0.y, p1.y));
        let y1 = Math.ceil(Math.max(p0.y, p1.y));
        x0 = Math.max(0, Math.min(iw - 1, x0));
        x1 = Math.max(x0 + 1, Math.min(iw, x1));
        y0 = Math.max(0, Math.min(ih - 1, y0));
        y1 = Math.max(y0 + 1, Math.min(ih, y1));

        const winW = x1 - x0;
        const winH = y1 - y0;
        // Nearest is cheaper when the window is already ~tile-sized.
        const resample =
            winW <= TILE * 1.5 && winH <= TILE * 1.5 ? "nearest" : "bilinear";

        const rasters = await gate.run(() =>
            image.readRasters({
                window: [x0, y0, x1, y1],
                width: TILE,
                height: TILE,
                resampleMethod: resample,
            }),
        );
        if (destroyed) return undefined;

        const bands: ArrayLike<number>[] = [];
        const nBands = Array.isArray(rasters) ? rasters.length : 1;
        for (let i = 0; i < Math.min(nBands, bandCount); i++) {
            bands.push(rasters[i] as ArrayLike<number>);
        }
        if (bands.length === 0) return undefined;
        return rastersToCanvas(TILE, TILE, bands, stretches, nd);
    }

    const provider = {
        ready: true,
        readyPromise: Promise.resolve(true),
        rectangle: cesiumRect,
        tileWidth: TILE,
        tileHeight: TILE,
        maximumLevel: maxLevel,
        minimumLevel,
        tilingScheme,
        tileDiscardPolicy: undefined,
        credit: new Cesium.Credit(cov.label || cov.entity_id || "coverage"),
        hasAlphaChannel: true,
        errorEvent,
        proxy: undefined,
        getTileCredits() {
            return undefined;
        },
        pickFeatures() {
            return undefined;
        },
        requestImage(x: number, y: number, level: number, request?: any) {
            if (destroyed) return undefined;
            // Cesium Request: skip work if already cancelled.
            if (
                request &&
                Cesium.RequestState &&
                request.state === Cesium.RequestState.CANCELLED
            ) {
                return undefined;
            }
            const key = `${level}/${x}/${y}`;
            const hit = cache.get(key);
            if (hit) return Promise.resolve(hit);

            let pending = inFlight.get(key);
            if (!pending) {
                pending = decodeTile(x, y, level)
                    .then((canvas) => {
                        if (canvas && !destroyed) cache.set(key, canvas);
                        return canvas;
                    })
                    .catch((e) => {
                        errorEvent.raiseEvent(e);
                        return undefined;
                    })
                    .finally(() => {
                        inFlight.delete(key);
                    });
                inFlight.set(key, pending);
            }
            return pending;
        },
    };

    Object.defineProperty(provider, "rectangle", {
        get: () => cesiumRect,
    });

    return {
        provider,
        destroy() {
            destroyed = true;
            cache.clear();
            inFlight.clear();
        },
    };
}

