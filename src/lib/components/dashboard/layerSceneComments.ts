import type { GeoJsonGeometry } from "$lib/geoDiff";
import { asGeometry } from "$lib/geoDiff";
import type { CommentFilter, CommentDraft, MapComment } from "$lib/map-comments";
import { commentRoots } from "$lib/map-comments";
import { avatarPreview } from "$lib/stores/avatar-preview.svelte";
import type { DrawGeomMode, LonLatVertex } from "$lib/stores/editBuffer.svelte";

export const COMMENT_DS_NAME = "tinyowl-comments";
export const COMMENT_ID_PREFIX = "comment:";
export const COMMENT_PENDING_ID = "comment:pending";
export const COMMENT_SKETCH_ID = "comment:sketch";

export const COMMENT_OPEN = "#2563eb";
export const COMMENT_RESOLVED = "#64748b";
export const COMMENT_PENDING = "#f59e0b";
/** Fallback when theme primary is unavailable. */
export const COMMENT_PIN_AVATAR = COMMENT_OPEN;

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

type PinEmphasis = "normal" | "hover" | "selected";

const PIN_W = 80;
const PIN_H = 96;
const avatarImgs = new Map<string, HTMLImageElement | "loading" | "error">();
const pinMeta = new Map<
	string,
	{ userId: string; fill: string; canvas: HTMLCanvasElement; image: string | HTMLCanvasElement }
>();
let pinDs: any = null;
let pinViewer: any = null;

function avatarSrc(userId: string): string {
	return (
		avatarPreview.src(userId) ??
		`/users/${encodeURIComponent(userId)}/avatar`
	);
}

function drawAvatarPin(
	canvas: HTMLCanvasElement,
	fill: string,
	img: HTMLImageElement | null,
) {
	canvas.width = PIN_W;
	canvas.height = PIN_H;
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	ctx.clearRect(0, 0, PIN_W, PIN_H);
	ctx.fillStyle = fill;
	ctx.beginPath();
	ctx.moveTo(40, 94);
	ctx.lineTo(24, 58);
	ctx.lineTo(56, 58);
	ctx.closePath();
	ctx.fill();
	ctx.beginPath();
	ctx.arc(40, 40, 30, 0, Math.PI * 2);
	ctx.closePath();
	ctx.fill();
	if (img) {
		ctx.save();
		ctx.beginPath();
		ctx.arc(40, 40, 28, 0, Math.PI * 2);
		ctx.closePath();
		ctx.clip();
		ctx.drawImage(img, 12, 12, 56, 56);
		ctx.restore();
	}
	ctx.beginPath();
	ctx.arc(40, 40, 30, 0, Math.PI * 2);
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = 3;
	ctx.stroke();
}

function pinImage(
	userId: string,
	fill: string,
	canvas: HTMLCanvasElement,
): string | HTMLCanvasElement {
	const img = avatarImgs.get(userId);
	drawAvatarPin(
		canvas,
		fill,
		img instanceof HTMLImageElement ? img : null,
	);
	try {
		return canvas.toDataURL();
	} catch {
		return canvas;
	}
}

function ensureAvatar(userId: string) {
	if (!userId) return;
	const existing = avatarImgs.get(userId);
	if (existing instanceof HTMLImageElement || existing === "error") return;
	if (existing === "loading") return;
	avatarImgs.set(userId, "loading");
	const img = new Image();
	img.onload = () => {
		avatarImgs.set(userId, img);
		refreshPinsForUser(userId);
	};
	img.onerror = () => {
		avatarImgs.set(userId, "error");
	};
	img.src = avatarSrc(userId);
}

function applyPinImage(entityId: string, image: string | HTMLCanvasElement) {
	const entity = pinDs?.entities?.getById?.(entityId);
	if (!entity?.billboard) return;
	if (entity.billboard.image !== image) entity.billboard.image = image;
}

function refreshPinsForUser(userId: string) {
	for (const [id, meta] of pinMeta) {
		if (meta.userId !== userId) continue;
		const image = pinImage(meta.userId, meta.fill, meta.canvas);
		meta.image = image;
		applyPinImage(id, image);
	}
	try {
		pinViewer?.scene?.requestRender?.();
	} catch {
		/* ignore */
	}
}

let hiddenPinId: string | null = null;

function isPinEntityId(id: string): boolean {
	if (id === COMMENT_PENDING_ID) return true;
	if (!id.startsWith(COMMENT_ID_PREFIX)) return false;
	return !id.includes(":line:") && !id.includes(":poly:") && !id.includes(":pt:");
}

