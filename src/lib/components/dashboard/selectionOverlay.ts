/** Solid polygon fills are tinted in place; outlines and other highlights use an overlay. */

import { getOrAttachOverlayDs } from "$lib/geoDiff";
import { cesiumPropValue } from "./czmlLoad";
import { prepareSelectionEntity, setPolygonSelectionKind, SELECTION_PRIMARY, SELECTION_SECONDARY } from "./selectionStyle";

export { prepareSelectionEntity } from "./selectionStyle";

const SELECTION_DS_NAME = "tinyowl-selection";

export type SelectionOverlayItem = {
	entity: any;
	kind: "primary" | "secondary";
};

function cloneColor(Cesium: any, css: string) {
	return (
		Cesium.Color.fromCssColorString(css) ??
		Cesium.Color.fromBytes(234, 179, 8, 255)
	);
}

function pointHighlight(
	Cesium: any,
	id: string,
	entity: any,
	time: unknown,
	color: any,
	primary: boolean,
) {
	const pos = cesiumPropValue(entity.position, time);
	if (!pos) return;
	const base =
		Number(cesiumPropValue(entity.point?.pixelSize, time)) || 8;
	return {
		id,
		position: entity.position,
		point: {
			pixelSize: primary ? Math.max(base + 6, 14) : Math.max(base + 3, 11),
			color,
			outlineColor: Cesium.Color.WHITE,
			outlineWidth: 2,
			heightReference: entity.point?.heightReference,
			disableDepthTestDistance: Number.POSITIVE_INFINITY,
		},
		allowPicking: false,
	};
}

function lineHighlight(
	Cesium: any,
	id: string,
	entity: any,
	time: unknown,
	color: any,
	primary: boolean,
) {
	const pts = cesiumPropValue(entity.polyline?.positions, time);
	if (!Array.isArray(pts) || pts.length < 2) return;
	const base = Number(cesiumPropValue(entity.polyline?.width, time)) || 2;
	return {
		id,
		polyline: {
			positions: entity.polyline.positions,
			width: primary ? Math.max(base + 3, 5) : Math.max(base + 1.5, 3.5),
			material: color,
			clampToGround: entity.polyline.clampToGround,
			arcType: entity.polyline.arcType,
			granularity: entity.polyline.granularity,
		},
		allowPicking: false,
	};
}

function polygonHighlight(
	Cesium: any,
	id: string,
	entity: any,
	time: unknown,
	color: any,
	primary: boolean,
) {
	const raw: any = cesiumPropValue(entity.polygon?.hierarchy, time);
	const hierarchy = raw?.positions ?? raw;
	if (!Array.isArray(hierarchy) || hierarchy.length < 3) return;
	const alpha = primary ? 0.45 : 0.32;

	return {
		id,
		polygon: {
			hierarchy: entity.polygon.hierarchy,
			fill: true,
			material: color.withAlpha(alpha),
			outline: true,
			outlineColor: Cesium.Color.WHITE,
			outlineWidth: primary ? 3 : 2,
			perPositionHeight: entity.polygon.perPositionHeight,
			classificationType: entity.polygon.classificationType,
			heightReference: entity.polygon.heightReference,
			extrudedHeightReference: entity.polygon.extrudedHeightReference,
			height: entity.polygon.height,
			extrudedHeight: entity.polygon.extrudedHeight,
			closeTop: entity.polygon.closeTop,
			closeBottom: entity.polygon.closeBottom,
			arcType: entity.polygon.arcType,
			granularity: entity.polygon.granularity,
		},
		allowPicking: false,
	};
}

type Entry = {
	source: any;
	highlight: any;
	kind: "primary" | "secondary";
	active: boolean;
	valid?: boolean;
	direct?: boolean;
	outline?: any;
	fillColor?: any;
	material?: any;
	removeListener?: () => void;
};
type OverlayState = { entries: Map<any, Entry>; nextId: number };
const states = new WeakMap<object, OverlayState>();
const requests = new WeakMap<object, number>();
// Retain recently cleared selections without retaining an entire visited dataset.
const MAX_IDLE_ENTITIES = 128;
const MAX_IDLE_VERTICES = 65536;

