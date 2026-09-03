export type CoverageRole = "tileset" | "imagery" | "raster" | "model";

export type ProjectCoverage = {
    hash: string;
    entity_type: string;
    entity_id: string;
    media_type: string;
    file_size: number;
    profile: string;
    role: CoverageRole;
    label?: string;
    url: string;
    /** Low-res JPEG from raster-worker — map base + artefact thumbs. */
    preview_url?: string;
    /** XYZ template …/tiles/{z}/{x}/{y} when static archive is ready. */
    tiles_url?: string;
    bbox_wgs84?: number[];
    crs_epsg?: number | null;
    ingest_status?: string;
    bands?: unknown;
    meta?: Record<string, unknown>;
};

export function coveragePreviewUrl(
    cov: ProjectCoverage,
    accessToken: string | null | undefined,
): string | null {
    const raw =
        cov.preview_url ||
        (typeof cov.meta?.preview_path === "string"
            ? `/media/${cov.hash}?variant=preview`
            : null);
    if (!raw) return null;
    if (!accessToken) return raw;
    const sep = raw.includes("?") ? "&" : "?";
    return `${raw}${sep}token=${encodeURIComponent(accessToken)}`;
}

export function coverageTilesUrlTemplate(
    cov: ProjectCoverage,
    accessToken: string | null | undefined,
): string | null {
    if (!cov.tiles_url) return null;
    let url = cov.tiles_url;
    if (accessToken && !url.includes("token=")) {
        const sep = url.includes("?") ? "&" : "?";
        url = `${url}${sep}token=${encodeURIComponent(accessToken)}`;
    }
    return url;
}

export function looksGeographic(
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

export function rectangleFromMeta(
    cov: ProjectCoverage,
): { west: number; south: number; east: number; north: number } | null {
    if (cov.bbox_wgs84 && cov.bbox_wgs84.length === 4) {
        const [west, south, east, north] = cov.bbox_wgs84;
        if (looksGeographic(west, south, east, north)) {
            return { west, south, east, north };
        }
    }
    return null;
}

/** Prefer tiled COG provider for larger files or when a COG was baked. */
export function shouldUseCogProvider(cov: ProjectCoverage): boolean {
    const meta = cov.meta ?? {};
    if (typeof meta.cog_path === "string" && meta.cog_path.length > 0) {
        return true;
    }
    const size = cov.file_size ?? 0;
    return size > 5_000_000;
}

/** Raster coverages only (exclude tilesets/models — those use Cesium3DTileset). */
export function rasterCoverages(list: ProjectCoverage[]): ProjectCoverage[] {
    return list.filter((c) => c.role !== "tileset" && c.role !== "model");
}

const SMALL_FALLBACK_BYTES = 5_000_000;

/** Rasters safe to paint: ready, no status yet, or small pending/failed fallback. */
export function loadableRasters(list: ProjectCoverage[]): ProjectCoverage[] {
    return rasterCoverages(list).filter((c) => {
        const status = (c.ingest_status || "").toLowerCase();
        if (!status || status === "ready") return true;
        if (status === "failed" || status === "pending" || status === "processing") {
            return (c.file_size ?? 0) > 0 && (c.file_size ?? 0) <= SMALL_FALLBACK_BYTES;
        }
        return true;
    });
}
