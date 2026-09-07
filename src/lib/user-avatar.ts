import { createAvatar } from "@dicebear/core";
import * as avataaars from "@dicebear/avataaars";
import {
	toDicebearOptions,
	type AvatarStyle,
} from "$lib/avatar-style";

/** Two-letter initials (first + last word, else first two chars). */
export function initialsFromDisplayName(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) {
		const w = parts[0]!;
		return w.slice(0, Math.min(2, w.length)).toUpperCase();
	}
	return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

/** Avataaars SVG: seed-only, or pinned options from the personalisation menu. */
export function generatedAvatarSvg(
	seed: string,
	style?: AvatarStyle | null,
): string {
	return createAvatar(avataaars, toDicebearOptions(seed, style)).toString();
}

export function generatedAvatarDataUrl(
	seed: string,
	style?: AvatarStyle | null,
): string {
	return `data:image/svg+xml;utf8,${encodeURIComponent(generatedAvatarSvg(seed, style))}`;
}
