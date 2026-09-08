const USERNAME_RE = /^[a-z0-9_]{3,30}$/i;
const REAL_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function looksLikeEmail(value: string): boolean {
	return REAL_EMAIL_RE.test(value.trim());
}

export function looksLikeUsername(value: string): boolean {
	const s = value.trim().replace(/^@/, "");
	if (s.includes("@")) return false;
	return USERNAME_RE.test(s);
}

export function slugNamePart(value: string): string {
	return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function dottedPersonName(first?: string, last?: string): string {
	const a = slugNamePart(first ?? "");
	const b = slugNamePart(last ?? "");
	if (a && b) return `${a}.${b}`;
	return a || b;
}
