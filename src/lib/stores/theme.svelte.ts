// ─── Types ────────────────────────────────────────────────────────────────────

export type BgBase = 'pitch' | 'dark' | 'dim' | 'stone' | 'paper';
export type RadiusScale = 'sharp' | 'rounded' | 'pill';
export type BlurScale = 'none' | 'subtle' | 'glass';

export interface ThemePreferences {
	accentHue: number;
	bgBase: BgBase;
	radius: RadiusScale;
	blur: BlurScale;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULTS: ThemePreferences = {
	accentHue: 220,
	bgBase: 'dark',
	radius: 'rounded',
	blur: 'glass'
};

export const BG_L: Record<BgBase, number> = {
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

const BLUR_VALUES: Record<
	BlurScale,
	{
		panel: string;
		dock: string;
		overlay: string;
		panelOpacity: string;
		dockOpacity: string;
		overlayOpacity: string;
	}
> = {
	none: {
		panel: 'none',
		dock: 'none',
		overlay: 'none',
		panelOpacity: '1.0',
		dockOpacity: '1.0',
		overlayOpacity: '0.97'
	},
	subtle: {
		panel: 'blur(6px) saturate(1.2)',
		dock: 'blur(8px) saturate(1.3)',
		overlay: 'blur(4px) saturate(1.15)',
		panelOpacity: '0.88',
		dockOpacity: '0.82',
		overlayOpacity: '0.88'
	},
	glass: {
		panel: 'blur(14px) saturate(1.4)',
		dock: 'blur(20px) saturate(1.6)',
		overlay: 'blur(8px) saturate(1.3)',
		panelOpacity: '0.72',
		dockOpacity: '0.65',
		overlayOpacity: '0.75'
	}
};

// ─── localStorage keys ────────────────────────────────────────────────────────

const LS = {
	accentHue: 'redthread:theme:accentHue',
	bgBase: 'redthread:theme:bgBase',
	radius: 'redthread:theme:radius',
	blur: 'redthread:theme:blur'
} as const;

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
	const rawBlur = localStorage.getItem(LS.blur) as BlurScale | null;

	const hue = rawHue ? Number(rawHue) : DEFAULTS.accentHue;

	return {
		accentHue: isNaN(hue) ? DEFAULTS.accentHue : Math.max(0, Math.min(360, hue)),
		bgBase: rawBg && rawBg in BG_L ? rawBg : DEFAULTS.bgBase,
		radius: rawRadius && rawRadius in RADIUS_VALUES ? rawRadius : DEFAULTS.radius,
		blur: rawBlur && rawBlur in BLUR_VALUES ? rawBlur : DEFAULTS.blur
	};
}

/**
 * Push theme preferences into CSS custom properties consumed by app.css / Tailwind.
 * This is what makes Appearance settings affect the whole UI.
 */
export function applyTheme(prefs: ThemePreferences): void {
	if (typeof document === 'undefined') return;

	const root = document.documentElement;
	const bgL = BG_L[prefs.bgBase];
	const isDarkMode = bgL < 0.5;
	const hue = prefs.accentHue;
	const radii = RADIUS_VALUES[prefs.radius];
	const blurs = BLUR_VALUES[prefs.blur];

	const fgL = isDarkMode ? 0.95 : 0.12;
	const bgC = isDarkMode ? 0.012 : 0.008;
	const fgC = isDarkMode ? 0.01 : 0.02;
	const mutedL = isDarkMode ? Math.min(bgL + 0.07, 0.28) : Math.max(bgL - 0.05, 0.88);
	const secondaryL = isDarkMode ? Math.min(bgL + 0.05, 0.24) : Math.max(bgL - 0.035, 0.9);
	const borderL = isDarkMode ? Math.min(bgL + 0.1, 0.32) : Math.max(bgL - 0.1, 0.78);
	const primaryL = isDarkMode ? 0.68 : 0.48;
	const primaryC = 0.17;
	const destructiveL = isDarkMode ? 0.55 : 0.5;

	const background = oklch(bgL, bgC, hue);
	const foreground = oklch(fgL, fgC, hue);
	const card = oklch(isDarkMode ? Math.min(bgL + 0.025, 0.2) : bgL, bgC, hue);
	const secondary = oklch(secondaryL, bgC * 1.2, hue);
	const muted = oklch(mutedL, bgC, hue);
	const mutedFg = oklch(isDarkMode ? 0.68 : 0.42, fgC, hue);
	const border = oklch(borderL, bgC * 1.4, hue);
	const primary = oklch(primaryL, primaryC, hue);
	const primaryFg = oklch(isDarkMode ? 0.98 : 0.99, 0.01, hue);
	const accent = oklch(isDarkMode ? Math.min(bgL + 0.08, 0.3) : Math.max(bgL - 0.06, 0.86), bgC * 1.5, hue);
	const ring = primary;
	const destructive = oklch(destructiveL, 0.19, 25);
	const destructiveFg = oklch(0.98, 0.01, 25);

	root.style.setProperty('--accent-hue', String(hue));
	root.style.setProperty('--bg-l', String(bgL));
	root.style.setProperty('--fg-l', String(fgL));

	root.style.setProperty('--background', background);
	root.style.setProperty('--foreground', foreground);
	root.style.setProperty('--card', card);
	root.style.setProperty('--card-foreground', foreground);
	root.style.setProperty('--popover', card);
	root.style.setProperty('--popover-foreground', foreground);
	root.style.setProperty('--primary', primary);
	root.style.setProperty('--primary-foreground', primaryFg);
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

	// Leaflet overlays — same accent as UI chrome (resolve to rgb for SVG fills)
	root.style.setProperty('--map-marker', primary);
	root.style.setProperty(
		'--map-marker-stroke',
		oklch(
			isDarkMode ? Math.max(primaryL - 0.12, 0.45) : Math.min(primaryL + 0.08, 0.4),
			primaryC,
			hue
		)
	);
	// Result pins: same hue, slightly brighter/dimmer so they stay on-brand
	root.style.setProperty(
		'--map-result',
		oklch(isDarkMode ? Math.min(primaryL + 0.08, 0.82) : Math.max(primaryL - 0.06, 0.38), primaryC * 0.95, hue)
	);

	root.style.setProperty('--blur-panel', blurs.panel);
	root.style.setProperty('--blur-dock', blurs.dock);
	root.style.setProperty('--blur-overlay', blurs.overlay);
	root.style.setProperty('--panel-bg-opacity', blurs.panelOpacity);
	root.style.setProperty('--dock-bg-opacity', blurs.dockOpacity);
	root.style.setProperty('--overlay-bg-opacity', blurs.overlayOpacity);

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
}

function persistTheme(prefs: ThemePreferences): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(LS.accentHue, String(prefs.accentHue));
	localStorage.setItem(LS.bgBase, prefs.bgBase);
	localStorage.setItem(LS.radius, prefs.radius);
	localStorage.setItem(LS.blur, prefs.blur);
}

