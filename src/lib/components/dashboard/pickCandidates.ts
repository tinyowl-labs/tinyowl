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
export function attrsFromEntity(props: any, time?: unknown): Record<string, string> {
	if (!props) return {};
	const names: string[] = props.propertyNames ?? Object.keys(props);
	const out: Record<string, string> = {};
	for (const key of names) {
		if (!key || key.startsWith("_") || key === "geom" || key === "geometry") continue;
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
