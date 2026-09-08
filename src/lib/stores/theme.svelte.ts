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
	radius: 'rounded',
	surface: 'glass',
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

const RADIUS_VALUES: Record<RadiusScale, Record<string, string>> = {
	sharp: { xs: '0px', sm: '1px', md: '2px', lg: '3px', xl: '4px' },
	rounded: { xs: '2px', sm: '4px', md: '6px', lg: '8px', xl: '12px' },
	pill: { xs: '4px', sm: '8px', md: '12px', lg: '20px', xl: '32px' }
};

export const SURFACE_OPTIONS: { value: SurfaceEffect; label: string }[] = [
	{ value: 'none', label: 'None' },
	{ value: 'tinted', label: 'Tinted' },
	{ value: 'glass', label: 'Glass' }
];

function surfaceCss(
	mode: SurfaceEffect,
	isDarkMode: boolean,
	cardSolid: string
): { fill: string; filter: string; sheen: string } {
	if (mode === 'none') {
		return { fill: cardSolid, filter: 'none', sheen: 'none' };
	}
	if (mode === 'tinted') {
		return {
			fill: 'color-mix(in oklab, color-mix(in oklab, var(--background) 94%, var(--selected) 6%) 92%, transparent)',
			filter: 'none',
			sheen: 'none'
		};
	}
	// Clear glass: readable pane + sheen + optical saturate. No spatial blur (that is frost).
	return {
		fill: isDarkMode ? 'oklch(0.24 0 0 / 0.52)' : 'oklch(0.995 0 0 / 0.50)',
		filter: isDarkMode
			? 'saturate(1.9) brightness(1.16)'
			: 'saturate(1.5) brightness(1.05)',
		sheen: isDarkMode
			? 'linear-gradient(165deg, rgb(255 255 255 / 0.26) 0%, rgb(255 255 255 / 0.06) 34%, transparent 70%)'
			: 'linear-gradient(165deg, rgb(255 255 255 / 0.78) 0%, rgb(255 255 255 / 0.2) 40%, transparent 72%)'
	};
}

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
		: new MediaQuery('prefers-color-scheme: dark', true);

