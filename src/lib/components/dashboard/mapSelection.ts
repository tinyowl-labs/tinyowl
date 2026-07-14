/**
 * Screen-space box/lasso → entity keys for Cesium (TinyOwl `layer:id` keys).
 * Ported from lamina selection.ts with plain-drag replace support.
 */

export type GeoPoint = { longitude: number; latitude: number };
export type ScreenPoint = { x: number; y: number };

function pointInGeoPolygon(
	lon: number,
	lat: number,
	polygon: GeoPoint[],
): boolean {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const xi = polygon[i]!.longitude;
		const yi = polygon[i]!.latitude;
		const xj = polygon[j]!.longitude;
		const yj = polygon[j]!.latitude;
		if (
			yi > lat !== yj > lat &&
			lon < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi
		) {
			inside = !inside;
		}
	}
	return inside;
}

/** Ray-cast point-in-polygon in lon/lat degrees (Leaflet). */
export function pointInLonLatPolygon(
	lon: number,
	lat: number,
	ring: Array<{ lon: number; lat: number }>,
): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const xi = ring[i]!.lon;
		const yi = ring[i]!.lat;
		const xj = ring[j]!.lon;
		const yj = ring[j]!.lat;
		if (
			yi > lat !== yj > lat &&
			lon < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi
		) {
			inside = !inside;
		}
	}
	return inside;
}

function screenToCartographic(
	viewer: { camera: any; scene: any },
	Cesium: any,
	sx: number,
	sy: number,
): GeoPoint | null {
	try {
		const ray = viewer.camera.getPickRay(new Cesium.Cartesian2(sx, sy));
		if (ray) {
			const hit = viewer.scene.globe.pick(ray, viewer.scene);
			if (hit) {
				const c = Cesium.Cartographic.fromCartesian(hit);
				return { longitude: c.longitude, latitude: c.latitude };
			}
		}
	} catch {
		/* fall through */
	}
	try {
		const ellipsoid = viewer.camera.pickEllipsoid(
			new Cesium.Cartesian2(sx, sy),
		);
		if (ellipsoid) {
			const c = Cesium.Cartographic.fromCartesian(ellipsoid);
			return { longitude: c.longitude, latitude: c.latitude };
		}
	} catch {
		/* ignore */
	}
	return null;
}

export type SelectableEntity = {
	key: string;
	entity: any;
};

function collectKeysInGeoPolygon(
	viewer: { clock: any },
	Cesium: any,
	items: SelectableEntity[],
	geoPolygon: GeoPoint[],
): string[] {
	if (geoPolygon.length < 3) return [];
	const ids = new Set<string>();
	const time = viewer.clock?.currentTime;

	for (const { key, entity } of items) {
		if (!key || ids.has(key)) continue;
		try {
			if (entity.show === false) continue;
		} catch {
			/* ignore */
		}

		const positionSets: any[][] = [];
		try {
			if (entity.polygon?.hierarchy) {
				const h = entity.polygon.hierarchy.getValue(time);
				const pts = h?.positions ?? h;
				if (Array.isArray(pts)) positionSets.push(pts);
			}
		} catch {
			/* ignore */
		}
		try {
			if (entity.polyline?.positions) {
				const pts = entity.polyline.positions.getValue(time);
				if (Array.isArray(pts)) positionSets.push(pts);
			}
		} catch {
			/* ignore */
		}
		try {
			if (entity.position) {
				const pos = entity.position.getValue(time);
				if (pos) positionSets.push([pos]);
			}
		} catch {
			/* ignore */
		}

		let matched = false;
		outer: for (const pts of positionSets) {
			for (const pos of pts) {
				try {
					const carto = Cesium.Cartographic.fromCartesian(pos);
					if (
						pointInGeoPolygon(
							carto.longitude,
							carto.latitude,
							geoPolygon,
						)
					) {
						matched = true;
						break outer;
					}
				} catch {
					/* ignore */
				}
			}
		}
		if (matched) ids.add(key);
	}
	return Array.from(ids);
}

export function collectKeysInScreenRect(
	Cesium: any,
	viewer: { camera: any; scene: any; clock: any },
	items: SelectableEntity[],
	left: number,
	right: number,
	top: number,
	bottom: number,
): string[] {
	const corners = [
		{ x: left, y: top },
		{ x: right, y: top },
		{ x: right, y: bottom },
		{ x: left, y: bottom },
	];
	const geo = corners
		.map((p) => screenToCartographic(viewer, Cesium, p.x, p.y))
		.filter((c): c is GeoPoint => c != null);
	return collectKeysInGeoPolygon(viewer, Cesium, items, geo);
}

export function collectKeysInScreenPolygon(
	Cesium: any,
	viewer: { camera: any; scene: any; clock: any },
	items: SelectableEntity[],
	polygon: ScreenPoint[],
): string[] {
	if (polygon.length < 3) return [];
	const step = Math.max(1, Math.floor(polygon.length / 80));
	const sampled = polygon.filter((_, i) => i % step === 0);
	const geo = sampled
		.map((p) => screenToCartographic(viewer, Cesium, p.x, p.y))
		.filter((c): c is GeoPoint => c != null);
	return collectKeysInGeoPolygon(viewer, Cesium, items, geo);
}

/** Leaflet: keys whose representative point / bounds hit a latLng bounds. */
export function collectLeafletKeysInBounds(
	entries: Array<{
		key: string;
		layer: any;
	}>,
	bounds: any,
): string[] {
	const ids: string[] = [];
	for (const { key, layer } of entries) {
		try {
			if (typeof layer.getLatLng === "function") {
				if (bounds.contains(layer.getLatLng())) ids.push(key);
				continue;
			}
			if (typeof layer.getBounds === "function") {
				const b = layer.getBounds();
				if (b?.isValid?.() && bounds.intersects(b)) ids.push(key);
			}
		} catch {
			/* ignore */
		}
	}
	return ids;
}

/** Leaflet: keys whose representative lon/lat is inside a closed ring (degrees). */
export function collectLeafletKeysInLonLatRing(
	entries: Array<{
		key: string;
		layer: any;
	}>,
	ring: Array<{ lon: number; lat: number }>,
): string[] {
	if (ring.length < 3) return [];
	const ids: string[] = [];
	for (const { key, layer } of entries) {
		try {
			let lat = 0;
			let lon = 0;
			if (typeof layer.getLatLng === "function") {
				const ll = layer.getLatLng();
				lat = ll.lat;
				lon = ll.lng;
			} else if (typeof layer.getBounds === "function") {
				const b = layer.getBounds();
				if (!b?.isValid?.()) continue;
				const c = b.getCenter();
				lat = c.lat;
				lon = c.lng;
			} else continue;
			if (pointInLonLatPolygon(lon, lat, ring)) ids.push(key);
		} catch {
			/* ignore */
		}
	}
	return ids;
}
