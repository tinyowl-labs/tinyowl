import { catalogEntry, SHORTCUT_CATALOG } from "./catalog";
import { chordsEqual, parseChord, serializeChord } from "./chord";
import type {
	CameraScheme,
	Chord,
	KeyboardPreferences,
	ShortcutId,
} from "./types";

export const DEFAULT_PREFS: KeyboardPreferences = {
	chords: {},
	cameraScheme: "globe",
	flySensitivity: 1,
	pivotZoomSensitivity: 2,
};

const LS_KEY = "redthread:keyboard";
const SCHEMES = new Set<CameraScheme>(["globe", "pivot"]);

export function sanitizeKeyboardPrefs(raw: unknown): KeyboardPreferences {
	const out: KeyboardPreferences = { ...DEFAULT_PREFS, chords: {} };
	if (!raw || typeof raw !== "object") return out;
	const src = raw as Record<string, unknown>;
	if (src.cameraScheme === "inspect") {
		out.cameraScheme = "globe";
	} else if (src.cameraScheme && SCHEMES.has(src.cameraScheme as CameraScheme)) {
		out.cameraScheme = src.cameraScheme as CameraScheme;
	}
	if (typeof src.flySensitivity === "number" && Number.isFinite(src.flySensitivity)) {
		out.flySensitivity = Math.max(0.25, Math.min(3, src.flySensitivity));
	}
	if (
		typeof src.pivotZoomSensitivity === "number" &&
		Number.isFinite(src.pivotZoomSensitivity)
	) {
		out.pivotZoomSensitivity = Math.max(0.25, Math.min(3, src.pivotZoomSensitivity));
	}
	const chordsRaw = src.chords;
	if (chordsRaw && typeof chordsRaw === "object") {
		for (const [id, val] of Object.entries(chordsRaw as Record<string, unknown>)) {
			if (!catalogEntry(id as ShortcutId)) continue;
			const chord = parseChord(val);
			if (chord) out.chords[id as ShortcutId] = chord;
		}
	}
	return out;
}

export function serializeKeyboardPrefs(
	prefs: KeyboardPreferences,
): Record<string, unknown> {
	const chords: Record<string, unknown> = {};
	for (const [id, chord] of Object.entries(prefs.chords)) {
		if (chord) chords[id] = serializeChord(chord);
	}
	return {
		chords,
		cameraScheme: prefs.cameraScheme,
		flySensitivity: prefs.flySensitivity,
		pivotZoomSensitivity: prefs.pivotZoomSensitivity,
	};
}

export function readKeyboardFromStorage(): KeyboardPreferences {
	if (typeof localStorage === "undefined") return { ...DEFAULT_PREFS, chords: {} };
	try {
		const raw = localStorage.getItem(LS_KEY);
		if (!raw) return { ...DEFAULT_PREFS, chords: {} };
		return sanitizeKeyboardPrefs(JSON.parse(raw));
	} catch {
		return { ...DEFAULT_PREFS, chords: {} };
	}
}

export function persistKeyboardToStorage(prefs: KeyboardPreferences): void {
	if (typeof localStorage === "undefined") return;
	localStorage.setItem(LS_KEY, JSON.stringify(serializeKeyboardPrefs(prefs)));
}

export function chordFor(
	id: ShortcutId,
	overrides: Partial<Record<ShortcutId, Chord>> = {},
): Chord {
	return overrides[id] ?? catalogEntry(id)!.defaultChord;
}

/** First other remappable id in the same scope that already uses this chord. */
export function conflictFor(
	id: ShortcutId,
	chord: Chord,
	overrides: Partial<Record<ShortcutId, Chord>>,
): ShortcutId | null {
	const scope = catalogEntry(id)?.scope;
	if (!scope) return null;
	for (const entry of SHORTCUT_CATALOG) {
		if (entry.id === id) continue;
		if (entry.scope !== scope) continue;
		const other = overrides[entry.id] ?? entry.defaultChord;
		const aliases = overrides[entry.id] ? [] : (entry.aliases ?? []);
		if (chordsEqual(other, chord) || aliases.some((a) => chordsEqual(a, chord))) {
			return entry.id;
		}
	}
	return null;
}