export function systemPrefersDark(): boolean {
	return prefersDarkMq?.current ?? true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function oklch(l: number, c: number, h: number, a?: number): string {
	const base = `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)}`;
	return a == null ? `${base})` : `${base} / ${a.toFixed(3)})`;
}

function readFromStorage(): ThemePreferences {
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
		accentHue: isNaN(hue) ? DEFAULTS.accentHue : Math.max(0, Math.min(360, hue)),
		bgBase: rawBg && rawBg in BG_L ? rawBg : DEFAULTS.bgBase,
		radius: rawRadius && rawRadius in RADIUS_VALUES ? rawRadius : DEFAULTS.radius,
		surface,
		colorScheme: rawScheme && rawScheme in COLOR_SCHEMES ? rawScheme : DEFAULTS.colorScheme
	};
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
 * Push theme preferences into CSS custom properties consumed by app.css / Tailwind.
 * This is what makes Appearance settings affect the whole UI.
 */
export function applyTheme(p: ThemePreferences): void {
	if (typeof document === 'undefined') return;

	const root = document.documentElement;
	const bgBase = resolveBgBase(p);
	const bgL = BG_L[bgBase];
	const isDarkMode = bgL < 0.5;
	const hue = p.accentHue;
	const radii = RADIUS_VALUES[p.radius];

	const fgL = isDarkMode ? 0.95 : 0.12;
	// Neutrals stay achromatic — hue is highlight-only.
	const mutedL = isDarkMode ? Math.min(bgL + 0.07, 0.28) : Math.max(bgL - 0.05, 0.88);
	const secondaryL = isDarkMode ? Math.min(bgL + 0.05, 0.24) : Math.max(bgL - 0.035, 0.9);
	const borderL = isDarkMode ? Math.min(bgL + 0.1, 0.32) : Math.max(bgL - 0.1, 0.78);
	// Everyday accent is quiet; --selected is the full hue for chosen items.
	const primaryL = isDarkMode ? 0.72 : 0.46;
	const primaryC = 0.08;
	const selectedL = isDarkMode ? 0.68 : 0.5;
	const selectedC = 0.17;
	const destructiveL = isDarkMode ? 0.55 : 0.5;

	const background = oklch(bgL, 0, 0);
	const foreground = oklch(fgL, 0, 0);
	const cardSolid = oklch(isDarkMode ? Math.min(bgL + 0.025, 0.2) : bgL, 0, 0);
	const secondary = oklch(secondaryL, 0, 0);
	const muted = oklch(mutedL, 0, 0);
	const mutedFg = oklch(isDarkMode ? 0.68 : 0.42, 0, 0);
	const border = oklch(borderL, 0, 0);
	const primary = oklch(primaryL, primaryC, hue);
	const primaryFg = oklch(isDarkMode ? 0.98 : 0.99, 0, 0);
	const selected = oklch(selectedL, selectedC, hue);
	const selectedFg = oklch(isDarkMode ? 0.98 : 0.99, 0, 0);
	const accent = oklch(isDarkMode ? Math.min(bgL + 0.08, 0.3) : Math.max(bgL - 0.06, 0.86), 0, 0);
	const ring = primary;
	const destructive = oklch(destructiveL, 0.19, 25);
	const destructiveFg = oklch(0.98, 0.01, 25);
	const surface = surfaceCss(p.surface, isDarkMode, cardSolid);

	root.style.setProperty('--accent-hue', String(hue));
	root.style.setProperty('--bg-l', String(bgL));
	root.style.setProperty('--fg-l', String(fgL));

	root.style.setProperty('--background', background);
	root.style.setProperty('--foreground', foreground);
	root.style.setProperty('--card-solid', cardSolid);
	root.style.setProperty('--surface-fill', surface.fill);
	root.style.setProperty('--surface-filter', surface.filter);
	root.style.setProperty('--surface-sheen', surface.sheen);
	// Content cards stay achromatic. Overlay chrome reads --surface-fill via .surface.
	root.style.setProperty('--card', cardSolid);
	root.style.setProperty('--card-foreground', foreground);
	root.style.setProperty('--popover', cardSolid);
	root.style.setProperty('--popover-foreground', foreground);
	root.style.setProperty('--primary', primary);
	root.style.setProperty('--primary-foreground', primaryFg);
	root.style.setProperty('--selected', selected);
	root.style.setProperty('--selected-foreground', selectedFg);
	root.style.setProperty('--secondary', secondary);
	root.style.setProperty('--secondary-foreground', foreground);
	root.style.setProperty('--muted', muted);
	root.style.setProperty('--muted-foreground', mutedFg);
	root.style.setProperty('--accent', accent);
	root.style.setProperty('--accent-foreground', foreground);
	root.style.setProperty('--destructive', destructive);
	root.style.setProperty('--destructive-foreground', destructiveFg);
	root.style.setProperty('--border', border);
	root.style.setProperty('--input', border);
	root.style.setProperty('--ring', ring);

	// Map pins use the full selected hue, not the quiet everyday accent.
	root.style.setProperty('--map-marker', selected);
	root.style.setProperty(
		'--map-marker-stroke',
		oklch(
			isDarkMode ? Math.max(selectedL - 0.12, 0.45) : Math.min(selectedL + 0.08, 0.4),
			selectedC,
			hue
		)
	);
	root.style.setProperty(
		'--map-result',
		oklch(
			isDarkMode ? Math.min(selectedL + 0.08, 0.82) : Math.max(selectedL - 0.06, 0.38),
			selectedC * 0.95,
			hue
		)
	);

	root.dataset.surface = p.surface;
	root.dataset.radius = p.radius;

	root.style.setProperty('--theme-radius-xs', radii.xs);
	root.style.setProperty('--theme-radius-sm', radii.sm);
	root.style.setProperty('--theme-radius-md', radii.md);
	root.style.setProperty('--theme-radius-lg', radii.lg);
	root.style.setProperty('--theme-radius-xl', radii.xl);

	// Keep aliases used by some components (e.g. button rounded-[min(var(--radius-md),…)])
	root.style.setProperty('--radius-xs', radii.xs);
	root.style.setProperty('--radius-sm', radii.sm);
	root.style.setProperty('--radius-md', radii.md);
	root.style.setProperty('--radius-lg', radii.lg);
	root.style.setProperty('--radius-xl', radii.xl);

	root.classList.toggle('dark', isDarkMode);
	root.style.colorScheme = isDarkMode ? 'dark' : 'light';
}

function persistTheme(prefs: ThemePreferences): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(LS.accentHue, String(prefs.accentHue));
	localStorage.setItem(LS.bgBase, prefs.bgBase);
	localStorage.setItem(LS.radius, prefs.radius);
	localStorage.setItem(LS.surface, prefs.surface);
	localStorage.setItem(LS.colorScheme, prefs.colorScheme);
}

// ─── Reactive store ───────────────────────────────────────────────────────────

function getInitialPrefs(): ThemePreferences {
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

		if (typeof remote.accentHue === "number") {
			setPreference("accentHue", Math.max(0, Math.min(360, remote.accentHue)));
		}
		if (remote.bgBase && remote.bgBase in BG_L) {
			setPreference("bgBase", remote.bgBase);
		}
		if (remote.radius && remote.radius in RADIUS_VALUES) {
			setPreference("radius", remote.radius);
		}
		const surface = parseSurface(remote.surface) ?? parseSurface(remote.blur);
		if (surface) {
			setPreference("surface", surface);
		}
		if (remote.colorScheme && remote.colorScheme in COLOR_SCHEMES) {
			setPreference("colorScheme", remote.colorScheme);
		}

		applyTheme(prefs);
	} catch (e) {
		console.warn("[theme] pullThemeFromSupabase failed:", e);
	}
}