function vertexCount(entity: any, time: any): number {
	const hierarchy = cesiumPropValue(entity.polygon?.hierarchy, time);
	const count = (h: any): number => (h?.positions?.length ?? (Array.isArray(h) ? h.length : 0)) +
		(h?.holes ?? []).reduce((n: number, hole: any) => n + count(hole), 0);
	const positions = cesiumPropValue(entity.polyline?.positions, time);
	return hierarchy ? count(hierarchy) : Array.isArray(positions) ? positions.length : 1;
}

function updateGraphics(graphic: any, values: Record<string, any>) {
	for (const [key, value] of Object.entries(values)) {
		const current = graphic[key];
		if (current === value) continue;
		if (key === "material" && value && typeof value.getValue !== "function" && current?.color?.setValue) {
			current.color.setValue(value);
		} else if (value !== undefined && typeof value?.getValue !== "function" && current?.isConstant && current?.setValue) {
			// Reuse ConstantProperty: assigning raw values creates a new property
			// and tells Cesium to rebuild geometry even when the value is equal.
			current.setValue(value);
		} else graphic[key] = value;
	}
}

/** Geometry properties are shared read-only; only highlight styling is independent. */
function updateHighlight(Cesium: any, viewer: any, entry: Entry, id: string): any {
	const source = entry.source;
	const time = viewer.clock?.currentTime;
	const primary = entry.kind === "primary";
	const color = cloneColor(Cesium, primary ? SELECTION_PRIMARY : SELECTION_SECONDARY);
	let options: any;
	if (source.point) options = pointHighlight(Cesium, id, source, time, color, primary);
	else if (source.polyline) options = lineHighlight(Cesium, id, source, time, color, primary);
	else if (source.polygon) options = polygonHighlight(Cesium, id, source, time, color, primary);
	entry.valid = Boolean(options);
	if (!options) { setPolygonSelectionKind(source, null); if (entry.highlight) entry.highlight.show = false; if (entry.outline) entry.outline.show = false; return null; }
	if (!options.polygon && entry.outline) { entry.outline.show = false; detachGeometry(entry.outline.polygon); }
	entry.direct = Boolean(options.polygon && prepareSelectionEntity(Cesium, source));
	setPolygonSelectionKind(source, entry.direct && entry.active ? entry.kind : null);
	if (entry.direct) {
		options.polygon.fill = false;
		options.polygon.material = Cesium.Color.WHITE;
		if (entry.outline) entry.outline.show = false;
	} else if (options.polygon) {
		entry.fillColor = color.withAlpha(primary ? 0.45 : 0.32);
		// A changing color property updates instance attributes without rebuilding the fill.
		entry.material ??= new Cesium.ColorMaterialProperty(new Cesium.CallbackProperty(
			(_time: any, result: any) => Cesium.Color.clone(entry.fillColor, result), false,
		));
		// Outline width changes may rebuild its geometry independently of the fill.
		if (entry.outline) {
			updateGraphics(entry.outline.polygon, { ...options.polygon, fill: false });
			entry.outline.show = entry.active && source.show !== false;
		}
		options.polygon.material = entry.material;
		options.polygon.outline = false;
		options.polygon.outlineWidth = undefined;
	}
	if (entry.highlight) {
		const h = entry.highlight;
		if (h.position !== options.position) h.position = options.position;
		for (const key of ["point", "polyline", "polygon"]) {
			if (options[key] && h[key]) updateGraphics(h[key], options[key]);
			else if (h[key] !== options[key]) {
				if (h[key]) detachGeometry(h[key]);
				h[key] = options[key];
			}
		}
		h.show = entry.active && source.show !== false;
	}
	return options;
}

const SHARED_GEOMETRY_FIELDS = ["hierarchy", "positions", "height", "heightReference", "extrudedHeight", "extrudedHeightReference", "perPositionHeight", "classificationType", "closeTop", "closeBottom", "arcType", "granularity", "clampToGround"];
function detachGeometry(graphic: any) {
	for (const field of SHARED_GEOMETRY_FIELDS) if (field in graphic) graphic[field] = undefined;
}
function releaseEntry(entry: Entry) {
	setPolygonSelectionKind(entry.source, null);
	entry.removeListener?.();
	// Removing an Entity does not detach its Graphics' shared-property listeners.
	for (const entity of [entry.highlight, entry.outline]) if (entity) {
		entity.position = undefined;
		for (const key of ["point", "polyline", "polygon"]) if (entity[key]) detachGeometry(entity[key]);
	}
}

