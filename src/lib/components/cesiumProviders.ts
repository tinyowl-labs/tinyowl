/** Cesium globe imagery + terrain catalog. Persists in localStorage. */

import {
	OSM_MAX_ZOOM,
	OSM_TILE_SUBDOMAINS,
	OSM_TILE_URL,
} from "./osmTiles";

export type ImageryId =
	| "osm"
	| "topo"
	| "aerial"
	| "hybrid"
	| "streets"
	| "sentinel"
	| "night"
	| "none";

export type TerrainId = "ellipsoid" | "world" | "bathy";

export type CreditLink = { label: string; href?: string };

export type ImageryOption = {
	id: ImageryId;
	label: string;
	ion?: boolean;
	themeAdjust?: boolean;
	credits: CreditLink[];
};

export type TerrainOption = {
	id: TerrainId;
	label: string;
	ion?: boolean;
	credits: CreditLink[];
};

const IMAGERY_KEY = "tinyowl:cesium-imagery";
const TERRAIN_KEY = "tinyowl:cesium-terrain";

const OSM_CREDIT: CreditLink = {
	label: "© OpenStreetMap",
	href: "https://www.openstreetmap.org/copyright",
};
const ION_CREDIT: CreditLink = {
	label: "Ion",
	href: "https://cesium.com/ion/",
};
const BING_CREDIT: CreditLink = {
	label: "Bing",
	href: "https://www.microsoft.com/maps",
};

const TOPO_TILE_URL =
	"https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png";
const TOPO_SUBDOMAINS = ["a", "b", "c"];
const TOPO_MAX_ZOOM = 17;

/** Bing / Ion world-imagery asset ids (fallback if style helper is missing). */
const ION_AERIAL = 2;
const ION_HYBRID = 3;
const ION_ROAD = 4;
const ION_SENTINEL = 3812;
const ION_NIGHT = 3813;

export const IMAGERY_OPTIONS: ImageryOption[] = [
	{
		id: "osm",
		label: "OpenStreetMap",
		themeAdjust: true,
		credits: [OSM_CREDIT],
	},
	{
		id: "topo",
		label: "OpenTopoMap",
		themeAdjust: true,
		credits: [
			OSM_CREDIT,
			{ label: "OpenTopoMap", href: "https://opentopomap.org/" },
		],
	},
	{
		id: "aerial",
		label: "Aerial",
		ion: true,
		credits: [BING_CREDIT, ION_CREDIT],
	},
	{
		id: "hybrid",
		label: "Aerial + labels",
		ion: true,
		credits: [BING_CREDIT, ION_CREDIT],
	},
	{
		id: "streets",
		label: "Streets",
		ion: true,
		themeAdjust: true,
		credits: [BING_CREDIT, ION_CREDIT],
	},
	{
		id: "sentinel",
		label: "Sentinel-2",
		ion: true,
		credits: [
			{
				label: "Copernicus",
				href: "https://www.sentinel-hub.com/",
			},
			ION_CREDIT,
		],
	},
	{
		id: "night",
		label: "Earth at night",
		ion: true,
		credits: [
			{ label: "NASA", href: "https://earthobservatory.nasa.gov/" },
			ION_CREDIT,
		],
	},
	{ id: "none", label: "None", credits: [] },
];

export const TERRAIN_OPTIONS: TerrainOption[] = [
	{ id: "ellipsoid", label: "Ellipsoid", credits: [] },
	{
		id: "world",
		label: "World Terrain",
		ion: true,
		credits: [ION_CREDIT],
	},
	{
		id: "bathy",
		label: "Bathymetry",
		ion: true,
		credits: [ION_CREDIT],
	},
];

const IMAGERY_IDS = new Set<string>(IMAGERY_OPTIONS.map((o) => o.id));
const TERRAIN_IDS = new Set<string>(TERRAIN_OPTIONS.map((o) => o.id));

export function imageryOption(id: ImageryId): ImageryOption {
	return IMAGERY_OPTIONS.find((o) => o.id === id) ?? IMAGERY_OPTIONS[0]!;
}

export function terrainOption(id: TerrainId): TerrainOption {
	return TERRAIN_OPTIONS.find((o) => o.id === id) ?? TERRAIN_OPTIONS[0]!;
}

export function resolveImageryId(
	raw: string | null | undefined,
	ionAvailable: boolean,
): ImageryId {
	const id = IMAGERY_IDS.has(raw ?? "") ? (raw as ImageryId) : "osm";
	if (imageryOption(id).ion && !ionAvailable) return "osm";
	return id;
}

export function resolveTerrainId(
	raw: string | null | undefined,
	ionAvailable: boolean,
): TerrainId {
	if (!raw) return ionAvailable ? "world" : "ellipsoid";
	const id = TERRAIN_IDS.has(raw) ? (raw as TerrainId) : null;
	if (!id) return ionAvailable ? "world" : "ellipsoid";
	if (terrainOption(id).ion && !ionAvailable) return "ellipsoid";
	return id;
}

