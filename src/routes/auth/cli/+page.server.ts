import type { Actions, PageServerLoad } from "./$types";
import { fail } from "@sveltejs/kit";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const load: PageServerLoad = async ({ locals }) => {
  const { user } = await locals.getSession();
  return { user };
};

export const actions: Actions = {
  // Browser must not call TINYOWL_CORE_URL (often 127.0.0.1) — that breaks Tailscale.
  // Verify server-side: browser → SvelteKit → API on the host network.
  verify: async ({ request, locals, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) {
      return fail(401, { error: "Not signed in" });
    }
    const accessToken = await locals.getAccessToken();
    if (!accessToken) {
      return fail(401, { error: "No session token" });
    }

    const data = await request.formData();
    const code = String(data.get("code") ?? "")
      .trim()
      .toLowerCase();
    if (code.length < 8) {
      return fail(400, { error: "Enter the 8-character code from the terminal" });
    }

    const res = await fetch(`${TINYOWL_CORE_URL}/auth/cli/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, token: accessToken }),
    });
    if (!res.ok) {
      let msg = "Verification failed";
      try {
        const body = await res.json();
        if (body?.error) msg = String(body.error);
      } catch {
        /* ignore */
      }
      return fail(res.status, { error: msg });
    }
    return { success: true };
  },
};