function applyHiddenPin(ds: any) {
	if (!ds?.entities?.values) return;
	const hideId = hiddenPinId ? commentEntityId(hiddenPinId) : "";
	for (const entity of ds.entities.values) {
		const id = String(entity.id ?? "");
		if (!entity.billboard || !isPinEntityId(id)) continue;
		entity.billboard.show = hideId ? id !== hideId : true;
	}
}

/** Hide the selected comment's billboard without rebuilding geometry. Unused while the balloon sits above the pin. */
export function hideCommentPin(ds: any, commentId: string | null) {
	hiddenPinId = commentId;
	applyHiddenPin(ds);
}

/** Scale the pin only — do not rebuild overlay geometry (that flickers). */
export function setCommentPinEmphasis(opts: {
	ds: any;
	comments: MapComment[];
	filter: CommentFilter;
	hoveredId?: string | null;
	selectedId?: string | null;
}): void {
	const {
		ds,
		comments,
		filter,
		hoveredId = null,
		selectedId = null,
	} = opts;
	if (!ds?.entities?.getById) return;
	const roots = commentRoots(comments, filter);
	for (const root of roots) {
		const entity = ds.entities.getById(commentEntityId(root.id));
		if (!entity?.billboard) continue;
		const emphasis: PinEmphasis =
			root.id === selectedId
				? "selected"
				: root.id === hoveredId
					? "hover"
					: "normal";
		entity.billboard.scale =
			emphasis === "hover" ? 1.22 : emphasis === "selected" ? 1.12 : 1;
	}
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
		fromCartesian?: (c: unknown) => { height: number } | undefined;
		toCartesian: (c: { height: number }) => unknown;
	};
	defined?: (v: unknown) => boolean;
	ArcType?: { NONE: unknown; GEODESIC: unknown };
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
 * Prefer stored vertex Z (same as CZML entities with cartographicDegrees height).
 * 2D leftovers resample once tiles are ready — never cache ellipsoid height.
 */
const MESH_LIFT_M = 0.35;
const heightCache = new Map<string, number>();
let clampIncomplete = false;

function lonLatKey(lon: number, lat: number): string {
	return `${lon.toFixed(6)},${lat.toFixed(6)}`;
}

export function clearCommentHeightCache() {
	heightCache.clear();
	clampIncomplete = true;
}

export function commentClampNeedsRetry(): boolean {
	return clampIncomplete;
}

function firstCoordOfGeom(geom: GeoJsonGeometry | null | undefined): number[] | null {
	if (!geom || !("coordinates" in geom)) return null;
	let c: unknown = (geom as { coordinates?: unknown }).coordinates;
	while (Array.isArray(c) && c.length > 0 && Array.isArray(c[0])) c = c[0];
	if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
		return c as number[];
	}
	return null;
}

export function firstHeightFromGeometry(
	geom: GeoJsonGeometry | null | undefined,
): number | undefined {
	const c = firstCoordOfGeom(geom);
	if (!c || c.length < 3) return undefined;
	const z = c[2];
	if (!Number.isFinite(z) || Math.abs(z as number) <= 1e-3) return undefined;
	return z as number;
}

function coordsHaveZ(coords: number[][] | undefined): boolean {
	if (!coords) return false;
	return coords.some((c) => c.length >= 3 && Number.isFinite(c[2]) && Math.abs(c[2]!) > 1e-3);
}

function sceneTilesets(viewer: any): any[] {
	const prims = viewer?.scene?.primitives;
	if (!prims?.length) return [];
	const out: any[] = [];
	const n = Number(prims.length) || 0;
	for (let i = 0; i < n; i++) {
		const p = prims.get?.(i);
		if (p && typeof p.tilesLoaded === "boolean") out.push(p);
	}
	return out;
}

function commentTilesReady(viewer: any): boolean {
	const tiles = sceneTilesets(viewer);
	if (tiles.length === 0) return true;
	return tiles.every((t) => t.tilesLoaded);
}

