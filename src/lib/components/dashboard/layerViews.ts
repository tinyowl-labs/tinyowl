/** Product-owned named map views (czml.Style JSON + optional filter). */

export type LayerViewFilter = {
	field: string;
	op: "eq" | "contains";
	value: string;
};

export type StyleRenderer = "single" | "categorized";

export type LayerStyle = {
	fillColor: number[];
	strokeColor: number[];
	strokeWidth: number;
	pointSize: number;
	dash: boolean;
	labelField?: string;
	categories?: Record<string, number[]>;
	categoryField?: string;
	/** Omit / unknown treated as single, unless categoryField is set. */
	renderer?: StyleRenderer | "none";
};

export type LayerView = {
	id: string;
	name: string;
	style: LayerStyle;
	filter: LayerViewFilter | null;
	source?: string;
};

/** Session layer alpha when unset (polygons / lines). Points default to 1. */
export const DEFAULT_LAYER_OPACITY = 0.7;
export const DEFAULT_POINT_OPACITY = 1;
export const POINT_OUTLINE_WIDTH = 1;

export const DEFAULT_FILL = [230, 80, 80, 255];
export const DEFAULT_STROKE = [80, 160, 230, 255];
export const NONE_CATEGORY = "__none__";

const CAT_PALETTE: number[][] = [
	[230, 80, 80, 255],
	[80, 160, 230, 255],
	[80, 180, 100, 255],
	[230, 180, 60, 255],
	[160, 90, 200, 255],
	[40, 180, 180, 255],
	[220, 110, 50, 255],
	[90, 110, 200, 255],
];

export function noneCategoryKey(field: string): string {
	return `${field}=${NONE_CATEGORY}`;
}

function rgbKey(c: number[]): string {
	return `${c[0] ?? 0},${c[1] ?? 0},${c[2] ?? 0}`;
}

/** Next palette slot not used by other classes; otherwise a stable hash colour. */
export function unusedCategoryColor(used: number[][], salt: string): number[] {
	const taken = new Set(used.map(rgbKey));
	for (const c of CAT_PALETTE) {
		if (!taken.has(rgbKey(c))) return [...c];
	}
	return randomLayerColor(salt);
}

function isPlaceholderNoneColor(c: number[] | undefined): boolean {
	if (!c || c.length < 3) return true;
	const grey = c[0] === 158 && c[1] === 158 && c[2] === 158;
	const mauve = c[0] === 176 && c[1] === 138 && c[2] === 168;
	return grey || mauve;
}

export function styleRenderer(style: LayerStyle | undefined | null): StyleRenderer {
	if (!style) return "single";
	if (style.renderer === "categorized" || style.categoryField) return "categorized";
	return "single";
}

/** True when the CZML layer is points only (no lines/polygons). */
export function isPointLayer(packets: Record<string, unknown>[] | undefined): boolean {
	let points = 0;
	let other = 0;
	for (const p of packets ?? []) {
		if (p.polyline || p.polygon) other += 1;
		else if (p.point) points += 1;
	}
	return points > 0 && other === 0;
}

export function defaultOpacityForPackets(
	packets: Record<string, unknown>[] | undefined,
): number {
	return isPointLayer(packets) ? DEFAULT_POINT_OPACITY : DEFAULT_LAYER_OPACITY;
}

/** Black or white, whichever contrasts more with the fill. */
export function contrastColor(fill: number[] | undefined): number[] {
	const [r = 0, g = 0, b = 0] = fill ?? DEFAULT_FILL;
	const lin = (c: number) => {
		const s = Math.max(0, Math.min(255, c)) / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
	return L > 0.55 ? [20, 20, 20, 255] : [255, 255, 255, 255];
}

export function layerLegendColor(
	views: LayerView[] | undefined,
	activeId: string,
): number[] {
	const view = activeView(views, activeId);
	if (!view) return [...DEFAULT_FILL];
	if (styleRenderer(view.style) === "categorized") {
		const cats = Object.values(view.style.categories ?? {});
		const first = cats.find((c) => c?.length);
		if (first) return [...first];
	}
	return view.style.fillColor?.length ? [...view.style.fillColor] : [...DEFAULT_FILL];
}

/** FNV-1a 32-bit → hue 0–359 (stable per layer name). */
export function hashHue(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0) % 360;
}

