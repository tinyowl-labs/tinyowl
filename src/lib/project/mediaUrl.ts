/** Browser-facing media URLs. `/media/{hash}` is proxied; `<img>` needs `?token=`. */

export function sameOriginMediaPath(raw: string, hash = ""): string {
	const s = raw.trim();
	if (!s) return hash ? `/media/${hash}` : "";
	if (s.startsWith("/")) return s;
	try {
		if (/^https?:\/\//i.test(s)) {
			const u = new URL(s);
			return u.pathname + u.search || (hash ? `/media/${hash}` : s);
		}
	} catch {
		/* keep */
	}
	return hash ? `/media/${hash}` : s;
}

export function withMediaVariant(
	path: string,
	variant?: "preview" | "full",
): string {
	if (!path || !variant || variant === "full") return path;
	if (/[?&]variant=/.test(path)) return path;
	const sep = path.includes("?") ? "&" : "?";
	return `${path}${sep}variant=${encodeURIComponent(variant)}`;
}

export function withMediaToken(path: string, accessToken = ""): string {
	if (!path) return path;
	if (!accessToken || /[?&]token=/.test(path)) return path;
	const sep = path.includes("?") ? "&" : "?";
	return `${path}${sep}token=${encodeURIComponent(accessToken)}`;
}

export function browserMediaUrl(
	raw: string,
	opts?: {
		hash?: string;
		accessToken?: string;
		variant?: "preview" | "full";
	},
): string {
	return withMediaToken(
		withMediaVariant(
			sameOriginMediaPath(raw, opts?.hash ?? ""),
			opts?.variant,
		),
		opts?.accessToken ?? "",
	);
}

/** Thumb / chip / similar-hit URL (`?variant=preview`). Missing preview is 404, not the original. */
export function browserThumbUrl(
	raw: string,
	opts?: { hash?: string; accessToken?: string },
): string {
	return browserMediaUrl(raw, { ...opts, variant: "preview" });
}
