/** Shared Leaflet boot for 2D locator maps (home / bbox thumbs). */

import type {
	LatLngBounds,
	Map as LeafletMap,
	MapOptions,
	MarkerClusterGroup,
	MarkerClusterGroupOptions,
} from "leaflet";
import { OSM_MAX_ZOOM, OSM_TILE_SUBDOMAINS, OSM_TILE_URL } from "./osmTiles";

export type LeafletNS = typeof import("leaflet");

export type LeafletMapOpts = {
	interactive?: boolean;
	zoomControl?: boolean;
};

export type ClusterOpts = {
	disableClusteringAtZoom?: number;
	maxClusterRadius?: number;
};

let loadPromise: Promise<LeafletNS> | null = null;

export function loadLeaflet(): Promise<LeafletNS> {
	if (typeof window === "undefined") {
		return Promise.reject(new Error("Leaflet requires a browser"));
	}
	if (loadPromise) return loadPromise;
	loadPromise = (async () => {
		try {
			const [mod] = await Promise.all([
				import("leaflet"),
				import("leaflet/dist/leaflet.css"),
				import("./leafletLocator.css"),
			]);
			return (mod.default ?? mod) as LeafletNS;
		} catch (e) {
			loadPromise = null;
			throw e;
		}
	})();
	return loadPromise;
}

let clusterPromise: Promise<void> | null = null;

/** Leaflet + markercluster (sets window.L for the CJS plugin). */
export async function loadLeafletWithCluster(): Promise<LeafletNS> {
	const L = await loadLeaflet();
	(window as unknown as { L: LeafletNS }).L = L;
	if (!clusterPromise) {
		clusterPromise = import("./leafletCluster").then(() => undefined);
	}
	await clusterPromise;
	return L;
}

export function createClusterGroup(
	L: LeafletNS,
	opts: ClusterOpts = {},
): MarkerClusterGroup {
	const groupOpts: MarkerClusterGroupOptions = {
		showCoverageOnHover: false,
		spiderfyOnMaxZoom: true,
		zoomToBoundsOnClick: true,
		animate: true,
		disableClusteringAtZoom: opts.disableClusteringAtZoom ?? 12,
		maxClusterRadius: opts.maxClusterRadius ?? 56,
		iconCreateFunction: (cluster) => {
			const n = cluster.getChildCount();
			const size = n < 10 ? 36 : n < 100 ? 44 : 52;
			return L.divIcon({
				html: `<div class="leaflet-cluster-core"><span>${n}</span></div>`,
				className: "leaflet-cluster",
				iconSize: [size, size],
				iconAnchor: [size / 2, size / 2],
			});
		},
	};
	return L.markerClusterGroup(groupOpts);
}

export function createLeafletMap(
	L: LeafletNS,
	el: HTMLElement,
	opts: LeafletMapOpts = {},
): LeafletMap {
	const interactive = opts.interactive !== false;
	const mapOpts: MapOptions = {
		attributionControl: false,
		zoomControl: opts.zoomControl ?? false,
		dragging: interactive,
		scrollWheelZoom: interactive,
		doubleClickZoom: interactive,
		boxZoom: interactive,
		keyboard: interactive,
		touchZoom: interactive,
	};
	const map = L.map(el, mapOpts);
	map.setView([20, 0], 2);
	L.tileLayer(OSM_TILE_URL, {
		subdomains: OSM_TILE_SUBDOMAINS,
		maxZoom: OSM_MAX_ZOOM,
	}).addTo(map);

	if (!interactive) {
		map.getContainer().style.pointerEvents = "none";
	}

	queueMicrotask(() => {
		try {
			map.invalidateSize();
		} catch {
			/* ignore */
		}
	});

	return map;
}

export function tuneLeafletBasemap(map: LeafletMap, dark: boolean) {
	const bg = dark ? "#1a1a1a" : "#f5f5f5";
	map.getContainer().style.background = bg;
	const pane = map.getPane("tilePane");
	if (!pane) return;
	pane.style.filter = dark
		? "brightness(0.82) saturate(0.78) contrast(1.06)"
		: "";
}

export function destroyLeafletMap(map: LeafletMap | null | undefined) {
	try {
		map?.remove();
	} catch {
		/* ignore */
	}
}

export function observeLeafletResize(
	map: LeafletMap,
	el: HTMLElement,
): () => void {
	const ro = new ResizeObserver(() => {
		try {
			map.invalidateSize();
		} catch {
			/* ignore */
		}
	});
	ro.observe(el);
	return () => ro.disconnect();
}

export function viewBounds(map: LeafletMap) {
	try {
		map.invalidateSize({ animate: false });
	} catch {
		/* ignore */
	}
	const b = map.getBounds();
	let west = b.getWest();
	let south = b.getSouth();
	let east = b.getEast();
	let north = b.getNorth();
	// Leaflet reports lng outside ±180 on a wide canvas. Clamp rather than
	// wrap — wrapping would invert the box across the antimeridian.
	west = Math.max(-180, Math.min(180, west));
	east = Math.max(-180, Math.min(180, east));
	south = Math.max(-90, Math.min(90, south));
	north = Math.max(-90, Math.min(90, north));
	if (west > east) [west, east] = [east, west];
	if (south > north) [south, north] = [north, south];
	return { west, south, east, north };
}

/** Expand a tight project bbox so the thumbnail shows context. */
export function paddedLatLngBounds(
	L: LeafletNS,
	bounds: LatLngBounds,
	aspect = 2.8,
	pad = 2.4,
): LatLngBounds {
	const west = bounds.getWest();
	const south = bounds.getSouth();
	const east = bounds.getEast();
	const north = bounds.getNorth();
	let dw = Math.max(east - west, 0.008);
	let dh = Math.max(north - south, 0.008);
	dw *= pad;
	dh *= pad;
	if (dw / dh < aspect) dw = dh * aspect;
	else dh = dw / aspect;
	const cx = (west + east) / 2;
	const cy = (south + north) / 2;
	return L.latLngBounds(
		[cy - dh / 2, cx - dw / 2],
		[cy + dh / 2, cx + dw / 2],
	);
}

/** Haversine distance in metres. */
export function haversineMetres(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number,
): number {
	const R = 6371000;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
