/**
 * GeoTIFF → Cesium SingleTileImageryProvider helper.
 * Uses geotiff.js (Range requests when the server supports them).
 */
import { fromUrl, type GeoTIFFImage } from "geotiff";
import type { ProjectCoverage } from "./coverageTypes";

export type CoverageImageryResult = {
    hash: string;
    rectangle: { west: number; south: number; east: number; north: number };
    dataUrl: string;
    width: number;
    height: number;
};

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

function looksGeographic(
    west: number,
    south: number,
    east: number,
    north: number,
): boolean {
    return (
        west >= -180 &&
        east <= 180 &&
        south >= -90 &&
        north <= 90 &&
        west < east &&
        south < north
    );
}

function rectangleFromCoverage(
    cov: ProjectCoverage,
    image: GeoTIFFImage,
): { west: number; south: number; east: number; north: number } | null {
    if (cov.bbox_wgs84 && cov.bbox_wgs84.length === 4) {
        const [west, south, east, north] = cov.bbox_wgs84;
        if (looksGeographic(west, south, east, north)) {
            return { west, south, east, north };
        }
    }
    try {
        const bb = image.getBoundingBox();
        if (bb && bb.length >= 4) {
            const west = bb[0]!;
            const south = bb[1]!;
            const east = bb[2]!;
            const north = bb[3]!;
            if (looksGeographic(west, south, east, north)) {
                return { west, south, east, north };
            }
        }
    } catch {
        /* ignore */
    }
    return null;
}

function stretchBand(
    data: ArrayLike<number>,
    nodata?: number,
): Uint8ClampedArray {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < data.length; i++) {
        const v = data[i]!;
        if (nodata != null && v === nodata) continue;
        if (!Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
        min = 0;
        max = 1;
    }
    const out = new Uint8ClampedArray(data.length);
    const span = max - min;
    for (let i = 0; i < data.length; i++) {
        const v = data[i]!;
        if (nodata != null && v === nodata) {
            out[i] = 0;
            continue;
        }
        out[i] = Math.max(
            0,
            Math.min(255, Math.round(((v - min) / span) * 255)),
        );
    }
    return out;
}

function rastersToCanvas(
    width: number,
    height: number,
    bands: ArrayLike<number>[],
    nodata?: number,
): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");
    const img = ctx.createImageData(width, height);
    const n = width * height;

    if (bands.length >= 3) {
        const r = bands[0]!;
        const g = bands[1]!;
        const b = bands[2]!;
        const rs = stretchBand(r, nodata);
        const gs = stretchBand(g, nodata);
        const bs = stretchBand(b, nodata);
        for (let i = 0; i < n; i++) {
            const o = i * 4;
            img.data[o] = rs[i]!;
            img.data[o + 1] = gs[i]!;
            img.data[o + 2] = bs[i]!;
            img.data[o + 3] = nodata != null && r[i] === nodata ? 0 : 255;
        }
    } else {
        const band = bands[0]!;
        const gray = stretchBand(band, nodata);
        for (let i = 0; i < n; i++) {
            const t = gray[i]! / 255;
            const o = i * 4;
            if (nodata != null && band[i] === nodata) {
                img.data[o + 3] = 0;
                continue;
            }
            img.data[o] = Math.round(40 + t * 215);
            img.data[o + 1] = Math.round(80 + t * 160);
            img.data[o + 2] = Math.round(120 + (1 - t) * 80);
            img.data[o + 3] = 220;
        }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

const MAX_PIXELS = 4_000_000;

export async function loadCoverageImagery(
    cov: ProjectCoverage,
    accessToken: string | null | undefined,
): Promise<CoverageImageryResult> {
    const url = mediaUrl(cov, accessToken);
    const headers: Record<string, string> = {};
    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }
    const tiff = await fromUrl(url, {
        allowFullFile: true,
        headers,
    });
    const image = await tiff.getImage();
    const rect = rectangleFromCoverage(cov, image);
    if (!rect) {
        throw new Error(
            `Coverage ${cov.label || cov.hash.slice(0, 8)} has no geographic bbox (set meta.bbox_wgs84)`,
        );
    }

    let width = image.getWidth();
    let height = image.getHeight();
    const pixels = width * height;
    let options: { width?: number; height?: number } | undefined;
    if (pixels > MAX_PIXELS) {
        const scale = Math.sqrt(MAX_PIXELS / pixels);
        width = Math.max(1, Math.floor(width * scale));
        height = Math.max(1, Math.floor(height * scale));
        options = { width, height };
    }

    const rasters = await image.readRasters(options);
    const bands: ArrayLike<number>[] = [];
    const count = Array.isArray(rasters) ? rasters.length : 1;
    for (let i = 0; i < Math.min(count, 3); i++) {
        bands.push(rasters[i] as ArrayLike<number>);
    }
    if (bands.length === 0) {
        throw new Error("TIFF has no bands");
    }

    const nodataRaw = image.getGDALNoData?.();
    let nd: number | undefined;
    if (typeof nodataRaw === "number" && Number.isFinite(nodataRaw)) {
        nd = nodataRaw;
    } else if (typeof nodataRaw === "string" && nodataRaw !== "") {
        const n = Number(nodataRaw);
        if (Number.isFinite(n)) nd = n;
    }
    const canvas = rastersToCanvas(width, height, bands, nd);
    return {
        hash: cov.hash,
        rectangle: rect,
        dataUrl: canvas.toDataURL("image/png"),
        width,
        height,
    };
}
