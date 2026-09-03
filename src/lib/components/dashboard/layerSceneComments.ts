import type { GeoJsonGeometry } from "$lib/geoDiff";
import { asGeometry } from "$lib/geoDiff";
import type { CommentFilter, CommentDraft, MapComment } from "$lib/map-comments";
import { commentRoots, threadCount } from "$lib/map-comments";
import type { DrawGeomMode, LonLatVertex } from "$lib/stores/editBuffer.svelte";

export const COMMENT_DS_NAME = "tinyowl-comments";
export const COMMENT_ID_PREFIX = "comment:";
export const COMMENT_PENDING_ID = "comment:pending";
export const COMMENT_SKETCH_ID = "comment:sketch";

export const COMMENT_OPEN = "#7c3aed";
export const COMMENT_RESOLVED = "#64748b";
export const COMMENT_PENDING = "#f59e0b";

export function commentEntityId(id: string): string {
	return COMMENT_ID_PREFIX + id;
}

export function parseCommentEntityId(id: unknown): string | null {
	if (typeof id !== "string" || !id.startsWith(COMMENT_ID_PREFIX)) return null;
	const rest = id.slice(COMMENT_ID_PREFIX.length);
	if (!rest || rest === "pending" || rest.startsWith("pending:") || rest === "sketch" || rest.startsWith("sketch:")) {
		return null;
	}
	return rest.split(":")[0] || null;
}

