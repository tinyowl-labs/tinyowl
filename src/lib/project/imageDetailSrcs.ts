/** Pair a baked JPEG thumb with the original for progressive image viewers. */

import { browserMediaUrl } from "$lib/project/mediaUrl";

export function imageDetailSrcs(
    raw: string,
    opts?: { hash?: string; accessToken?: string; tiff?: boolean },
): { preview: string; full: string } {
    const preview = browserMediaUrl(raw, {
        hash: opts?.hash,
        accessToken: opts?.accessToken,
        variant: "preview",
    });
    if (opts?.tiff) return { preview, full: preview };
    const full = browserMediaUrl(raw, {
        hash: opts?.hash,
        accessToken: opts?.accessToken,
    });
    return { preview, full };
}
