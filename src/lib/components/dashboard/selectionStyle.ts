/** Shared selection highlight colors (primary vs other selected). */

export const SELECTION_PRIMARY = "#eab308"; // yellow — last / primary
export const SELECTION_SECONDARY = "#f97316"; // orange — other selected

export type SelectionKind = "primary" | "secondary" | null;

export function selectionKindFor(
	isSelected: boolean,
	isPrimary: boolean,
): SelectionKind {
	if (!isSelected) return null;
	return isPrimary ? "primary" : "secondary";
}

export function selectionColor(kind: SelectionKind): string | null {
	if (kind === "primary") return SELECTION_PRIMARY;
	if (kind === "secondary") return SELECTION_SECONDARY;
	return null;
}
