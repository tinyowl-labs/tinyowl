/** Shared selection highlight colors (primary vs other selected). */

export const SELECTION_PRIMARY = "#eab308"; // yellow — last / primary
export const SELECTION_SECONDARY = "#f97316"; // orange — other selected

export type SelectionKind = "primary" | "secondary" | null;

function selectionColor(kind: SelectionKind): string | null {
	if (kind === "primary") return SELECTION_PRIMARY;
	if (kind === "secondary") return SELECTION_SECONDARY;
	return null;
}

export type EntitySelectionMeta = {
	kind: "point" | "polyline" | "polygon";
	base: any;
	basePixelSize: number;
	baseWidth: number;
	baseOutlineWidth: number;
	baseOutline: any;
	baseAlpha: number;
	dash?: boolean;
};

/** Paint a CZML entity as primary / secondary / unselected. */
export function applyEntitySelectionStyle(
	Cesium: any,
	entity: any,
	meta: EntitySelectionMeta | undefined,
	kind: SelectionKind,
) {
	if (!meta || !Cesium) return;
	const base = meta.base;
	const accentCss = selectionColor(kind);
	const accent = accentCss
		? Cesium.Color.fromCssColorString(accentCss)
		: null;
	const selected = kind != null;
	if (meta.kind === "point" && entity.point) {
		entity.point.pixelSize =
			kind === "primary"
				? Math.max(meta.basePixelSize + 6, 14)
				: selected
					? Math.max(meta.basePixelSize + 3, 11)
					: meta.basePixelSize;
		entity.point.color = accent ?? base;
		entity.point.outlineColor = selected
			? Cesium.Color.WHITE
			: (meta.baseOutline ?? Cesium.Color.WHITE);
		entity.point.outlineWidth = 1;
	} else if (meta.kind === "polyline" && entity.polyline) {
		entity.polyline.width =
			kind === "primary"
				? Math.max(meta.baseWidth + 3, 5)
				: selected
					? Math.max(meta.baseWidth + 1.5, 3.5)
					: meta.baseWidth;
		const color = accent ?? base;
		if (!selected && meta.dash && Cesium.PolylineDashMaterialProperty) {
			entity.polyline.material = new Cesium.PolylineDashMaterialProperty({
				color,
			});
		} else {
			entity.polyline.material = color;
		}
	} else if (meta.kind === "polygon" && entity.polygon) {
		const fill = accent ?? base;
		const a = selected
			? kind === "primary"
				? Math.min(meta.baseAlpha + 0.1, 0.55)
				: Math.min(meta.baseAlpha + 0.05, 0.5)
			: meta.baseAlpha;
		setPolygonBaseMaterial(Cesium, entity,
			fill && typeof fill.withAlpha === "function"
				? fill.withAlpha(a)
				: fill);
		if (entity.polygon.outlineColor !== undefined) {
			entity.polygon.outlineColor = selected
				? Cesium.Color.WHITE
				: (meta.baseOutline ?? base);
		}
		if (entity.polygon.outlineWidth !== undefined) {
			entity.polygon.outlineWidth =
				kind === "primary"
					? Math.max(meta.baseOutlineWidth + 1, 3)
					: selected
						? Math.max(meta.baseOutlineWidth + 0.5, 2.5)
						: meta.baseOutlineWidth;
		}
	}
}

// Keep the base material separate from transient selection. A stable dynamic color
// lets Cesium update instance attributes instead of rebuilding the polygon batch.
const polygonColors = new WeakMap<object, {
	polygon: any;
	base: any;
	material: any;
	kind: SelectionKind;
}>();

export function prepareSelectionEntity(Cesium: any, entity: any): boolean {
	const polygon = entity.polygon;
	if (!polygon || polygon.fill?.getValue?.() === false) return false;
	const existing = polygonColors.get(entity);
	if (existing && existing.polygon === polygon && existing.material === polygon.material) return true;
	const base = polygon.material;
	// Image, grid and other materials keep the separate highlight overlay.
	if (!(base instanceof Cesium.ColorMaterialProperty)) return false;
	const state = { polygon, base, material: null as any, kind: existing?.kind ?? null };
	const primary = Cesium.Color.fromCssColorString(SELECTION_PRIMARY);
	const secondary = Cesium.Color.fromCssColorString(SELECTION_SECONDARY);
	state.material = new Cesium.ColorMaterialProperty(new Cesium.CallbackProperty((time: any, result: any) => {
		const baseColor = state.base.color?.getValue(time, result);
		if (!state.kind) return baseColor;
		const color = Cesium.Color.clone(baseColor ?? Cesium.Color.TRANSPARENT, result);
		const accent = state.kind === "primary" ? primary : secondary;
		const tintAlpha = state.kind === "primary" ? 0.45 : 0.32;
		const baseWeight = color.alpha * (1 - tintAlpha);
		const alpha = tintAlpha + baseWeight;
		// Match a translucent highlight painted over the original fill.
		color.red = (accent.red * tintAlpha + color.red * baseWeight) / alpha;
		color.green = (accent.green * tintAlpha + color.green * baseWeight) / alpha;
		color.blue = (accent.blue * tintAlpha + color.blue * baseWeight) / alpha;
		color.alpha = alpha;
		return color;
	}, false));
	polygonColors.set(entity, state);
	polygon.material = state.material;
	return true;
}

export function setPolygonSelectionKind(entity: any, kind: SelectionKind) {
	const state = polygonColors.get(entity);
	if (state) state.kind = kind;
}

function setPolygonBaseMaterial(Cesium: any, entity: any, value: any) {
	const state = polygonColors.get(entity);
	const material = value instanceof Cesium.ColorMaterialProperty
		? value : new Cesium.ColorMaterialProperty(value);
	if (state && state.polygon === entity.polygon && entity.polygon.material === state.material) {
		state.base = material;
	} else entity.polygon.material = material;
}

/** Metadata snapshots must capture the base style, including during terrain reindexing. */
export function polygonBaseMaterial(entity: any) {
	const state = polygonColors.get(entity);
	return state && state.polygon === entity.polygon && entity.polygon.material === state.material
		? state.base : entity.polygon?.material;
}
