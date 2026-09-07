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

export function withMediaToken(path: string, accessToken = ""): string {
	if (!path) return path;
	if (!accessToken || /[?&]token=/.test(path)) return path;
	const sep = path.includes("?") ? "&" : "?";
	return `${path}${sep}token=${encodeURIComponent(accessToken)}`;
}

export function browserMediaUrl(
	raw: string,
	opts?: { hash?: string; accessToken?: string },
): string {
	return withMediaToken(
		sameOriginMediaPath(raw, opts?.hash ?? ""),
		opts?.accessToken ?? "",
	);
}