export function clampLonLatToScene(
	Cesium: any,
	viewer: any,
	lon: number,
	lat: number,
	height?: number,
	exclude?: unknown[],
): any {
	if (Number.isFinite(height) && Math.abs(height as number) > 1e-3) {
		return Cesium.Cartesian3.fromDegrees(lon, lat, (height as number) + MESH_LIFT_M);
	}
	const key = lonLatKey(lon, lat);
	const cached = heightCache.get(key);
	if (cached != null) {
		return Cesium.Cartesian3.fromDegrees(lon, lat, cached + MESH_LIFT_M);
	}
	if (!viewer?.scene) {
		clampIncomplete = true;
		return Cesium.Cartesian3.fromDegrees(lon, lat, 0);
	}
	const tilesReady = commentTilesReady(viewer);
	if (!tilesReady) {
		clampIncomplete = true;
		return Cesium.Cartesian3.fromDegrees(lon, lat, 0);
	}
	let sampled: number | undefined;
	try {
		const high = Cesium.Cartesian3.fromDegrees(lon, lat, 8000);
		const clamped = viewer.scene.clampToHeight?.(high, exclude);
		if (clamped && (typeof Cesium.defined !== "function" || Cesium.defined(clamped))) {
			const c = Cesium.Cartographic.fromCartesian?.(clamped);
			if (c && Number.isFinite(c.height) && Math.abs(c.height) > 1e-3) {
				sampled = c.height;
			}
		}
	} catch {
		/* ignore */
	}
	if (sampled == null) {
		try {
			const carto = Cesium.Cartographic.fromDegrees(lon, lat);
			const h = viewer.scene.sampleHeight?.(carto, exclude);
			if (Number.isFinite(h) && Math.abs(h as number) > 1e-3) sampled = h as number;
		} catch {
			/* ignore */
		}
	}
	if (sampled != null) {
		heightCache.set(key, sampled);
		return Cesium.Cartesian3.fromDegrees(lon, lat, sampled + MESH_LIFT_M);
	}
	clampIncomplete = true;
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
	pending: CommentDraft | null;
	sketch?: LonLatVertex[];
	sketchMode?: DrawGeomMode;
	openFill?: string;
	resolvedFill?: string;
	pendingFill?: string;
	pendingUserId?: string;
}): void {
	const {
		Cesium,
		viewer,
		ds,
		comments,
		filter,
		pending,
		sketch,
		sketchMode,
		openFill = COMMENT_OPEN,
		resolvedFill = COMMENT_RESOLVED,
		pendingFill = COMMENT_PENDING,
		pendingUserId = "",
	} = opts;
	if (!ds) return;
	pinDs = ds;
	pinViewer = viewer;
	clampIncomplete = false;
	const exclude = commentExclude(ds);
	const keep = new Set<string>();
	const roots = commentRoots(comments, filter);
	for (const root of roots) {
		const fill = root.status === "resolved" ? resolvedFill : openFill;
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
			root.author.id,
			root.status === "resolved",
			"normal",
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
			pendingFill,
			pendingUserId,
			false,
			"selected",
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
		pinMeta.delete(id);
		try {
			ds.entities.removeById(id);
		} catch {
			/* ignore */
		}
	}
	for (const id of [...pinMeta.keys()]) {
		if (!keep.has(id)) pinMeta.delete(id);
	}
	applyHiddenPin(ds);
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
	userId: string,
	dashed: boolean,
	emphasis: PinEmphasis = "normal",
) {
	const color =
		Cesium.Color.fromCssColorString(fill) ??
		Cesium.Color.fromCssColorString(COMMENT_OPEN);
	const geom = asGeometry(geometry) ?? geometry;
	const type = geom?.type ?? "Point";
	const pinId = baseId;
	keep.add(pinId);
	upsertPin(
		Cesium,
		viewer,
		ds,
		exclude,
		pinId,
		lon,
		lat,
		firstHeightFromGeometry(geom),
		fill,
		userId,
		emphasis,
	);

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
			const hasZ = coordsHaveZ(line);
			upsertLine(
				Cesium,
				ds,
				id,
				hasZ
					? lonLatToCartesians(Cesium, viewer, exclude, line)
					: lonLatOnEllipsoid(Cesium, line),
				color,
				dashed,
				!hasZ,
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
			const hasZ = coordsHaveZ(ring);
			upsertPoly(
				Cesium,
				ds,
				id,
				hasZ
					? lonLatToCartesians(Cesium, viewer, exclude, ring)
					: lonLatOnEllipsoid(Cesium, ring),
				color,
				!hasZ,
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

function lonLatOnEllipsoid(Cesium: CesiumLike, coords: number[][]) {
	return coords.map((c) => Cesium.Cartesian3.fromDegrees(c[0]!, c[1]!, 0));
}

function upsertPin(
	Cesium: CesiumLike,
	viewer: any,
	ds: any,
	exclude: unknown[],
	id: string,
	lon: number,
	lat: number,
	height: number | undefined,
	fill: string,
	userId: string,
	emphasis: PinEmphasis,
) {
	let entity = ds.entities.getById(id);
	let meta = pinMeta.get(id);
	if (!meta || meta.userId !== userId) {
		meta = {
			userId,
			fill,
			canvas: meta?.canvas ?? document.createElement("canvas"),
			image: "",
		};
		pinMeta.set(id, meta);
	}
	if (meta.fill !== fill || !meta.image) {
		meta.fill = fill;
		meta.image = pinImage(userId, fill, meta.canvas);
	}
	ensureAvatar(userId);
	const image = meta.image;
	const scale = emphasis === "hover" ? 1.22 : emphasis === "selected" ? 1.12 : 1;
	const position = clampLonLatToScene(Cesium, viewer, lon, lat, height, exclude);
	const billboard = {
		image,
		width: 40,
		height: 48,
		scale,
		verticalOrigin: Cesium.VerticalOrigin?.BOTTOM,
		heightReference: Cesium.HeightReference?.NONE,
		disableDepthTestDistance: Number.POSITIVE_INFINITY,
		show: true,
	};
	if (!entity) {
		ds.entities.add({ id, position, show: true, billboard });
		return;
	}
	entity.position = position;
	if (entity.billboard) {
		if (entity.billboard.image !== image) entity.billboard.image = image;
		entity.billboard.width = billboard.width;
		entity.billboard.height = billboard.height;
		entity.billboard.scale = scale;
		entity.billboard.heightReference = billboard.heightReference;
		entity.billboard.show = true;
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
	drape = false,
) {
	const material =
		dashed && Cesium.PolylineDashMaterialProperty
			? new Cesium.PolylineDashMaterialProperty({ color })
			: color;
	const polyline = {
		positions: positions.slice(),
		width: 3,
		material,
		clampToGround: drape,
		depthFailMaterial: material,
		disableDepthTestDistance: drape ? undefined : Number.POSITIVE_INFINITY,
		arcType: drape ? undefined : Cesium.ArcType?.NONE,
	};
	let entity = ds.entities.getById(id);
	if (!entity) {
		ds.entities.add({ id, polyline });
		return;
	}
	if (entity.polyline) {
		entity.polyline.positions = positions.slice();
		entity.polyline.material = material;
		entity.polyline.clampToGround = drape;
		entity.polyline.depthFailMaterial = material;
		entity.polyline.disableDepthTestDistance = drape
			? undefined
			: Number.POSITIVE_INFINITY;
		if (!drape && Cesium.ArcType) entity.polyline.arcType = Cesium.ArcType.NONE;
	}
}

function upsertPoly(
	Cesium: CesiumLike,
	ds: any,
	id: string,
	positions: unknown[],
	color: any,
	drape = false,
) {
	let entity = ds.entities.getById(id);
	const material = color?.withAlpha?.(0.28) ?? color;
	const hierarchy = new Cesium.PolygonHierarchy(positions.slice());
	const polygon = drape
		? {
				hierarchy,
				material,
				outline: true,
				outlineColor: color,
				classificationType: Cesium.ClassificationType?.BOTH,
			}
		: {
				hierarchy,
				material,
				outline: true,
				outlineColor: color,
				perPositionHeight: true,
				heightReference: Cesium.HeightReference?.NONE,
				disableDepthTestDistance: Number.POSITIVE_INFINITY,
			};
	if (!entity) {
		ds.entities.add({ id, polygon });
		return;
	}
	if (entity.polygon) {
		entity.polygon.hierarchy = hierarchy;
		entity.polygon.material = material;
		entity.polygon.outlineColor = color;
		if (drape) {
			entity.polygon.perPositionHeight = false;
			entity.polygon.height = undefined;
			entity.polygon.classificationType = Cesium.ClassificationType?.BOTH;
		} else {
			entity.polygon.height = undefined;
			entity.polygon.perPositionHeight = true;
			entity.polygon.disableDepthTestDistance = Number.POSITIVE_INFINITY;
			entity.polygon.classificationType = undefined;
			if (Cesium.HeightReference) {
				entity.polygon.heightReference = Cesium.HeightReference.NONE;
			}
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
