/** Shared pick-hit types for 2D/3D overlap paging. */

export type PickCandidate = {
	key: string;
	layerName: string;
	entityId: string;
	label: string;
	/** CZML properties for the popup. */
	attributes?: Record<string, string>;
};

export function dedupePickCandidates(
	candidates: PickCandidate[],
): PickCandidate[] {
	const seen = new Set<string>();
	const out: PickCandidate[] = [];
	for (const c of candidates) {
		if (!c.key || seen.has(c.key)) continue;
		seen.add(c.key);
		out.push(c);
	}
	return out;
}

/** Read Cesium PropertyBag / plain props bag into string map. */
export function attrsFromRecord(
	src: Record<string, unknown> | undefined | null,
): Record<string, string> {
	if (!src) return {};
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(src)) {
		if (
			!k ||
			k.startsWith("_") ||
			k.startsWith("tinyowl") ||
			k === "geom" ||
			k === "geometry"
		) {
			continue;
		}
		if (v == null || v === "") continue;
		out[k] = String(v);
	}
	return out;
}

export function attrsFromEntity(props: any, time?: unknown): Record<string, string> {
	if (!props) return {};
	const names: string[] = props.propertyNames ?? Object.keys(props);
	const out: Record<string, string> = {};
	for (const key of names) {
		if (!key || key.startsWith("_") || key.startsWith("tinyowl") || key === "geom" || key === "geometry") continue;
		try {
			const p = props[key] ?? props.get?.(key);
			const v =
				p && typeof p.getValue === "function" ? p.getValue(time) : p;
			if (v != null && v !== "") out[key] = String(v);
		} catch {
			/* ignore */
		}
	}
	return out;
}

export function pickCandidateLabel(
	entityId: string,
	attrs?: Record<string, string>,
): string {
	const name = attrs?.name ?? attrs?.NAME ?? attrs?.label ?? attrs?.LABEL;
	return name?.trim() ? name : entityId;
}

function normAttrKey(key: string): string {
	return key.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Import / identity plumbing already shown in the popup header. */
const POPUP_CHROME_KEYS = new Set([
	"source_id",
	"entity_type",
	"resource_template",
	"source_file",
	"fid",
	"ogc_fid",
	"geom",
	"geometry",
]);

const POPUP_TITLE_KEYS = new Set(["label", "identifier", "name", "title"]);

/** Attribute rows for the pick popup — skip empty, header duplicates, and import chrome. */
export function popupAttrFields(
	attrs: Record<string, string> | undefined,
	opts: { label: string; entityId: string },
): Array<{ key: string; value: string }> {
	if (!attrs) return [];
	const label = opts.label.trim();
	const entityId = opts.entityId.trim();
	const out: Array<{ key: string; value: string }> = [];
	for (const [rawKey, rawVal] of Object.entries(attrs)) {
		const value = String(rawVal ?? "").trim();
		if (!value) continue;
		const nk = normAttrKey(rawKey);
		if (!nk || POPUP_CHROME_KEYS.has(nk) || nk.startsWith("tinyowl")) continue;
		if (
			POPUP_TITLE_KEYS.has(nk) &&
			(value === label || value === entityId)
		) {
			continue;
		}
		out.push({ key: rawKey.replace(/_/g, " "), value });
	}
	return out;
}