// ─── Reactive store ───────────────────────────────────────────────────────────

function getInitialPrefs(): ThemePreferences {
	if (typeof localStorage === 'undefined') return { ...DEFAULTS };
	return readFromStorage();
}

let prefs = $state<ThemePreferences>(getInitialPrefs());

/** The reactive preferences object. Read any property to track it in $effect / $derived. */
export { prefs as themePrefs };

/** True when the current background base is a dark variant */
export function isDark(): boolean {
	return BG_L[prefs.bgBase] < 0.5;
}

/** Read a live CSS custom property from :root (post-applyTheme). */
export function readCssVar(name: string, fallback = ''): string {
	if (typeof document === 'undefined') return fallback;
	const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return v || fallback;
}

/**
 * Resolve any CSS color (incl. oklch / var()) to rgb()/rgba() for Leaflet SVG fills,
 * which are unreliable with modern color functions in some browsers.
 */
export function resolveCssColor(cssColor: string, fallback = '#3b82f6'): string {
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
			| Partial<ThemePreferences>
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
		if (remote.blur && remote.blur in BLUR_VALUES) {
			setPreference("blur", remote.blur);
		}

		applyTheme(prefs);
	} catch (e) {
		console.warn("[theme] pullThemeFromSupabase failed:", e);
	}
}
