import type { Chord, ShortcutId } from "./types";
import { catalogEntry } from "./catalog";

export function normalizeKey(key: string): string {
	if (key.length === 1) return key.toLowerCase();
	if (key === "Esc") return "Escape";
	if (key === "Del") return "Delete";
	return key;
}

export function eventToChord(ev: KeyboardEvent): Chord {
	return {
		key: normalizeKey(ev.key),
		mod: Boolean(ev.metaKey || ev.ctrlKey),
		shift: Boolean(ev.shiftKey),
		alt: Boolean(ev.altKey),
	};
}

export function chordsEqual(a: Chord, b: Chord): boolean {
	if (normalizeKey(a.key) !== normalizeKey(b.key)) return false;
	if (Boolean(a.mod) !== Boolean(b.mod)) return false;
	if (Boolean(a.alt) !== Boolean(b.alt)) return false;
	const ignoreShift = a.key === "Escape" || b.key === "Escape";
	if (!ignoreShift && Boolean(a.shift) !== Boolean(b.shift)) return false;
	return true;
}

export function effectiveChords(
	id: ShortcutId,
	overrides: Partial<Record<ShortcutId, Chord>> | undefined,
): Chord[] {
	const entry = catalogEntry(id);
	if (!entry) return [];
	const override = overrides?.[id];
	if (override) return [override];
	return [entry.defaultChord, ...(entry.aliases ?? [])];
}

const MODIFIER_KEYS = new Set([
	"Shift",
	"Control",
	"Alt",
	"Meta",
	"AltGraph",
	"CapsLock",
]);

export function isModifierOnly(ev: KeyboardEvent): boolean {
	return MODIFIER_KEYS.has(ev.key);
}

/** Browser chords we refuse to bind (new tab, close, reload, …). */
const RESERVED: Chord[] = [
	{ key: "w", mod: true },
	{ key: "t", mod: true },
	{ key: "n", mod: true },
	{ key: "r", mod: true },
	{ key: "q", mod: true },
	{ key: "l", mod: true },
	{ key: "Tab", mod: true },
];

export function isReservedChord(chord: Chord): boolean {
	return RESERVED.some((r) => chordsEqual(r, chord));
}

export function serializeChord(c: Chord): Record<string, unknown> {
	const out: Record<string, unknown> = { key: normalizeKey(c.key) };
	if (c.mod) out.mod = true;
	if (c.shift) out.shift = true;
	if (c.alt) out.alt = true;
	return out;
}

export function parseChord(raw: unknown): Chord | null {
	if (!raw || typeof raw !== "object") return null;
	const src = raw as Record<string, unknown>;
	if (typeof src.key !== "string" || src.key.length === 0) return null;
	const chord: Chord = { key: normalizeKey(src.key) };
	if (src.mod === true) chord.mod = true;
	if (src.shift === true) chord.shift = true;
	if (src.alt === true) chord.alt = true;
	return chord;
}