export function hslToRgba(h: number, s: number, l: number, a = 255): number[] {
	let hue = h % 360;
	if (hue < 0) hue += 360;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const hp = hue / 60;
	const x = c * (1 - Math.abs((hp % 2) - 1));
	let r = 0;
	let g = 0;
	let b = 0;
	if (hp < 1) {
		r = c;
		g = x;
	} else if (hp < 2) {
		r = x;
		g = c;
	} else if (hp < 3) {
		g = c;
		b = x;
	} else if (hp < 4) {
		g = x;
		b = c;
	} else if (hp < 5) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}
	const m = l - c / 2;
	return [
		Math.round((r + m) * 255),
		Math.round((g + m) * 255),
		Math.round((b + m) * 255),
		a,
	];
}

export function randomLayerColor(layerName: string): number[] {
	const name = layerName.trim() || "layer";
	return hslToRgba(hashHue(name), 0.58, 0.52);
}

export function defaultStyle(layerName = ""): LayerStyle {
	const named = layerName.trim();
	const fill = named ? randomLayerColor(named) : [...DEFAULT_FILL];
	return {
		fillColor: fill,
		strokeColor: contrastColor(fill),
		strokeWidth: 2,
		pointSize: 8,
		dash: false,
		renderer: "single",
	};
}

export function seedLayerViews(layerName: string): LayerView[] {
	return [
		{
			id: `seed:${layerName}`,
			name: "Default",
			style: defaultStyle(layerName),
			filter: null,
			source: "default",
		},
	];
}

/** Seed or upgrade implicit styles into a persistent single-symbol colour. */
export function ensureExplicitViews(
	layerName: string,
	views: LayerView[] | undefined,
): { views: LayerView[]; persist: boolean } {
	if (!views?.length) {
		return { views: seedLayerViews(layerName), persist: true };
	}
	let persist = false;
	const next = views.map((v) => {
		if (v.source === "sld") return v;
		if (v.id.startsWith("seed:")) persist = true;
		if (styleRenderer(v.style) === "categorized") {
			const field = v.style.categoryField;
			if (!field) return v;
			const key = noneCategoryKey(field);
			if (!isPlaceholderNoneColor(v.style.categories?.[key])) return v;
			persist = true;
			const cloned = cloneView(v);
			const used = Object.entries(cloned.style.categories ?? {})
				.filter(([k]) => k !== key)
				.map(([, c]) => c);
			cloned.style.categories = {
				...(cloned.style.categories ?? {}),
				[key]: unusedCategoryColor(used, `${layerName}:${field}:none`),
			};
			return cloned;
		}
		const none = v.style.renderer === "none";
		const f = v.style.fillColor;
		const oldGlobal = f?.[0] === 230 && f?.[1] === 80 && f?.[2] === 80;
		if (!none && !oldGlobal) return v;
		persist = true;
		const cloned = cloneView(v);
		cloned.style = defaultStyle(layerName);
		cloned.source = undefined;
		return cloned;
	});
	return { views: next, persist };
}

export function cloneStyle(s: LayerStyle | undefined | null, layerName = ""): LayerStyle {
	const base = s ?? defaultStyle(layerName);
	return {
		fillColor: [...(base.fillColor?.length ? base.fillColor : DEFAULT_FILL)],
		strokeColor: [...(base.strokeColor?.length ? base.strokeColor : DEFAULT_STROKE)],
		strokeWidth: base.strokeWidth > 0 ? base.strokeWidth : 2,
		pointSize: base.pointSize > 0 ? base.pointSize : 8,
		dash: Boolean(base.dash),
		labelField: base.labelField || undefined,
		categoryField: base.categoryField || undefined,
		renderer: base.renderer,
		categories: base.categories
			? Object.fromEntries(
					Object.entries(base.categories).map(([k, v]) => [k, [...v]]),
				)
			: undefined,
	};
}

export function cloneView(v: LayerView): LayerView {
	return {
		id: v.id,
		name: v.name,
		style: cloneStyle(v.style),
		filter: v.filter
			? { field: v.filter.field, op: v.filter.op, value: v.filter.value }
			: null,
		source: v.source,
	};
}

export function activeView(views: LayerView[] | undefined, activeId: string): LayerView | null {
	if (!views?.length) return null;
	return views.find((v) => v.id === activeId) ?? views[0] ?? null;
}

export function rgbaToHex(c: number[] | undefined): string {
	const [r = 0, g = 0, b = 0] = c ?? [];
	const h = (n: number) =>
		Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
	return `#${h(r)}${h(g)}${h(b)}`;
}

