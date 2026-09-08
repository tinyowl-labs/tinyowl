import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

const BG_BASES = new Set(["pitch", "dark", "dim", "stone", "paper"]);
const RADII = new Set(["sharp", "rounded", "pill"]);
const SURFACES = new Set(["none", "tinted", "glass"]);
const COLOR_SCHEMES = new Set(["system", "light", "dark"]);

function parseSurface(raw: unknown): string | null {
  if (raw === "subtle") return "tinted";
  if (typeof raw === "string" && SURFACES.has(raw)) return raw;
  return null;
}

function sanitizeTheme(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (typeof src.accentHue === "number" && Number.isFinite(src.accentHue)) {
    out.accentHue = Math.max(0, Math.min(360, src.accentHue));
  }
  if (typeof src.bgBase === "string" && BG_BASES.has(src.bgBase)) {
    out.bgBase = src.bgBase;
  }
  if (typeof src.radius === "string" && RADII.has(src.radius)) {
    out.radius = src.radius;
  }
  const surface = parseSurface(src.surface) ?? parseSurface(src.blur);
  if (surface) {
    out.surface = surface;
  }
  if (typeof src.colorScheme === "string" && COLOR_SCHEMES.has(src.colorScheme)) {
    out.colorScheme = src.colorScheme;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export const GET: RequestHandler = async ({ locals }) => {
  const {
    data: { user },
    error: authErr,
  } = await locals.supabase.auth.getUser();
  if (authErr || !user) {
    throw error(401, "Not signed in");
  }
  const themePreferences =
    sanitizeTheme(user.user_metadata?.theme_preferences) ?? {};
  return json({ themePreferences });
};

export const PUT: RequestHandler = async ({ locals, request }) => {
  const {
    data: { user },
    error: authErr,
  } = await locals.supabase.auth.getUser();
  if (authErr || !user) {
    throw error(401, "Not signed in");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw error(400, "Invalid JSON");
  }

  const themePreferences = sanitizeTheme(
    (body as { themePreferences?: unknown })?.themePreferences ?? body,
  );
  if (!themePreferences) {
    throw error(400, "Invalid theme preferences");
  }

  const { error: updateErr } = await locals.supabase.auth.updateUser({
    data: { theme_preferences: themePreferences },
  });
  if (updateErr) {
    throw error(500, updateErr.message);
  }
  return json({ themePreferences });
};
