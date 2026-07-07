import type { PageServerLoad, Actions } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

type Member = { user_id: string; email: string; role: string };
type Mapping = {
  entity_type: string;
  column_name: string;
  local_value: string;
  concept_uri: string | null;
  vocabulary: string | null;
  crm_property: string | null;
  crm_range: string | null;
  confidence: number;
  source: string;
  entity_count: number;
};

export const load: PageServerLoad = async ({ locals, params, fetch }) => {
  const { user } = await locals.getSession();
  if (!user) return { user: null, members: [], mappings: [] };

  const slug = params.project;
  const accessToken = await locals.getAccessToken();

  let role = "viewer";
  let members: Member[] = [];

  try {
    const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const projects: { slug: string; role: string }[] = await res.json();
      const member = projects.find((p) => p.slug === slug);
      if (member) role = member.role;
    }
  } catch (_) {}

  // Fetch members
  if (role !== "viewer") {
    try {
      const res = await fetch(
        `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/members`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (res.ok) members = await res.json();
    } catch (_) {}
  }

  // Fetch mappings (empty org means single-org mode)
  let mappings: Mapping[] = [];
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1///${slug}/column-mappings`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (res.ok) mappings = await res.json();
  } catch (_) {}

  // Fetch tables for visibility settings
  let tables: Record<string, string[]> = {};
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/tables`,
    );
    if (res.ok) {
      const data = await res.json();
      tables = data.tables ?? {};
    }
  } catch (_) {}

  return {
    user,
    role,
    members,
    mappings,
    tables,
    currentUserId: user?.id ?? "",
  };
};

export const actions: Actions = {
  addMember: async ({ request, locals, params, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in" };

    const data = await request.formData();
    const email = String(data.get("email") ?? "").trim();
    const role = String(data.get("role") ?? "viewer").trim();
    if (!email) return { error: "Email is required." };

    const slug = params.project;
    const accessToken = await locals.getAccessToken();
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/members`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ email, role }),
      },
    );
    if (!res.ok) return { error: `Failed: ${await res.text()}` };
    return { success: true, memberAction: "added" };
  },

  updateRole: async ({ request, locals, params, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in" };

    const data = await request.formData();
    const userId = String(data.get("userId") ?? "").trim();
    const role = String(data.get("role") ?? "").trim();
    if (!userId || !role) return { error: "User and role required." };

    const slug = params.project;
    const accessToken = await locals.getAccessToken();
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/members/${userId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ role }),
      },
    );
    if (!res.ok) return { error: `Failed: ${await res.text()}` };
    return { success: true, memberAction: "updated" };
  },

  removeMember: async ({ request, locals, params, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in" };

    const data = await request.formData();
    const userId = String(data.get("userId") ?? "").trim();
    if (!userId) return { error: "User ID required." };

    const slug = params.project;
    const accessToken = await locals.getAccessToken();
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/members/${userId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!res.ok) return { error: `Failed: ${await res.text()}` };
    return { success: true, memberAction: "removed" };
  },

  updateMapping: async ({ request, locals, params, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in" };

    const data = await request.formData();
    const entityType = String(data.get("entity_type") ?? "").trim();
    const columnName = String(data.get("column_name") ?? "").trim();
    const localValue = String(data.get("local_value") ?? "").trim();
    const conceptUri = String(data.get("concept_uri") ?? "").trim() || null;

    if (!entityType || !columnName || !localValue) {
      return { error: "Missing required fields." };
    }

    const slug = params.project;
    const accessToken = await locals.getAccessToken();

    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1///${slug}/column-mappings`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          entity_type: entityType,
          column_name: columnName,
          local_value: localValue,
          concept_uri: conceptUri || undefined,
        }),
      },
    );
    if (!res.ok) return { error: `Failed: ${await res.text()}` };
    return { success: true, mappingAction: "updated" };
  },

  updateVisibility: async ({ request, locals, params, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in" };

    const data = await request.formData();
    const visibility = String(data.get("visibility") ?? "").trim();
    const tableName = String(data.get("table_name") ?? "").trim();

    const slug = params.project;
    const accessToken = await locals.getAccessToken();

    const body: Record<string, unknown> = {};
    if (tableName) {
      body.table_visibility = { [tableName]: visibility };
    } else {
      body.visibility = visibility;
    }

    const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects/${slug}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { error: `Failed: ${await res.text()}` };
    return { success: true, visibilityAction: "updated" };
  },

  updateLicence: async ({ request, locals, params, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in" };

    const data = await request.formData();
    const licence = String(data.get("licence") ?? "").trim();

    const slug = params.project;
    const accessToken = await locals.getAccessToken();

    const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects/${slug}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        licence: licence === "" ? null : licence,
      }),
    });
    if (!res.ok) return { error: `Failed: ${await res.text()}` };
    return { success: true, licenceAction: "updated" };
  },
};
