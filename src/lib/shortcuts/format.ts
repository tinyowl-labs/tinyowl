import type { Chord } from "./types";
import { normalizeKey } from "./chord";

export function isApplePlatform(): boolean {
	if (typeof navigator === "undefined") return false;
	return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

const KEY_LABELS: Record<string, string> = {
	Escape: "Esc",
	Enter: "Enter",
	Tab: "Tab",
	Delete: "Del",
	Backspace: "⌫",
	" ": "Space",
	"`": "`",
	ArrowUp: "↑",
	ArrowDown: "↓",
	ArrowLeft: "←",
	ArrowRight: "→",
};

export function formatChord(chord: Chord, apple = isApplePlatform()): string {
	const parts: string[] = [];
	if (chord.mod) parts.push(apple ? "⌘" : "Ctrl");
	if (chord.alt) parts.push(apple ? "⌥" : "Alt");
	if (chord.shift) parts.push(apple ? "⇧" : "Shift");
	const k = normalizeKey(chord.key);
	parts.push(KEY_LABELS[k] ?? (k.length === 1 ? k.toUpperCase() : k));
	return parts.join(apple ? "" : "+");
}

export function formatChordParts(
	chord: Chord,
	apple = isApplePlatform(),
): string[] {
	const parts: string[] = [];
	if (chord.mod) parts.push(apple ? "⌘" : "Ctrl");
	if (chord.alt) parts.push(apple ? "⌥" : "Alt");
	if (chord.shift) parts.push(apple ? "⇧" : "Shift");
	const k = normalizeKey(chord.key);
	parts.push(KEY_LABELS[k] ?? (k.length === 1 ? k.toUpperCase() : k));
	return parts;
}

export function ariaKeyshortcuts(chord: Chord, apple = isApplePlatform()): string {
	const parts: string[] = [];
	if (chord.mod) parts.push(apple ? "Meta" : "Control");
	if (chord.alt) parts.push("Alt");
	if (chord.shift) parts.push("Shift");
	const k = normalizeKey(chord.key);
	parts.push(k.length === 1 ? k.toUpperCase() : k);
	return parts.join("+");
}
