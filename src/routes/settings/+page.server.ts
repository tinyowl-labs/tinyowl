import type { PageServerLoad, Actions } from "./$types";
import { redirect } from "@sveltejs/kit";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const load: PageServerLoad = async ({ locals, fetch }) => {
  const { user } = await locals.getSession();
  if (!user) {
    throw redirect(303, "/auth/login");
  }

  const accessToken = await locals.getAccessToken();
  if (!accessToken) {
    return {
      user,
      qfieldAccounts: [],
      qfieldLinks: [],
      cliTokens: [],
    };
  }

  const headers = { Authorization: `Bearer ${accessToken}` };

  let qfieldAccounts: {
    id: string;
    base_url: string;
    username: string;
    label?: string | null;
    expires_at?: string | null;
    created_at?: string | null;
  }[] = [];
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/integrations/qfieldcloud/accounts`,
      { headers },
    );
    if (res.ok) qfieldAccounts = await res.json();
  } catch (_) {}

  let qfieldLinks: {
    tinyowl_slug: string;
    account_id: string;
    qfc_project_id: string;
    qfc_project_name?: string | null;
    last_synced_at?: string | null;
    base_url: string;
    username: string;
  }[] = [];
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/integrations/qfieldcloud/links`,
      { headers },
    );
    if (res.ok) qfieldLinks = await res.json();
  } catch (_) {}

  let cliTokens: {
    id: string;
    label: string;
    token_prefix: string;
    created_at: string;
    expires_at?: string | null;
    last_used_at?: string | null;
  }[] = [];
  try {
    const res = await fetch(`${TINYOWL_CORE_URL}/api/auth/cli-token`, {
      headers,
    });
    if (res.ok) cliTokens = await res.json();
  } catch (_) {}

  return { user, qfieldAccounts, qfieldLinks, cliTokens };
};

export const actions: Actions = {
  connectQFieldCloud: async ({ request, locals, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in", qfieldAction: "connect" };

    const data = await request.formData();
    const baseUrl = String(data.get("base_url") ?? "").trim();
    const username = String(data.get("username") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const label = String(data.get("label") ?? "").trim();
    if (!baseUrl || !username || !password) {
      return {
        error: "URL, username, and password are required.",
        qfieldAction: "connect",
      };
    }

    const accessToken = await locals.getAccessToken();
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/integrations/qfieldcloud/connect`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          base_url: baseUrl,
          username,
          password,
          label: label || undefined,
        }),
      },
    );
    if (!res.ok) {
      return {
        error: `Failed: ${await res.text()}`,
        qfieldAction: "connect",
      };
    }
    return { success: true, qfieldAction: "connected" };
  },

  disconnectQFieldCloud: async ({ request, locals, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in", qfieldAction: "disconnect" };

    const data = await request.formData();
    const id = String(data.get("account_id") ?? "").trim();
    if (!id) {
      return { error: "Account required.", qfieldAction: "disconnect" };
    }

    const accessToken = await locals.getAccessToken();
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/integrations/qfieldcloud/accounts/${id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!res.ok) {
      return {
        error: `Failed: ${await res.text()}`,
        qfieldAction: "disconnect",
      };
    }
    return { success: true, qfieldAction: "disconnected" };
  },
};
