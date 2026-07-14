/** Shared pick-hit types for 2D/3D overlap paging. */

export type PickCandidate = {
	key: string;
	layerName: string;
	entityId: string;
	label: string;
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

export function pickCandidateLabel(
	layerName: string,
	entityId: string,
	rows: Record<string, Record<string, unknown>[]>,
): string {
	const table = rows[layerName] ?? [];
	const row = table.find((r) => {
		const id = String(r.source_id ?? r.SOURCE_ID ?? "");
		return id.trim() === entityId.trim();
	});
	if (!row) return entityId;
	const name =
		row.name ??
		row.NAME ??
		row.label ??
		row.LABEL ??
		row.title ??
		row.TITLE;
	return name != null && String(name).trim() ? String(name) : entityId;
}
