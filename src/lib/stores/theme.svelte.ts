import { MediaQuery } from 'svelte/reactivity';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BgBase = 'pitch' | 'dark' | 'dim' | 'stone' | 'paper';
export type RadiusScale = 'sharp' | 'rounded' | 'pill';
/** Overlay chrome: solid, accent wash, or clear glass (not frost). */
export type SurfaceEffect = 'none' | 'tinted' | 'glass';
export type ColorScheme = 'system' | 'light' | 'dark';

export interface ThemePreferences {
	accentHue: number;
	bgBase: BgBase;
	radius: RadiusScale;
	surface: SurfaceEffect;
	colorScheme: ColorScheme;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULTS: ThemePreferences = {
	accentHue: 220,
	bgBase: 'dark',
	radius: 'pill',
	surface: 'tinted',
	colorScheme: 'system'
};

const COLOR_SCHEMES: Record<ColorScheme, true> = {
	system: true,
	light: true,
	dark: true
};

export const COLOR_SCHEME_OPTIONS: { value: ColorScheme; label: string }[] = [
	{ value: 'system', label: 'System' },
	{ value: 'light', label: 'Light' },
	{ value: 'dark', label: 'Dark' }
];

const DEFAULT_DARK_BG: BgBase = 'dark';
const DEFAULT_LIGHT_BG: BgBase = 'paper';

const BG_L: Record<BgBase, number> = {
	pitch: 0.07,
	dark: 0.12,
	dim: 0.2,
	stone: 0.9,
	paper: 0.97
};

/** 8 curated hues that look great across all background bases */
export const ACCENT_PRESETS: { name: string; hue: number }[] = [
	{ name: 'Slate', hue: 220 },
	{ name: 'Indigo', hue: 260 },
	{ name: 'Violet', hue: 290 },
	{ name: 'Teal', hue: 185 },
	{ name: 'Sage', hue: 150 },
	{ name: 'Amber', hue: 65 },
	{ name: 'Rose', hue: 350 },
	{ name: 'Crimson', hue: 15 }
];

const RADIUS_SCALES = { sharp: true, rounded: true, pill: true };

export const SURFACE_OPTIONS: { value: SurfaceEffect; label: string }[] = [
	{ value: 'none', label: 'None' },
	{ value: 'tinted', label: 'Tinted' },
	{ value: 'glass', label: 'Glass' }
];

// ─── localStorage keys ────────────────────────────────────────────────────────

const LS = {
	accentHue: 'redthread:theme:accentHue',
	bgBase: 'redthread:theme:bgBase',
	radius: 'redthread:theme:radius',
	surface: 'redthread:theme:surface',
	/** @deprecated replaced by `surface`; still read for migration */
	blur: 'redthread:theme:blur',
	colorScheme: 'redthread:theme:colorScheme'
} as const;

function parseSurface(raw: unknown): SurfaceEffect | null {
	if (raw === 'subtle') return 'tinted';
	if (raw === 'none' || raw === 'tinted' || raw === 'glass') return raw;
	return null;
}

const prefersDarkMq =
	typeof window === 'undefined'
		? null
		: new MediaQuery('prefers-color-scheme: dark', window.matchMedia('(prefers-color-scheme: dark)').matches);

export function systemPrefersDark(): boolean {
	return prefersDarkMq?.current ?? true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function oklch(l: number, c: number, h: number, a?: number): string {
	const base = `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)}`;
	return a == null ? `${base})` : `${base} / ${a.toFixed(3)})`;
}

function readFromStorage(): ThemePreferences {
	try {
	if (typeof localStorage === 'undefined') return { ...DEFAULTS };

	const rawHue = localStorage.getItem(LS.accentHue);
	const rawBg = localStorage.getItem(LS.bgBase) as BgBase | null;
	const rawRadius = localStorage.getItem(LS.radius) as RadiusScale | null;
	const rawScheme = localStorage.getItem(LS.colorScheme) as ColorScheme | null;
	const surface =
		parseSurface(localStorage.getItem(LS.surface)) ??
		parseSurface(localStorage.getItem(LS.blur)) ??
		DEFAULTS.surface;

	const hue = rawHue ? Number(rawHue) : DEFAULTS.accentHue;

	return {
		accentHue: !Number.isFinite(hue) ? DEFAULTS.accentHue : Math.max(0, Math.min(360, hue)),
		bgBase: rawBg && Object.hasOwn(BG_L, rawBg) ? rawBg : DEFAULTS.bgBase,
		radius: rawRadius && Object.hasOwn(RADIUS_SCALES, rawRadius) ? rawRadius : DEFAULTS.radius,
		surface,
		colorScheme: rawScheme && Object.hasOwn(COLOR_SCHEMES, rawScheme) ? rawScheme : DEFAULTS.colorScheme
	};
	} catch { return { ...DEFAULTS }; }
}

function schemeIsDark(scheme: ColorScheme): boolean {
	if (scheme === 'light') return false;
	if (scheme === 'dark') return true;
	return systemPrefersDark();
}

export function resolveColorScheme(p: ThemePreferences = prefs): 'light' | 'dark' {
	return schemeIsDark(p.colorScheme) ? 'dark' : 'light';
}

export function resolveBgBase(p: ThemePreferences = prefs): BgBase {
	const wantDark = schemeIsDark(p.colorScheme);
	const storedDark = BG_L[p.bgBase] < 0.5;
	if (wantDark) return storedDark ? p.bgBase : DEFAULT_DARK_BG;
	return storedDark ? DEFAULT_LIGHT_BG : p.bgBase;
}

/**
 * Select the same CSS palette used by the pre-hydration appearance bootstrap.
 */
export function applyTheme(p: ThemePreferences): void {
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	const bg = resolveBgBase(p);
	const dark = BG_L[bg] < 0.5;
	root.dataset.themeBg = bg;
	root.dataset.radius = p.radius;
	root.dataset.surface = p.surface;
	root.style.setProperty('--accent-hue', String(p.accentHue));
	root.classList.toggle('dark', dark);
	root.style.colorScheme = dark ? 'dark' : 'light';
}

function persistTheme(prefs: ThemePreferences): void {
	try {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(LS.accentHue, String(prefs.accentHue));
	localStorage.setItem(LS.bgBase, prefs.bgBase);
	localStorage.setItem(LS.radius, prefs.radius);
	localStorage.setItem(LS.surface, prefs.surface);
	localStorage.setItem(LS.colorScheme, prefs.colorScheme);
	} catch { /* In-memory appearance still works when storage is blocked. */ }
}

// ─── Reactive store ───────────────────────────────────────────────────────────

function getInitialPrefs(): ThemePreferences {
	try {
  const initial = typeof document !== 'undefined' && document.documentElement.dataset.themePreferences;
  if (initial) return JSON.parse(initial) as ThemePreferences;
	} catch { /* Fall back to locally saved preferences. */ }
	if (typeof localStorage === 'undefined') return { ...DEFAULTS };
	return readFromStorage();
}

let prefs = $state<ThemePreferences>(getInitialPrefs());

/** The reactive preferences object. Read any property to track it in $effect / $derived. */
export { prefs as themePrefs };

/** True when the resolved appearance (system or override) is a dark variant */
export function isDark(): boolean {
	return BG_L[resolveBgBase()] < 0.5;
}

/** Read a live CSS custom property from :root (post-applyTheme). */
function readCssVar(name: string, fallback = ''): string {
	if (typeof document === 'undefined') return fallback;
	const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return v || fallback;
}

/**
 * Resolve any CSS color (incl. oklch / var()) to rgb()/rgba() for Leaflet SVG fills,
 * which are unreliable with modern color functions in some browsers.
 */
function resolveCssColor(cssColor: string, fallback = '#3b82f6'): string {
	if (typeof document === 'undefined' || !cssColor) return fallback;
	const probe = document.createElement('span');
	probe.style.color = cssColor;
	probe.style.position = 'absolute';
	probe.style.pointerEvents = 'none';
	probe.style.opacity = '0';
	document.documentElement.appendChild(probe);
	const resolved = getComputedStyle(probe).color;
	probe.remove();
	return resolved && resolved !== 'rgba(0, 0, 0, 0)' ? resolved : fallback;
}

/** Marker / stroke / result colors for Leaflet overlays (rgb, matching UI primary). */
export function mapColors() {
	const markerRaw = readCssVar('--map-marker', readCssVar('--primary', '#3b82f6'));
	const strokeRaw = readCssVar('--map-marker-stroke', markerRaw);
	const resultRaw = readCssVar('--map-result', markerRaw);
	const linkRaw = readCssVar('--primary', markerRaw);
	const mutedRaw = readCssVar('--muted-foreground', '#888888');
	const fgRaw = readCssVar('--foreground', '#111111');
	const cardRaw = readCssVar('--card', '#ffffff');
	return {
		marker: resolveCssColor(markerRaw, '#3b82f6'),
		stroke: resolveCssColor(strokeRaw, '#1d4ed8'),
		result: resolveCssColor(resultRaw, '#3b82f6'),
		link: resolveCssColor(linkRaw, '#3b82f6'),
		muted: resolveCssColor(mutedRaw, '#888888'),
		fg: resolveCssColor(fgRaw, '#111111'),
		card: resolveCssColor(cardRaw, '#ffffff')
	};
}

/** Distinct layer colors derived from the current accent hue (rgb for Leaflet). */
export function mapLayerPalette(count = 8): string[] {
	const hue = prefs.accentHue;
	const dark = isDark();
	const l = dark ? 0.72 : 0.52;
	const c = 0.16;
	return Array.from({ length: count }, (_, i) =>
		resolveCssColor(oklch(l, c, (hue + i * 45) % 360), '#3b82f6')
	);
}

/**
 * Update a single preference, apply it to the DOM, and persist to localStorage.
 */
export function setPreference<K extends keyof ThemePreferences>(
	key: K,
	value: ThemePreferences[K]
): void {
	prefs[key] = value;
	persistTheme(prefs);
	applyTheme(prefs);
}

// ─── Supabase sync (browser client — works with static + node demo builds) ────

export async function pushThemeToSupabase(): Promise<void> {
	try {
		const { createClient } = await import("$lib/supabase/client");
		const supabase = createClient();
		const { error } = await supabase.auth.updateUser({
			data: { theme_preferences: { ...prefs } },
		});
		if (error) {
			console.warn("[theme] pushThemeToSupabase failed:", error.message);
		}
	} catch (e) {
		console.warn("[theme] pushThemeToSupabase failed:", e);
	}
}

export async function pullThemeFromSupabase(): Promise<void> {
	try {
		const { createClient } = await import("$lib/supabase/client");
		const supabase = createClient();
		const {
			data: { user },
			error,
		} = await supabase.auth.getUser();
		if (error || !user) return;

		const remote = user.user_metadata?.theme_preferences as
			| (Partial<ThemePreferences> & { blur?: unknown })
			| undefined;
		if (!remote || typeof remote !== "object") return;

        applyRemoteTheme(remote);
	} catch (e) {
		console.warn("[theme] pullThemeFromSupabase failed:", e);
	}
}

/** Apply an account snapshot once, so consumers never see intermediate preferences. */
export function applyRemoteTheme(remote: Partial<ThemePreferences> & { blur?: unknown }): void {
	const next = { ...prefs };
	if (typeof remote.accentHue === 'number' && Number.isFinite(remote.accentHue)) next.accentHue = Math.max(0, Math.min(360, remote.accentHue));
	if (remote.bgBase && Object.hasOwn(BG_L, remote.bgBase)) next.bgBase = remote.bgBase;
	if (remote.radius && Object.hasOwn(RADIUS_SCALES, remote.radius)) next.radius = remote.radius;
	if (remote.colorScheme && Object.hasOwn(COLOR_SCHEMES, remote.colorScheme)) next.colorScheme = remote.colorScheme;
	next.surface = parseSurface(remote.surface) ?? parseSurface(remote.blur) ?? next.surface;
	Object.assign(prefs, next);
	persistTheme(prefs);
	applyTheme(prefs);
}