function pinSvg(fill: string, selected: boolean, badge: string): string {
	const stroke = selected ? "#fff" : "rgba(255,255,255,0.92)";
	const sw = selected ? 2 : 1.65;
	const inner =
		badge.length > 0
			? `<text x="16" y="18.2" text-anchor="middle" font-size="10" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700" fill="#fff">${badge}</text>`
			: `<circle cx="11.2" cy="14.8" r="1.65" fill="#fff"/><circle cx="16" cy="14.8" r="1.65" fill="#fff"/><circle cx="20.8" cy="14.8" r="1.65" fill="#fff"/>`;
	return `data:image/svg+xml,${encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="36" viewBox="0 0 32 36">
			<path fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"
				d="M7.2 2.4h17.6c2.65 0 4.8 2.15 4.8 4.8v10.4c0 2.65-2.15 4.8-4.8 4.8h-5.35L11.4 33.4l1.55-10.6H7.2c-2.65 0-4.8-2.15-4.8-4.8V7.2c0-2.65 2.15-4.8 4.8-4.8z"/>
			${inner}
		</svg>`,
	)}`;
}

type CesiumLike = {
	CustomDataSource: new (name: string) => any;
	Cartesian3: { fromDegrees: (lon: number, lat: number, h?: number) => unknown };
	Color: { fromCssColorString: (css: string) => { withAlpha: (a: number) => unknown } };
	VerticalOrigin?: { BOTTOM: unknown };
	HeightReference?: { CLAMP_TO_GROUND: unknown; NONE: unknown };
	ClassificationType?: { BOTH: unknown };
	PolylineDashMaterialProperty?: new (opts: { color: unknown }) => unknown;
	PolygonHierarchy: new (positions: unknown[], holes?: unknown[]) => unknown;
	Cartographic: {
		fromDegrees: (lon: number, lat: number, h?: number) => {
			height: number;
		};
		toCartesian: (c: { height: number }) => unknown;
	};
	defined?: (v: unknown) => boolean;
};

export function getOrCreateCommentDs(Cesium: CesiumLike, viewer: any, existing: any) {
	if (existing) return existing;
	const ds = new Cesium.CustomDataSource(COMMENT_DS_NAME);
	try {
		if (!viewer.dataSources.contains?.(ds)) {
			viewer.dataSources.add(ds);
		}
	} catch {
		viewer.dataSources.add(ds);
	}
	return ds;
}

/**
 * Place a lon/lat on the live scene (3D tiles + globe), not the ellipsoid.
 * Stored comment geom is 2D; authors pick the mesh, collaborators must resample.
 */
export function clampLonLatToScene(
	Cesium: any,
	viewer: any,
	lon: number,
	lat: number,
	height?: number,
	exclude?: unknown[],
): any {
	if (Number.isFinite(height) && Math.abs(height as number) > 1e-3) {
		return Cesium.Cartesian3.fromDegrees(lon, lat, height);
	}
	if (!viewer?.scene) {
		return Cesium.Cartesian3.fromDegrees(lon, lat, 0);
	}
	const high = Cesium.Cartesian3.fromDegrees(lon, lat, 8000);
	try {
		const clamped = viewer.scene.clampToHeight?.(high, exclude);
		if (clamped && (typeof Cesium.defined !== "function" || Cesium.defined(clamped))) {
			return Cesium.Cartesian3.clone(clamped);
		}
	} catch {
		/* ignore */
	}
	try {
		const carto = Cesium.Cartographic.fromDegrees(lon, lat);
		const sampled = viewer.scene.sampleHeight?.(carto, exclude);
		if (Number.isFinite(sampled)) {
			carto.height = sampled;
			return Cesium.Cartographic.toCartesian(carto);
		}
	} catch {
		/* ignore */
	}
	return Cesium.Cartesian3.fromDegrees(lon, lat, 0);
}

function commentExclude(ds: any): unknown[] {
	if (!ds?.entities?.values) return [];
	return [...ds.entities.values];
}

export function syncCommentPins(opts: {
	Cesium: CesiumLike;
	viewer?: any;
	ds: any;
	comments: MapComment[];
	filter: CommentFilter;
	selectedId: string | null;
	pending: CommentDraft | null;
	sketch?: LonLatVertex[];
	sketchMode?: DrawGeomMode;
}): void {
	const { Cesium, viewer, ds, comments, filter, selectedId, pending, sketch, sketchMode } = opts;
	if (!ds) return;
	const exclude = commentExclude(ds);
	const keep = new Set<string>();
	const roots = commentRoots(comments, filter);
	for (const root of roots) {
		const selected = selectedId === root.id;
		const count = threadCount(comments, root.id);
		const badge = count > 1 ? String(count) : "";
		const fill = root.status === "resolved" ? COMMENT_RESOLVED : COMMENT_OPEN;
		addShape(
			Cesium,
			viewer,
			ds,
			exclude,
			keep,
			commentEntityId(root.id),
			root.lon,
			root.lat,
			asGeometry(root.geometry) ?? root.geometry ?? null,
			fill,
			selected,
			badge,
			root.status === "resolved",
		);
	}
	if (pending) {
		addShape(
			Cesium,
			viewer,
			ds,
			exclude,
			keep,
			COMMENT_PENDING_ID,
			pending.lon,
			pending.lat,
			pending.geometry ?? null,
			COMMENT_PENDING,
			true,
			"",
			false,
		);
	}
	if (sketch && sketch.length > 0 && sketchMode) {
		addSketch(Cesium, viewer, ds, exclude, keep, sketch, sketchMode);
	}
	const remove: string[] = [];
	for (const entity of ds.entities.values) {
		const id = String(entity.id ?? "");
		if (!keep.has(id)) remove.push(id);
	}
	for (const id of remove) {
		try {
			ds.entities.removeById(id);
		} catch {
			/* ignore */
		}
	}
}

function addSketch(
	Cesium: CesiumLike,
	viewer: any,
	ds: any,
	exclude: unknown[],
	keep: Set<string>,
	verts: LonLatVertex[],
	mode: DrawGeomMode,
) {
	const color = Cesium.Color.fromCssColorString(COMMENT_PENDING);
	const cartesians = verts.map((v) =>
		clampLonLatToScene(Cesium, viewer, v.lon, v.lat, v.height, exclude),
	);
	const lineLike =
		mode === "LineString" ||
		mode === "MultiLineString" ||
		mode === "Polygon" ||
		mode === "MultiPolygon";
	const polyLike = mode === "Polygon" || mode === "MultiPolygon";
	for (let i = 0; i < cartesians.length; i++) {
		const id = `${COMMENT_SKETCH_ID}:pt:${i}`;
		keep.add(id);
		upsertPoint(Cesium, ds, id, cartesians[i], color);
	}
	if (lineLike && cartesians.length >= 2) {
		const id = `${COMMENT_SKETCH_ID}:line`;
		keep.add(id);
		upsertLine(Cesium, ds, id, cartesians, color, true);
	}
	if (polyLike && cartesians.length >= 3) {
		const id = `${COMMENT_SKETCH_ID}:poly`;
		keep.add(id);
		upsertPoly(Cesium, ds, id, cartesians, color);
	}
}

function addShape(
	Cesium: CesiumLike,
	viewer: any,
	ds: any,
	exclude: unknown[],
	keep: Set<string>,
	baseId: string,
	lon: number,
	lat: number,
	geometry: GeoJsonGeometry | null,
	fill: string,
	selected: boolean,
	badge: string,
	dashed: boolean,
) {
	const color = Cesium.Color.fromCssColorString(fill);
	const geom = asGeometry(geometry) ?? geometry;
	const type = geom?.type ?? "Point";
	const pinId = baseId;
	keep.add(pinId);
	upsertPin(Cesium, viewer, ds, exclude, pinId, lon, lat, fill, selected, badge);

	if (type === "MultiPoint") {
		const pts = (geom?.coordinates as number[][]) ?? [];
		pts.forEach((p, i) => {
			if (!Array.isArray(p) || p.length < 2) return;
			const id = `${baseId}:pt:${i}`;
			keep.add(id);
			upsertPoint(
				Cesium,
				ds,
				id,
				clampLonLatToScene(Cesium, viewer, p[0]!, p[1]!, p[2], exclude),
				color,
			);
		});
	}
	if (type === "LineString" || type === "MultiLineString") {
		const parts =
			type === "LineString"
				? [geom?.coordinates as number[][]]
				: ((geom?.coordinates as number[][][]) ?? []);
		parts.forEach((line, i) => {
			if (!Array.isArray(line) || line.length < 2) return;
			const id = `${baseId}:line:${i}`;
			keep.add(id);
			upsertLine(
				Cesium,
				ds,
				id,
				lonLatToCartesians(Cesium, viewer, exclude, line),
				color,
				dashed,
			);
		});
	}
	if (type === "Polygon" || type === "MultiPolygon") {
		const polys =
			type === "Polygon"
				? [geom?.coordinates as number[][][]]
				: ((geom?.coordinates as number[][][][]) ?? []);
		polys.forEach((poly, i) => {
			const ring = poly?.[0];
			if (!Array.isArray(ring) || ring.length < 3) return;
			const id = `${baseId}:poly:${i}`;
			keep.add(id);
			upsertPoly(
				Cesium,
				ds,
				id,
				lonLatToCartesians(Cesium, viewer, exclude, ring),
				color,
			);
		});
	}
}

function lonLatToCartesians(
	Cesium: CesiumLike,
	viewer: any,
	exclude: unknown[],
	coords: number[][],
) {
	return coords.map((c) =>
		clampLonLatToScene(Cesium, viewer, c[0]!, c[1]!, c[2], exclude),
	);
}

function upsertPin(
	Cesium: CesiumLike,
	viewer: any,
	ds: any,
	exclude: unknown[],
	id: string,
	lon: number,
	lat: number,
	fill: string,
	selected: boolean,
	badge: string,
) {
	let entity = ds.entities.getById(id);
	const image = pinSvg(fill, selected, badge);
	const position = clampLonLatToScene(Cesium, viewer, lon, lat, undefined, exclude);
	const billboard = {
		image,
		width: selected ? 32 : 26,
		height: selected ? 36 : 30,
		verticalOrigin: Cesium.VerticalOrigin?.BOTTOM,
		heightReference: Cesium.HeightReference?.NONE,
		disableDepthTestDistance: Number.POSITIVE_INFINITY,
		show: !selected,
	};
	if (!entity) {
		ds.entities.add({ id, position, show: !selected, billboard });
		return;
	}
	entity.show = !selected;
	entity.position = position;
	if (entity.billboard) {
		entity.billboard.image = image;
		entity.billboard.width = billboard.width;
		entity.billboard.height = billboard.height;
		entity.billboard.heightReference = billboard.heightReference;
		entity.billboard.show = !selected;
	}
}

function upsertPoint(
	Cesium: CesiumLike,
	ds: any,
	id: string,
	position: unknown,
	color: unknown,
) {
	let entity = ds.entities.getById(id);
	const point = {
		pixelSize: 8,
		color,
		heightReference: Cesium.HeightReference?.NONE,
		disableDepthTestDistance: Number.POSITIVE_INFINITY,
	};
	if (!entity) {
		ds.entities.add({ id, position, point });
		return;
	}
	entity.position = position;
	if (entity.point) {
		entity.point.heightReference = point.heightReference;
	}
}

function upsertLine(
	Cesium: CesiumLike,
	ds: any,
	id: string,
	positions: unknown[],
	color: unknown,
	dashed: boolean,
) {
	const material =
		dashed && Cesium.PolylineDashMaterialProperty
			? new Cesium.PolylineDashMaterialProperty({ color })
			: color;
	const polyline = {
		positions: positions.slice(),
		width: 3,
		material,
		clampToGround: false,
		depthFailMaterial: material,
	};
	let entity = ds.entities.getById(id);
	if (!entity) {
		ds.entities.add({ id, polyline });
		return;
	}
	if (entity.polyline) {
		entity.polyline.positions = positions.slice();
		entity.polyline.material = material;
		entity.polyline.clampToGround = false;
		entity.polyline.depthFailMaterial = material;
	}
}

function upsertPoly(
	Cesium: CesiumLike,
	ds: any,
	id: string,
	positions: unknown[],
	color: any,
) {
	let entity = ds.entities.getById(id);
	const material = color?.withAlpha?.(0.28) ?? color;
	const hierarchy = new Cesium.PolygonHierarchy(positions.slice());
	const polygon = {
		hierarchy,
		material,
		outline: true,
		outlineColor: color,
		perPositionHeight: true,
		heightReference: Cesium.HeightReference?.NONE,
	};
	if (!entity) {
		ds.entities.add({ id, polygon });
		return;
	}
	if (entity.polygon) {
		entity.polygon.hierarchy = hierarchy;
		entity.polygon.material = material;
		entity.polygon.outlineColor = color;
		entity.polygon.height = undefined;
		entity.polygon.perPositionHeight = true;
		if (Cesium.HeightReference) {
			entity.polygon.heightReference = Cesium.HeightReference.NONE;
		}
	}
}

export function pickCommentId(viewer: any, position: unknown): string | null {
	if (!viewer) return null;
	try {
		const picks = viewer.scene.drillPick(position, 8) ?? [];
		for (const picked of picks) {
			const entity = picked?.id;
			const raw =
				typeof entity?.id === "string"
					? entity.id
					: typeof entity === "string"
						? entity
						: "";
			const id = parseCommentEntityId(raw);
			if (id) return id;
		}
	} catch {
		/* ignore */
	}
	return null;
}
