import { createAvatar } from "@dicebear/core";
import * as avataaars from "@dicebear/avataaars";

/** Seeded Avataaars SVG when the user has no uploaded avatar. */
export function generatedAvatarSvg(seed: string): string {
	return createAvatar(avataaars, { seed }).toString();
}