/** Reconcile selected entities; idle retention is bounded by count and vertex budget. */
export async function syncSelectionOverlay(
	Cesium: any, viewer: any, items: SelectionOverlayItem[],
): Promise<any | null> {
	if (!Cesium || !viewer || viewer.isDestroyed?.()) return null;
	const request = (requests.get(viewer) ?? 0) + 1;
	requests.set(viewer, request);
	let ds: any;
	try { ds = await getOrAttachOverlayDs(Cesium, viewer, SELECTION_DS_NAME); }
	catch (error) { if (viewer.isDestroyed?.()) return null; throw error; }
	if (viewer.isDestroyed?.() || requests.get(viewer) !== request) return null;
	let state = states.get(ds);
	if (!state) {
		state = { entries: new Map(), nextId: 0 };
		states.set(ds, state);
		const owned = state;
		const remove = viewer.dataSources.dataSourceRemoved?.addEventListener((_collection: any, removed: any) => {
			if (removed !== ds) return;
			for (const entry of owned.entries.values()) releaseEntry(entry);
			owned.entries.clear();
			states.delete(ds);
			remove?.();
		});
	}
	const entries = state.entries;
	const selected = new Map<any, "primary" | "secondary">();
	for (const item of items) if (item.entity && item.entity.show !== false) {
		if (selected.get(item.entity) !== "primary") selected.set(item.entity, item.kind);
	}
	const evict = (source: any, entry: Entry) => {
		releaseEntry(entry);
		if (entry.highlight) ds.entities.remove(entry.highlight);
		if (entry.outline) ds.entities.remove(entry.outline);
		entries.delete(source);
	};
	ds.entities.suspendEvents();
	try {
		for (const [source, entry] of entries) if (!selected.has(source)) {
			entry.active = false;
			setPolygonSelectionKind(source, null);
			entry.highlight.show = false;
			if (entry.outline) entry.outline.show = false;
		}
		for (const [source, kind] of selected) {
			let entry = entries.get(source);
			if (!entry) {
				entry = { source, kind, active: true, highlight: null };
				const options = updateHighlight(Cesium, viewer, entry, `sel:${state.nextId++}`);
				if (!options) continue;
				entry.highlight = ds.entities.add(options);
				if (options.polygon && !entry.direct) {
					entry.outline = ds.entities.add({ id: options.id + ":outline", polygon: {
						...options.polygon, material: Cesium.Color.WHITE, fill: false,
						outline: true, outlineWidth: kind === "primary" ? 3 : 2,
					} });
				}
				const owned = entry;
				entry.removeListener = source.definitionChanged?.addEventListener(() => {
					if (!owned.active) { evict(source, owned); return; }
					const updated = updateHighlight(Cesium, viewer, owned, owned.highlight.id);
					if (updated?.polygon && !owned.direct && !owned.outline) {
						owned.outline = ds.entities.add({ id: updated.id + ":outline", polygon: {
							...updated.polygon, material: Cesium.Color.WHITE, fill: false,
							outline: true, outlineWidth: owned.kind === "primary" ? 3 : 2,
						} });
					}
					viewer.scene.requestRender();
				});
			} else {
				entry.active = true;
				if (entry.direct) setPolygonSelectionKind(source, kind);
				if (entry.kind !== kind) {
					entry.kind = kind;
					updateHighlight(Cesium, viewer, entry, entry.highlight.id);
				}
				entry.highlight.show = entry.valid !== false && source.show !== false;
				if (entry.outline) entry.outline.show = !entry.direct && Boolean(source.polygon) && entry.valid !== false && source.show !== false;
				entries.delete(source);
			}
			entries.set(source, entry);
		}
		let count = 0, vertices = 0;
		// Newest idle entries get the cache budget; selected geometry is never evicted.
		for (const [source, entry] of [...entries].reverse()) if (!entry.active) {
			const geometry = source.polygon ?? source.polyline ?? source.point;
			if ([source.position, geometry?.hierarchy, geometry?.positions, geometry?.height, geometry?.extrudedHeight].some(property => property?.isConstant === false)) {
				evict(source, entry); continue;
			}
			const cost = vertexCount(source, viewer.clock?.currentTime);
			if (count >= MAX_IDLE_ENTITIES || vertices + cost > MAX_IDLE_VERTICES) evict(source, entry);
			else { count++; vertices += cost; }
		}
	} finally { ds.entities.resumeEvents(); }
	viewer.scene.requestRender();
	return ds;
}