export function readStoredImageryId(): string | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage.getItem(IMAGERY_KEY);
	} catch {
		return null;
	}
}

export function readStoredTerrainId(): string | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage.getItem(TERRAIN_KEY);
	} catch {
		return null;
	}
}

export function persistImageryId(id: ImageryId) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(IMAGERY_KEY, id);
	} catch {
		/* ignore */
	}
}

export function persistTerrainId(id: TerrainId) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(TERRAIN_KEY, id);
	} catch {
		/* ignore */
	}
}

export function creditsFor(
	imagery: ImageryId,
	terrain: TerrainId,
): CreditLink[] {
	const seen = new Set<string>();
	const out: CreditLink[] = [];
	for (const c of [
		...imageryOption(imagery).credits,
		...terrainOption(terrain).credits,
	]) {
		if (seen.has(c.label)) continue;
		seen.add(c.label);
		out.push(c);
	}
	return out;
}

export function usesIon(imagery: ImageryId, terrain: TerrainId): boolean {
	return Boolean(imageryOption(imagery).ion || terrainOption(terrain).ion);
}

export function createOsmImageryProvider(Cesium: any) {
	return new Cesium.UrlTemplateImageryProvider({
		url: OSM_TILE_URL,
		subdomains: OSM_TILE_SUBDOMAINS,
		maximumLevel: OSM_MAX_ZOOM,
		credit: "",
	});
}

function createTopoImageryProvider(Cesium: any) {
	return new Cesium.UrlTemplateImageryProvider({
		url: TOPO_TILE_URL,
		subdomains: TOPO_SUBDOMAINS,
		maximumLevel: TOPO_MAX_ZOOM,
		credit: "",
	});
}

function ionStyle(Cesium: any, name: "AERIAL" | "AERIAL_WITH_LABELS" | "ROAD") {
	return Cesium.IonWorldImageryStyle?.[name];
}

async function ionImageryFromAsset(Cesium: any, assetId: number) {
	if (typeof Cesium.IonImageryProvider?.fromAssetId === "function") {
		return Cesium.IonImageryProvider.fromAssetId(assetId);
	}
	throw new Error("Ion imagery is not available in this Cesium build");
}

async function ionWorldImagery(
	Cesium: any,
	styleName: "AERIAL" | "AERIAL_WITH_LABELS" | "ROAD",
	fallbackAsset: number,
) {
	const style = ionStyle(Cesium, styleName);
	if (
		typeof Cesium.createWorldImageryAsync === "function" &&
		style != null
	) {
		return Cesium.createWorldImageryAsync({ style });
	}
	return ionImageryFromAsset(Cesium, fallbackAsset);
}

export async function createImageryProvider(
	Cesium: any,
	id: ImageryId,
): Promise<any | null> {
	switch (id) {
		case "osm":
			return createOsmImageryProvider(Cesium);
		case "topo":
			return createTopoImageryProvider(Cesium);
		case "aerial":
			return ionWorldImagery(Cesium, "AERIAL", ION_AERIAL);
		case "hybrid":
			return ionWorldImagery(
				Cesium,
				"AERIAL_WITH_LABELS",
				ION_HYBRID,
			);
		case "streets":
			return ionWorldImagery(Cesium, "ROAD", ION_ROAD);
		case "sentinel":
			return ionImageryFromAsset(Cesium, ION_SENTINEL);
		case "night":
			return ionImageryFromAsset(Cesium, ION_NIGHT);
		case "none":
			return null;
	}
}

export async function createTerrainProvider(
	Cesium: any,
	id: TerrainId,
): Promise<any> {
	if (id === "world") {
		if (typeof Cesium.createWorldTerrainAsync === "function") {
			return Cesium.createWorldTerrainAsync();
		}
		if (typeof Cesium.createWorldTerrain === "function") {
			return Cesium.createWorldTerrain();
		}
		throw new Error("World Terrain is not available in this Cesium build");
	}
	if (id === "bathy") {
		if (typeof Cesium.createWorldBathymetryAsync === "function") {
			return Cesium.createWorldBathymetryAsync();
		}
		throw new Error("World Bathymetry is not available in this Cesium build");
	}
	return new Cesium.EllipsoidTerrainProvider();
}

/** Replace only the tracked basemap so coverage rasters stay in place. */
export function replaceBasemapLayer(
	viewer: any,
	basemapLayer: any,
	provider: any | null,
): any | null {
	const layers = viewer?.imageryLayers;
	if (!layers) return null;
	let insertAt = 0;
	if (basemapLayer && typeof layers.contains === "function") {
		try {
			if (layers.contains(basemapLayer)) {
				insertAt = Math.max(0, layers.indexOf(basemapLayer));
				layers.remove(basemapLayer, true);
			}
		} catch {
			/* ignore */
		}
	}
	if (!provider) return null;
	if (typeof layers.addImageryProvider === "function") {
		return layers.addImageryProvider(provider, insertAt);
	}
	return null;
}
