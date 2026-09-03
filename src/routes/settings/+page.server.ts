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
      hasAvatar: false,
      qfieldAccounts: [],
      qfieldLinks: [],
      ocLinks: [],
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
    mode?: string | null;
    import_status?: string | null;
  }[] = [];
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/integrations/qfieldcloud/links`,
      { headers },
    );
    if (res.ok) qfieldLinks = await res.json();
    } catch (_) {}

  let ocLinks: {
    tinyowl_slug: string;
    oc_uuid: string;
    oc_slug?: string | null;
    oc_label?: string | null;
    oc_uri?: string | null;
    import_status?: string | null;
    import_error?: string | null;
    row_count?: number | null;
    truncated?: boolean;
    job_log?: string | null;
    job_progress?: Record<string, unknown> | null;
  }[] = [];
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/integrations/opencontext/links`,
      { headers },
    );
    if (res.ok) ocLinks = await res.json();
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

  let hasAvatar = false;
  try {
    const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/me`, { headers });
    if (res.ok) {
      const me = (await res.json()) as { has_avatar?: boolean };
      hasAvatar = Boolean(me.has_avatar);
    }
  } catch (_) {}

  return { user, hasAvatar, qfieldAccounts, qfieldLinks, ocLinks, cliTokens };
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

  publishFromQField: async ({ request, locals, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in", qfieldAction: "publish" };

    const data = await request.formData();
    const accountId = String(data.get("account_id") ?? "").trim();
    const qfcProjectId = String(data.get("qfc_project_id") ?? "").trim();
    const qfcProjectName = String(data.get("qfc_project_name") ?? "").trim();
    const org = String(data.get("org") ?? "").trim();
    const slug = String(data.get("slug") ?? "").trim();
    const title = String(data.get("title") ?? "").trim();
    const gpkgName = String(data.get("gpkg_name") ?? "").trim();
    const mode = String(data.get("mode") ?? "").trim();
    if (!accountId || !qfcProjectId) {
      return {
        error: "Account and QFieldCloud project required.",
        qfieldAction: "publish",
      };
    }

    const accessToken = await locals.getAccessToken();
    const body: Record<string, string> = {
      account_id: accountId,
      qfc_project_id: qfcProjectId,
    };
    if (qfcProjectName) body.qfc_project_name = qfcProjectName;
    if (org) body.org = org;
    if (slug) body.slug = slug;
    if (title) body.title = title;
    if (gpkgName) body.gpkg_name = gpkgName;
    if (mode === "snapshot") body.mode = "snapshot";

    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/integrations/qfieldcloud/publish`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      return {
        error: `Publish failed: ${await res.text()}`,
        qfieldAction: "publish",
      };
    }
    const created = await res.json();
    return {
      success: true,
      qfieldAction: "published",
      publishedSlug: created.slug,
      publishedUrl: created.url,
      publishedMode: created.mode ?? "live",
      importStatus: created.import_status ?? null,
    };
  },

  publishFromOpenContext: async ({ request, locals, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in", ocAction: "publish" };

    const data = await request.formData();
    const ocUuid = String(data.get("oc_uuid") ?? "").trim();
    const org = String(data.get("org") ?? "").trim();
    const slug = String(data.get("slug") ?? "").trim();
    const title = String(data.get("title") ?? "").trim();
    const maxRows = String(data.get("max_rows") ?? "").trim();
    if (!ocUuid) {
      return { error: "Open Context project required.", ocAction: "publish" };
    }

    const accessToken = await locals.getAccessToken();
    const body: Record<string, string | number> = { oc_uuid: ocUuid };
    if (org) body.org = org;
    if (slug) body.slug = slug;
    if (title) body.title = title;
    if (maxRows) {
      const n = Number(maxRows);
      if (Number.isFinite(n) && n > 0) body.max_rows = n;
    }

    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/integrations/opencontext/publish`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      return {
        error: `Clone failed: ${await res.text()}`,
        ocAction: "publish",
      };
    }
    const created = await res.json();
    return {
      success: true,
      ocAction: "published",
      publishedSlug: created.slug,
      publishedUrl: created.url,
      importStatus: created.import_status ?? null,
    };
  },

  retryOpenContext: async ({ request, locals, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in", ocAction: "retry" };

    const data = await request.formData();
    const slug = String(data.get("slug") ?? "").trim();
    if (!slug) {
      return { error: "Project required.", ocAction: "retry" };
    }

    const accessToken = await locals.getAccessToken();
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${encodeURIComponent(slug)}/opencontext-link/retry`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!res.ok) {
      return {
        error: `Retry failed: ${await res.text()}`,
        ocAction: "retry",
      };
    }
    return {
      success: true,
      ocAction: "retried",
      publishedSlug: slug,
      importStatus: "pending",
    };
  },

  uploadAvatar: async ({ request, locals, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in", accountAction: "avatar" };
    const data = await request.formData();
    const file = data.get("avatar");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Choose an image.", accountAction: "avatar" };
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const token = await locals.getAccessToken();
    const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/me/avatar`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: buf,
    });
    if (!res.ok) {
      return { error: `Avatar: ${await res.text()}`, accountAction: "avatar" };
    }
    return { success: true, accountAction: "avatar" };
  },

  removeAvatar: async ({ locals, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in", accountAction: "avatar-removed" };
    const token = await locals.getAccessToken();
    const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/me/avatar`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { error: `Failed: ${await res.text()}`, accountAction: "avatar-removed" };
    }
    return { success: true, accountAction: "avatar-removed" };
  },
};
