import type { PageServerLoad, Actions } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";
import { redirect } from "@sveltejs/kit";

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
  display_label?: string;
  column_type?: string;
  allow_multi?: boolean;
  item?: string;
  references?: string;
  references_value?: string;
};

export const load: PageServerLoad = async ({ locals, params, fetch }) => {
  const { user } = await locals.getSession();
  const slug = params.project;
  if (!user) throw redirect(303, `/${slug}`);

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

  if (role !== "owner" && role !== "admin") {
    throw redirect(303, `/${slug}`);
  }

  // Fetch members (role is owner|admin after the redirect above).
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/members`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (res.ok) members = await res.json();
  } catch (_) {}

  // Fetch mappings (empty org means single-org mode)
  let mappings: Mapping[] = [];
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/value-mappings`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (res.ok) mappings = await res.json();
  } catch (_) {}

  let annotations: {
    entity_type: string;
    column_name: string;
    vocabulary: string | null;
    crm_property: string | null;
    crm_range: string | null;
    source: string;
  }[] = [];
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/column-annotations`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (res.ok) annotations = await res.json();
  } catch (_) {}

  let tables: Record<string, string[]> = {};
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/tables`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (res.ok) {
      const data = await res.json();
      tables = data.tables ?? {};
    }
  } catch (_) {}

  let qfieldLink: {
    tinyowl_slug: string;
    account_id: string;
    qfc_project_id: string;
    qfc_project_name?: string;
    base_url?: string;
    username?: string;
    linked_at?: string;
    last_job_id?: string;
    last_synced_at?: string;
  } | null = null;
  let qfieldAccounts: {
    id: string;
    base_url: string;
    username: string;
    label?: string | null;
  }[] = [];
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/qfieldcloud-link`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (res.ok) {
      const data = await res.json();
      qfieldLink = data ?? null;
    }
  } catch (_) {}
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/integrations/qfieldcloud/accounts`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (res.ok) qfieldAccounts = await res.json();
  } catch (_) {}

  return {
    user,
    role,
    members,
    mappings,
    annotations,
    tables,
    currentUserId: user?.id ?? "",
    qfieldLink,
    qfieldAccounts,
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

  updateAnnotation: async ({ request, locals, params, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in" };

    const data = await request.formData();
    const entityType = String(data.get("entity_type") ?? "").trim();
    const columnName = String(data.get("column_name") ?? "").trim();
    const vocabulary = String(data.get("vocabulary") ?? "").trim() || null;
    const crmProperty = String(data.get("crm_property") ?? "").trim() || null;
    const crmRange = String(data.get("crm_range") ?? "").trim() || null;

    if (!entityType || !columnName) {
      return { error: "Missing required fields." };
    }

    const slug = params.project;
    const accessToken = await locals.getAccessToken();

    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/column-annotations`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          entity_type: entityType,
          column_name: columnName,
          vocabulary,
          crm_property: crmProperty,
          crm_range: crmRange,
        }),
      },
    );
    if (!res.ok) return { error: `Failed: ${await res.text()}` };
    return { success: true, annotationAction: "updated" };
  },

  updateMapping: async ({ request, locals, params, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in" };

    const data = await request.formData();
    const entityType = String(data.get("entity_type") ?? "").trim();
    const columnName = String(data.get("column_name") ?? "").trim();
    const localValue = String(data.get("local_value") ?? "").trim();
    const conceptUri = String(data.get("concept_uri") ?? "").trim() || null;
    const vocabulary = String(data.get("vocabulary") ?? "").trim() || null;
    const confidenceStr = String(data.get("confidence") ?? "");
    const confidence = confidenceStr ? parseFloat(confidenceStr) : undefined;

    if (!entityType || !columnName || !localValue) {
      return { error: "Missing required fields." };
    }

    const slug = params.project;
    const accessToken = await locals.getAccessToken();

    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/value-mappings`,
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
          vocabulary: vocabulary || undefined,
          confidence,
        }),
      },
    );
    if (!res.ok) return { error: `Failed: ${await res.text()}` };
    return { success: true, mappingAction: "updated" };
  },

  bulkMapping: async ({ request, locals, params, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in" };

    const data = await request.formData();
    const localValue = String(data.get("local_value") ?? "").trim();
    const columnName = String(data.get("column_name") ?? "").trim();
    const conceptUri = String(data.get("concept_uri") ?? "").trim();
    const vocabulary = String(data.get("vocabulary") ?? "").trim() || undefined;
    const confidence = parseFloat(String(data.get("confidence") ?? "0.9"));

    if (!localValue || !columnName || !conceptUri) {
      return { error: "Missing required fields." };
    }

    const slug = params.project;
    const accessToken = await locals.getAccessToken();

    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/value-mappings/bulk`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          local_value: localValue,
          column_name: columnName,
          concept_uri: conceptUri,
          vocabulary: vocabulary || null,
          confidence,
          scope: "matching_value_and_column",
        }),
      },
    );
    if (!res.ok) return { error: `Failed: ${await res.text()}` };
    return { success: true, mappingAction: "bulk" };
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

  updateEmbargo: async ({ request, locals, params, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in" };

    const data = await request.formData();
    const embargoUntil = String(data.get("embargo_until") ?? "").trim();
    const embargoNote = String(data.get("embargo_note") ?? "");
    const locationPrecision = String(
      data.get("location_precision") ?? "exact",
    ).trim();

    const slug = params.project;
    const accessToken = await locals.getAccessToken();

    const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects/${slug}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        embargo_until: embargoUntil === "" ? "" : embargoUntil,
        embargo_note: embargoNote,
        location_precision: locationPrecision,
      }),
    });
    if (!res.ok) return { error: `Failed: ${await res.text()}` };
    return { success: true, embargoAction: "updated" };
  },

  linkQFieldCloud: async ({ request, locals, params, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in", qfieldAction: "link" };

    const data = await request.formData();
    const accountId = String(data.get("account_id") ?? "").trim();
    const qfcProjectId = String(data.get("qfc_project_id") ?? "").trim();
    const qfcProjectName = String(data.get("qfc_project_name") ?? "").trim();
    const gpkgName = String(data.get("gpkg_name") ?? "").trim();
    if (!accountId || !qfcProjectId) {
      return { error: "Account and Cloud project required.", qfieldAction: "link" };
    }

    const slug = params.project;
    const accessToken = await locals.getAccessToken();
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/qfieldcloud-link`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          account_id: accountId,
          qfc_project_id: qfcProjectId,
          qfc_project_name: qfcProjectName || undefined,
          gpkg_name: gpkgName || undefined,
        }),
      },
    );
    if (!res.ok) {
      return { error: `Failed: ${await res.text()}`, qfieldAction: "link" };
    }
    return { success: true, qfieldAction: "linked" };
  },

  unlinkQFieldCloud: async ({ locals, params, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in", qfieldAction: "unlink" };

    const slug = params.project;
    const accessToken = await locals.getAccessToken();
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/qfieldcloud-link`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!res.ok) {
      return { error: `Failed: ${await res.text()}`, qfieldAction: "unlink" };
    }
    return { success: true, qfieldAction: "unlinked" };
  },

  syncQFieldCloud: async ({ locals, params, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in", qfieldAction: "sync" };

    const slug = params.project;
    const accessToken = await locals.getAccessToken();
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/qfieldcloud-link/sync`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!res.ok) {
      return { error: `Failed: ${await res.text()}`, qfieldAction: "sync" };
    }
    return { success: true, qfieldAction: "sync_requested" };
  },
};
