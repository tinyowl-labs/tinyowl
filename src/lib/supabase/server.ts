import { createServerClient } from "@supabase/ssr";
import type { RequestEvent } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { env as publicEnv } from "$env/dynamic/public";

/** Must match browser client — see client.ts */
const AUTH_COOKIE = "sb-tinyowl-auth-token";

function supabaseUrl(): string {
  // Prefer runtime URL in Docker (host.docker.internal); bake-time Vite URL otherwise.
  // PUBLIC_* is the documented deploy convention; VITE_* is the local dev convention.
  return (
    env.SUPABASE_URL ||
    env.VITE_SUPABASE_URL ||
    publicEnv.PUBLIC_SUPABASE_URL ||
    import.meta.env.VITE_SUPABASE_URL ||
    publicEnv.PUBLIC_SUPABASE_URL ||
    ""
  );
}

function supabaseAnonKey(): string {
  return (
    env.SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    publicEnv.PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    publicEnv.PUBLIC_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    ""
  );
}

/**
 * Server talks to Supabase directly.
 * Cookie name is fixed so Funnel/same-origin browser sessions are visible to SSR.
 */
export function createClient(event: RequestEvent) {
  const isHttps =
    event.url.protocol === "https:" ||
    event.request.headers.get("x-forwarded-proto") === "https";
  return createServerClient(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll: () => event.cookies.getAll(),
        setAll: (cookies) => {
          for (const { name, value, options } of cookies) {
            try {
              event.cookies.set(name, value, {
                ...options,
                path: "/",
                sameSite: options.sameSite ?? "lax",
                secure: isHttps ? (options.secure ?? true) : false,
              });
            } catch {
              // Response already sent; ignore late cookie updates
            }
          }
        },
      },
      cookieOptions: {
        name: AUTH_COOKIE,
        path: "/",
        sameSite: "lax",
        secure: isHttps,
      },
    },
  );
}
