/** Same-origin relative path only; used after login / OAuth / complete-profile. */
export function safeNext(raw: string | null | undefined, fallback = "/"): string {
	if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
	return raw;
}
