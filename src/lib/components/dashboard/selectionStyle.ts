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
		entity.polygon.material =
			fill && typeof fill.withAlpha === "function"
				? fill.withAlpha(a)
				: fill;
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
