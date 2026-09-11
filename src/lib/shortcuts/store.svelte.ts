import { matchShortcut, isTypingTarget } from "./match";
import {
	chordFor,
	persistKeyboardToStorage,
	readKeyboardFromStorage,
	sanitizeKeyboardPrefs,
	serializeKeyboardPrefs,
	DEFAULT_PREFS,
} from "./persist";
import type {
	CameraScheme,
	Chord,
	KeyboardPreferences,
	ShortcutId,
	ShortcutScope,
} from "./types";

let prefs = $state<KeyboardPreferences>(readKeyboardFromStorage());
let flyActive = $state(false);

export const keyboardPrefs = {
	get chords() {
		return prefs.chords;
	},
	get cameraScheme() {
		return prefs.cameraScheme;
	},
	get flySensitivity() {
		return prefs.flySensitivity;
	},
	get pivotZoomSensitivity() {
		return prefs.pivotZoomSensitivity;
	},
};

export function currentChord(id: ShortcutId): Chord {
	return chordFor(id, prefs.chords);
}

export function matchPrefShortcut(
	ev: KeyboardEvent,
	scopes: ShortcutScope[],
	opts: { typing?: boolean; overlayOpen?: boolean } = {},
): ShortcutId | null {
	return matchShortcut(ev, {
		overrides: prefs.chords,
		scopes,
		typing: opts.typing,
		overlayOpen: opts.overlayOpen,
	});
}

export function setCameraScheme(scheme: CameraScheme): void {
	prefs.cameraScheme = scheme;
	persistKeyboardToStorage(prefs);
}

export function setFlySensitivity(value: number): void {
	prefs.flySensitivity = Math.max(0.25, Math.min(3, value));
	persistKeyboardToStorage(prefs);
}

export function setPivotZoomSensitivity(value: number): void {
	prefs.pivotZoomSensitivity = Math.max(0.25, Math.min(3, value));
	persistKeyboardToStorage(prefs);
}

export function setShortcutChord(id: ShortcutId, chord: Chord | null): void {
	if (chord) prefs.chords[id] = chord;
	else delete prefs.chords[id];
	prefs.chords = { ...prefs.chords };
	persistKeyboardToStorage(prefs);
}

export function resetShortcuts(): void {
	prefs = {
		cameraScheme: prefs.cameraScheme,
		flySensitivity: prefs.flySensitivity,
		pivotZoomSensitivity: prefs.pivotZoomSensitivity,
		chords: {},
	};
	persistKeyboardToStorage(prefs);
}

export function resetKeyboardPrefs(): void {
	prefs = { ...DEFAULT_PREFS, chords: {} };
	persistKeyboardToStorage(prefs);
}

export function applyRemoteKeyboard(raw: unknown): void {
	prefs = sanitizeKeyboardPrefs(raw);
	persistKeyboardToStorage(prefs);
}

export function isFlyActive(): boolean {
	return flyActive;
}

export function setFlyActive(on: boolean): void {
	flyActive = on;
}

export async function pushKeyboardToSupabase(): Promise<void> {
	try {
		const { createClient } = await import("$lib/supabase/client");
		const supabase = createClient();
		const { error } = await supabase.auth.updateUser({
			data: { keyboard_preferences: serializeKeyboardPrefs(prefs) },
		});
		if (error) {
			console.warn("[keyboard] push failed:", error.message);
		}
	} catch (e) {
		console.warn("[keyboard] push failed:", e);
	}
}

export async function pullKeyboardFromSupabase(knownUser?: { user_metadata?: Record<string, unknown> } | null): Promise<void> {
    if (knownUser !== undefined) {
        const remote = knownUser?.user_metadata?.keyboard_preferences;
        if (remote && typeof remote === "object") applyRemoteKeyboard(remote);
        return;
    }
	try {
		const { createClient } = await import("$lib/supabase/client");
		const supabase = createClient();
		const {
			data: { user },
			error,
		} = await supabase.auth.getUser();
		if (error || !user) return;
		const remote = user.user_metadata?.keyboard_preferences;
		if (!remote || typeof remote !== "object") return;
		applyRemoteKeyboard(remote);
	} catch (e) {
		console.warn("[keyboard] pull failed:", e);
	}
}

export { isTypingTarget, serializeKeyboardPrefs, DEFAULT_PREFS };
