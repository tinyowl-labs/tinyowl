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

export function applyTheme(prefs: ThemePreferences): void {
	if (typeof document === 'undefined') return;

	const root = document.documentElement;
	const bgL = BG_L[prefs.bgBase];
	const isDark = bgL < 0.5;
	const fgL = isDark ? 0.95 : 0.1;
	const radii = RADIUS_VALUES[prefs.radius];
	const blurs = BLUR_VALUES[prefs.blur];

	root.style.setProperty('--accent-hue', String(prefs.accentHue));
	root.style.setProperty('--bg-l', String(bgL));
	root.style.setProperty('--fg-l', String(fgL));
	root.style.setProperty('--blur-panel', blurs.panel);
	root.style.setProperty('--blur-dock', blurs.dock);
	root.style.setProperty('--blur-overlay', blurs.overlay);
	root.style.setProperty('--panel-bg-opacity', blurs.panelOpacity);
	root.style.setProperty('--dock-bg-opacity', blurs.dockOpacity);
	root.style.setProperty('--overlay-bg-opacity', blurs.overlayOpacity);
	root.style.setProperty('--radius-xs', radii.xs);
	root.style.setProperty('--radius-sm', radii.sm);
	root.style.setProperty('--radius-md', radii.md);
	root.style.setProperty('--radius-lg', radii.lg);
	root.style.setProperty('--radius-xl', radii.xl);

	// Keep the dark class in sync so existing dark: Tailwind variants still work
	// during the Phase 2 component migration
	root.classList.toggle('dark', isDark);
}

function persistTheme(prefs: ThemePreferences): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(LS.accentHue, String(prefs.accentHue));
	localStorage.setItem(LS.bgBase, prefs.bgBase);
	localStorage.setItem(LS.radius, prefs.radius);
	localStorage.setItem(LS.blur, prefs.blur);
}

// ─── Reactive store ───────────────────────────────────────────────────────────

// Initialise directly from localStorage when the module loads in the browser.
// On the server (SSR) localStorage is undefined so we fall back to DEFAULTS.
// This means prefs are correct before any $effect or onMount runs, which
// prevents HMR / hot-reload from clobbering persisted values.
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

/**
 * Update a single preference, apply it to the DOM, and persist to localStorage.
 * This is the only place persistTheme should be called.
 *
 * Note: to also sync to Supabase after a batch of changes, call
 * `pushThemeToSupabase()` explicitly — it is intentionally NOT called here
 * to avoid per-keypress network traffic and infinite-loop risks.
 */
export function setPreference<K extends keyof ThemePreferences>(
	key: K,
	value: ThemePreferences[K]
): void {
	prefs[key] = value;
	persistTheme(prefs);
}

// ─── Supabase sync ────────────────────────────────────────────────────────────

/**
 * Pull theme preferences FROM Supabase and apply them, overriding both the
 * reactive store and localStorage.  Call this on login / session restore.
 * Fails silently on network errors or when the user is not authenticated
 * (401 / 403 responses are ignored).
 */
export async function pullThemeFromSupabase(): Promise<void> {
	try {
		const response = await fetch('/api/user-preferences/theme');
		if (!response.ok) return; // 401/403/5xx — not signed in or server error

		const payload = (await response.json()) as {
			themePreferences?: Partial<ThemePreferences>;
		};
		const remote = payload?.themePreferences;
		if (!remote || typeof remote !== 'object') return;

		// Validate and apply each key via setPreference so localStorage is kept
		// in sync as well (setPreference calls persistTheme internally).
		if (typeof remote.accentHue === 'number') {
			setPreference('accentHue', Math.max(0, Math.min(360, remote.accentHue)));
		}
		if (remote.bgBase && remote.bgBase in BG_L) {
			setPreference('bgBase', remote.bgBase);
		}
		if (remote.radius && remote.radius in RADIUS_VALUES) {
			setPreference('radius', remote.radius);
		}
		if (remote.blur && remote.blur in BLUR_VALUES) {
			setPreference('blur', remote.blur);
		}

		// Explicitly apply CSS vars in case we're running outside a reactive
		// $effect (e.g. the very first onMount before the effect has scheduled).
		applyTheme(prefs);
	} catch (e) {
		console.warn('[theme] pullThemeFromSupabase failed:', e);
	}
}