export function hexToRgba(hex: string, alpha = 255): number[] {
	const s = hex.trim().replace("#", "");
	const full =
		s.length === 3
			? `${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`
			: s;
	if (full.length !== 6) return [...DEFAULT_FILL];
	const r = parseInt(full.slice(0, 2), 16);
	const g = parseInt(full.slice(2, 4), 16);
	const b = parseInt(full.slice(4, 6), 16);
	if ([r, g, b].some((n) => Number.isNaN(n))) return [...DEFAULT_FILL];
	return [r, g, b, alpha];
}

export function rgbaAlpha(c: number[] | undefined): number {
	if (!c || c.length < 4) return 255;
	return c[3]!;
}

export function styleableFields(rows: Record<string, unknown>[] | undefined): string[] {
	const names = new Set<string>();
	for (const row of rows ?? []) {
		for (const k of Object.keys(row)) {
			if (/^_/.test(k) || /^_?geom/i.test(k)) continue;
			if (/^source_id$/i.test(k)) continue;
			names.add(k);
		}
	}
	return [...names].sort((a, b) => a.localeCompare(b));
}

export function rowByEntityId(
	rows: Record<string, unknown>[] | undefined,
	entityId: string,
): Record<string, unknown> | undefined {
	if (!rows) return undefined;
	const want = entityId.trim();
	return rows.find((r) => {
		const id = String(r.source_id ?? r.SOURCE_ID ?? "");
		return id.trim() === want;
	});
}

export function rowField(row: Record<string, unknown> | undefined, field: string): string {
	if (!row || !field) return "";
	const direct = row[field];
	if (direct != null) return String(direct);
	const lower = field.toLowerCase();
	for (const [k, v] of Object.entries(row)) {
		if (k.toLowerCase() === lower && v != null) return String(v);
	}
	return "";
}

export function rowMatchesFilter(
	row: Record<string, unknown> | undefined,
	filter: LayerViewFilter | null | undefined,
): boolean {
	if (!filter?.field) return true;
	const got = rowField(row, filter.field);
	const want = filter.value ?? "";
	if (filter.op === "contains") {
		return got.toLowerCase().includes(want.toLowerCase());
	}
	return got === want;
}

export function resolveFill(style: LayerStyle, row: Record<string, unknown> | undefined): number[] {
	const base = style.fillColor?.length ? style.fillColor : DEFAULT_FILL;
	const field = style.categoryField;
	if (!field || !style.categories) return [...base];
	const val = rowField(row, field);
	if (val === "") {
		const none = style.categories[noneCategoryKey(field)];
		if (none?.length && !isPlaceholderNoneColor(none)) return [...none];
		const used = Object.entries(style.categories)
			.filter(([k]) => k !== noneCategoryKey(field))
			.map(([, c]) => c);
		return unusedCategoryColor(used, `${field}:none`);
	}
	const key = `${field}=${val}`;
	const cat = style.categories[key];
	return cat?.length ? [...cat] : [...base];
}

export function distinctValues(
	rows: Record<string, unknown>[] | undefined,
	field: string,
): string[] {
	const seen = new Set<string>();
	for (const row of rows ?? []) {
		const v = rowField(row, field);
		if (v !== "") seen.add(v);
	}
	return [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function categorizedStyle(style: LayerStyle, field: string, values: string[]): LayerStyle {
	const next = cloneStyle(style);
	next.renderer = "categorized";
	next.categoryField = field;
	const cats: Record<string, number[]> = {};
	values.forEach((v, i) => {
		const key = `${field}=${v}`;
		cats[key] = style.categories?.[key]
			? [...style.categories[key]!]
			: [...(CAT_PALETTE[i % CAT_PALETTE.length] ?? DEFAULT_FILL)];
	});
	const noneKey = noneCategoryKey(field);
	const used = Object.values(cats);
	const prevNone = style.categories?.[noneKey];
	cats[noneKey] =
		prevNone?.length && !isPlaceholderNoneColor(prevNone)
			? [...prevNone]
			: unusedCategoryColor(used, `${field}:none`);
	next.categories = cats;
	return next;
}

export function singleSymbolStyle(style: LayerStyle, layerName = ""): LayerStyle {
	const next = cloneStyle(style);
	next.renderer = "single";
	next.categoryField = undefined;
	next.categories = undefined;
	if (!next.fillColor?.length) {
		const named = layerName.trim() || "layer";
		next.fillColor = randomLayerColor(named);
	}
	next.strokeColor = contrastColor(next.fillColor);
	return next;
}

export function newViewId(): string {
	if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
	return `view-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
