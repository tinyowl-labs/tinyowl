import type { PageServerLoad, Actions } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";
import { redirect } from "@sveltejs/kit";

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

	if (role !== "owner" && role !== "admin" && role !== "collaborator") {
		throw redirect(303, `/${slug}`);
	}

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

	return {
		accessToken: accessToken ?? "",
		role,
		mappings,
		annotations,
		tables,
		slug,
	};
};

export const actions: Actions = {
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
};
