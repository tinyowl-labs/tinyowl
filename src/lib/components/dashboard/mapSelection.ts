/**
 * Screen-space box/lasso → entity keys for Cesium (TinyOwl `layer:id` keys).
 * Ported from lamina selection.ts with plain-drag replace support.
 */

export type GeoPoint = { longitude: number; latitude: number };
export type ScreenPoint = { x: number; y: number };
export type GeoBbox = {
	west: number;
	south: number;
	east: number;
	north: number;
};

export function geoPointsBbox(pts: GeoPoint[]): GeoBbox | null {
	if (pts.length === 0) return null;
	let west = Infinity;
	let south = Infinity;
	let east = -Infinity;
	let north = -Infinity;
	for (const p of pts) {
		if (p.longitude < west) west = p.longitude;
		if (p.longitude > east) east = p.longitude;
		if (p.latitude < south) south = p.latitude;
		if (p.latitude > north) north = p.latitude;
	}
	if (!Number.isFinite(west)) return null;
	return { west, south, east, north };
}

export function bboxesOverlap(a: GeoBbox, b: GeoBbox): boolean {
	return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

export function pointInBbox(lon: number, lat: number, b: GeoBbox): boolean {
	return lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north;
}

export function pointInGeoPolygon(
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
	bbox?: GeoBbox | null;
};

export function entityPositionSets(entity: any, time?: unknown): any[][] {
	const positionSets: any[][] = [];
	try {
		if (entity.polygon?.hierarchy) {
			const h =
				typeof entity.polygon.hierarchy.getValue === "function"
					? entity.polygon.hierarchy.getValue(time)
					: entity.polygon.hierarchy;
			const pts = h?.positions ?? h;
			if (Array.isArray(pts)) positionSets.push(pts);
		}
	} catch {
		/* ignore */
	}
	try {
		if (entity.polyline?.positions) {
			const pts =
				typeof entity.polyline.positions.getValue === "function"
					? entity.polyline.positions.getValue(time)
					: entity.polyline.positions;
			if (Array.isArray(pts)) positionSets.push(pts);
		}
	} catch {
		/* ignore */
	}
	try {
		if (entity.position) {
			const pos =
				typeof entity.position.getValue === "function"
					? entity.position.getValue(time)
					: entity.position;
			if (pos) positionSets.push([pos]);
		}
	} catch {
		/* ignore */
	}
	return positionSets;
}

export function bboxFromCartesians(Cesium: any, pts: any[]): GeoBbox | null {
	const geo: GeoPoint[] = [];
	for (const pos of pts) {
		try {
			const carto = Cesium.Cartographic.fromCartesian(pos);
			if (carto) {
				geo.push({
					longitude: carto.longitude,
					latitude: carto.latitude,
				});
			}
		} catch {
			/* ignore */
		}
	}
	return geoPointsBbox(geo);
}

export function bboxFromEntity(
	Cesium: any,
	entity: any,
	time?: unknown,
): GeoBbox | null {
	return bboxFromCartesians(Cesium, entityPositionSets(entity, time).flat());
}

function collectKeysInGeoPolygon(
	viewer: { clock: any },
	Cesium: any,
	items: SelectableEntity[],
	geoPolygon: GeoPoint[],
): string[] {
	if (geoPolygon.length < 3) return [];
	const ids = new Set<string>();
	const time = viewer.clock?.currentTime;
	const selBbox = geoPointsBbox(geoPolygon);

	for (const { key, entity, bbox } of items) {
		if (!key || ids.has(key)) continue;
		try {
			if (entity.show === false) continue;
		} catch {
			/* ignore */
		}
		if (selBbox && bbox && !bboxesOverlap(bbox, selBbox)) continue;

		const positionSets = entityPositionSets(entity, time);
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

function distToSegment(
	px: number,
	py: number,
	ax: number,
	ay: number,
	bx: number,
	by: number,
): number {
	const dx = bx - ax;
	const dy = by - ay;
	const len2 = dx * dx + dy * dy;
	if (len2 < 1e-12) return Math.hypot(px - ax, py - ay);
	let t = ((px - ax) * dx + (py - ay) * dy) / len2;
	t = Math.max(0, Math.min(1, t));
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * CPU overlap at a click: polygons that contain the lon/lat, points/lines
 * within a screen-pixel radius. Used instead of drillPick for the pager.
 */
export function collectKeysAtScreenPoint(
	Cesium: any,
	viewer: { scene: any; clock: any },
	items: SelectableEntity[],
	screen: ScreenPoint,
	geo: GeoPoint | null,
	opts?: { pointPx?: number; linePx?: number },
): string[] {
	const pointPx = opts?.pointPx ?? 12;
	const linePx = opts?.linePx ?? 8;
	const ids: string[] = [];
	const seen = new Set<string>();
	const time = viewer.clock?.currentTime;

	for (const { key, entity, bbox } of items) {
		if (!key || seen.has(key)) continue;
		try {
			if (entity.show === false) continue;
		} catch {
			/* ignore */
		}

		if (entity.polygon && geo) {
			if (bbox && !pointInBbox(geo.longitude, geo.latitude, bbox)) continue;
			const sets = entityPositionSets(entity, time);
			const ring = sets[0];
			if (!ring || ring.length < 3) continue;
			const poly: GeoPoint[] = [];
			for (const pos of ring) {
				try {
					const c = Cesium.Cartographic.fromCartesian(pos);
					if (c) poly.push({ longitude: c.longitude, latitude: c.latitude });
				} catch {
					/* ignore */
				}
			}
			if (poly.length >= 3 && pointInGeoPolygon(geo.longitude, geo.latitude, poly)) {
				seen.add(key);
				ids.push(key);
			}
			continue;
		}

		if (entity.point && entity.position) {
			try {
				const pos =
					typeof entity.position.getValue === "function"
						? entity.position.getValue(time)
						: entity.position;
				if (!pos) continue;
				const win = Cesium.SceneTransforms.worldToWindowCoordinates(
					viewer.scene,
					pos,
				);
				if (
					win &&
					Math.hypot(win.x - screen.x, win.y - screen.y) <= pointPx
				) {
					seen.add(key);
					ids.push(key);
				}
			} catch {
				/* ignore */
			}
			continue;
		}

		if (entity.polyline) {
			try {
				const pts =
					typeof entity.polyline.positions?.getValue === "function"
						? entity.polyline.positions.getValue(time)
						: entity.polyline.positions;
				if (!Array.isArray(pts) || pts.length < 2) continue;
				let hit = false;
				let prev: { x: number; y: number } | null = null;
				for (const pos of pts) {
					const win = Cesium.SceneTransforms.worldToWindowCoordinates(
						viewer.scene,
						pos,
					);
					if (!win) {
						prev = null;
						continue;
					}
					if (Math.hypot(win.x - screen.x, win.y - screen.y) <= linePx) {
						hit = true;
						break;
					}
					if (
						prev &&
						distToSegment(screen.x, screen.y, prev.x, prev.y, win.x, win.y) <=
							linePx
					) {
						hit = true;
						break;
					}
					prev = { x: win.x, y: win.y };
				}
				if (hit) {
					seen.add(key);
					ids.push(key);
				}
			} catch {
				/* ignore */
			}
		}
	}
	return ids;
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
