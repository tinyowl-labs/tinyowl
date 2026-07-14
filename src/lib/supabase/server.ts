import { createServerClient } from "@supabase/ssr";
import type { RequestEvent } from "@sveltejs/kit";

export function createClient(event: RequestEvent) {
  const isHttps = event.url.protocol === "https:";
  return createServerClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => event.cookies.getAll(),
        setAll: (cookies) => {
          for (const { name, value, options } of cookies) {
            try {
              // Browsers reject Secure cookies on plain HTTP (e.g. LAN IP dev).
              event.cookies.set(name, value, {
                ...options,
                path: "/",
                secure: isHttps ? (options.secure ?? true) : false,
              });
            } catch {
              // Response already sent; ignore late cookie updates
            }
          }
        },
      },
    },
  );
}
