import { createAvatar } from "@dicebear/core";
import * as avataaars from "@dicebear/avataaars";
import {
	toDicebearOptions,
	type AvatarStyle,
} from "$lib/avatar-style";

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
